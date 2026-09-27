import { anchor_name_add } from "../layer/anchor-name.ts";
import { focus_is_focusable } from "../layer/focus.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import { list_active, list_enabled, list_items, list_page_item, list_step } from "../layer/list.ts";
import { outside_add, outside_controls } from "../layer/outside.ts";
import { placement_side, type Placement } from "../layer/placement.ts";
import { typeahead_is_key, typeahead_next, typeahead_normalize, typeahead_text } from "../layer/typeahead.ts";

export type SelectValue = string | readonly string[];

export type SelectOptions = {
	placement: Placement;
	/**
	 * The controlled value, or `undefined` for an uncontrolled select.
	 */
	value: SelectValue | undefined;
	setValue: ((value: SelectValue) => void) | undefined;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

/**
 * A virtual anchor in viewport pixels, such as a text caret.
 */
export type SelectAnchorRect = { x: number; y: number; width: number; height: number };

/**
 * How the list opened. `pointer` makes the selected option active. The keyboard reasons do the same,
 * and with no selected option they make the first or the last option active.
 */
type SelectOpenReason = "pointer" | "keyboard-first" | "keyboard-last";

/**
 * Why the list closes. Focus restore reads it.
 * - `toggle`, `escape`, `select`: focus goes back to the trigger.
 * - `outside`: a click or a right click outside. Focus stays where the user put it.
 * - `focus`: focus already moved outside, and stays there.
 */
type SelectCloseReason = "toggle" | "escape" | "select" | "outside" | "focus";

export type SelectController = ReturnType<typeof createSelect>;

const OPTION_SELECTOR = '[role="option"]';

/**
 * Typeahead characters join into one search while each key comes within this time (Ariakit).
 */
const TYPEAHEAD_RESET = 500;

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

function is_element(target: EventTarget | null): target is Element {
	return is_node(target) && target.nodeType === 1;
}

/**
 * The state of one select. Opening, closing, a key, a hover, and a value change render only
 * `SelectPopover`: the controller writes the trigger's aria attributes, the active option
 * (`data-active-item`, `aria-activedescendant`), and each option's `aria-selected` to the DOM itself.
 *
 * Focus is virtual, like Ariakit. Without a search input, DOM focus stays on the listbox. With a
 * `SelectSearch`, it stays in the search input, and the popover content is a `role="dialog"` around a
 * `SelectList`.
 */
export function createSelect(initial: SelectOptions, defaultValue: SelectValue) {
	const anchorName = `--np-select-${++next_anchor_id}`;
	let options = initial;
	// The value of an uncontrolled select.
	let ownValue = defaultValue;
	// Start closed even when controlled open. The first configure() opens it.
	let open = false;
	let openReason: SelectOpenReason = "pointer";
	// The last close request. A controlled parent can apply it a render later. Cleared on open.
	let closeReason: SelectCloseReason | null = null;
	let trigger: HTMLElement | null = null;
	let label: HTMLElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	let search: { input: HTMLInputElement; autoSelect: boolean; controlled: boolean } | null = null;
	let list: HTMLElement | null = null;
	let autoFocusOnShow = true;
	// The `position: fixed` span a virtual anchor rect uses. It lives in body, like the menu's point.
	let point: HTMLElement | null = null;
	// What `SelectPopover` renders from. A new object on each change, so useSyncExternalStore and the
	// React Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement, search: false };
	let shown: { anchor: HTMLElement; positioner: HTMLElement; hide: () => void } | null = null;
	const listeners = new Set<() => void>();
	const activeListeners = new Set<() => void>();
	const values = new WeakMap<HTMLElement, string>();
	const active = list_active(owner, () => {
		for (const listener of activeListeners) listener();
	});
	let typeaheadBuffer = "";
	let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
	let spaceItem: HTMLElement | null = null;
	// autoSelect: after a text change, the first option becomes active, until a navigation key.
	let autoSelectArmed = false;
	let listObserver: MutationObserver | null = null;
	let lastPoint: { x: number; y: number } | null = null;
	// A select with no trigger (a picker at the text caret) gives focus back to what had it before it
	// opened, like Ariakit.
	let focusBeforeOpen: HTMLElement | null = null;
	let closeRequestedNow = false;

	function notify() {
		snapshot = { open, placement: options.placement, search: !!search };
		for (const listener of listeners) listener();
	}

	function currentValue() {
		return options.value !== undefined ? options.value : ownValue;
	}

	function multiple() {
		return Array.isArray(currentValue());
	}

	function isSelected(value: string | undefined) {
		if (value === undefined) return false;
		const current = currentValue();
		return Array.isArray(current) ? current.includes(value) : current === value;
	}

	/**
	 * The element that keeps DOM focus and gets `aria-activedescendant`.
	 */
	function owner() {
		return search?.input ?? content;
	}

	/**
	 * The listbox: the `SelectList` in search mode, else the popover content.
	 */
	function listbox() {
		return search ? list : content;
	}

	function anchor() {
		return point ?? trigger;
	}

	/**
	 * The trigger, the positioner, and an element whose `aria-controls` names the popup count as inside.
	 */
	function inside(target: EventTarget | null) {
		return (
			is_node(target) &&
			(!!trigger?.contains(target) ||
				!!positioner?.contains(target) ||
				outside_controls(target, [content?.id, list?.id]))
		);
	}

	/**
	 * True while a modal above the list made it inert. Same rule as the popover and the menu.
	 */
	function covered() {
		return !!positioner?.closest("[inert]") && !!anchor()?.checkVisibility();
	}

	// #region items
	function items() {
		const root = listbox();
		return list_items(root, OPTION_SELECTOR, (item) => item.closest('[role="listbox"]') === root);
	}

	function enabledItems() {
		return list_enabled(items());
	}

	function levelItem(target: EventTarget | null) {
		if (!is_element(target)) return null;
		const item = target.closest<HTMLElement>(OPTION_SELECTOR);
		return item && item.closest('[role="listbox"]') === listbox() ? item : null;
	}

	function selectedItem() {
		return items().find((item) => isSelected(values.get(item))) ?? null;
	}

	/**
	 * Write `aria-selected` on every option, and `aria-multiselectable` on the listbox. React does not
	 * own them, so a value change does not render the options.
	 */
	function writeSelected() {
		const root = listbox();
		if (root) {
			if (multiple()) root.setAttribute("aria-multiselectable", "true");
			else root.removeAttribute("aria-multiselectable");
		}
		for (const item of items()) {
			item.setAttribute("aria-selected", isSelected(values.get(item)) ? "true" : "false");
		}
	}

	function move(item: HTMLElement | undefined | null) {
		if (item === undefined) return;
		active.set(item, true);
	}
	// #endregion items

	/**
	 * Write the trigger's and the list's aria attributes. React does not own them, so the trigger does not
	 * render on open or close.
	 */
	function writeAria() {
		const labelId = label?.id ?? null;
		if (trigger) {
			trigger.setAttribute("aria-expanded", open ? "true" : "false");
			trigger.setAttribute("aria-haspopup", search ? "dialog" : "listbox");
			// Like Ariakit, point at the popup only while it is in the DOM.
			if (content?.id) trigger.setAttribute("aria-controls", content.id);
			else trigger.removeAttribute("aria-controls");
			// A combobox never takes its name from its content, so a `SelectLabel` names it.
			if (labelId && !trigger.hasAttribute("aria-label")) trigger.setAttribute("aria-labelledby", labelId);
		}
		const root = listbox();
		if (root && labelId && !root.hasAttribute("aria-label") && !root.hasAttribute("aria-labelledby")) {
			root.setAttribute("aria-labelledby", labelId);
		}
		if (search) {
			search.input.setAttribute("aria-expanded", open ? "true" : "false");
			if (list?.id) search.input.setAttribute("aria-controls", list.id);
			else search.input.removeAttribute("aria-controls");
		}
	}

	// #region show
	/**
	 * Show the list while it is open and both elements are in the document.
	 */
	function sync() {
		const currentAnchor = anchor();
		const nextAnchor = open && currentAnchor?.isConnected ? currentAnchor : null;
		const nextPositioner = open && positioner?.isConnected ? positioner : null;

		if (shown && (shown.anchor !== nextAnchor || shown.positioner !== nextPositioner)) {
			shown.hide();
			shown = null;
		}

		if (!shown && nextAnchor && nextPositioner) {
			const shownAnchor = nextAnchor;
			const shownPositioner = nextPositioner;
			const doc = shownAnchor.ownerDocument;
			const win = doc.defaultView!;
			const removeAnchorName = anchor_name_add(shownAnchor, anchorName);
			// A closed popover that stays mounted has `hidden`, like Ariakit. Take it off before the show, so
			// focus can move in during this task; SelectPopover renders it away too.
			shownPositioner.hidden = false;
			// `source` ties the list to its trigger for focus order: Tab from the list goes to the element
			// after the trigger, and the outside rule then closes it.
			if (!shownPositioner.matches(":popover-open")) shownPositioner.showPopover({ source: trigger ?? shownAnchor });

			const removeLayer = layer_stack_add(win, { escape });
			const removeOutside = outside_add(doc, {
				inside,
				covered,
				close: (reason) => request(false, reason),
			});

			// Paint one frame without data-enter so a CSS enter transition can run.
			let frame = win.requestAnimationFrame(() => {
				frame = win.requestAnimationFrame(() => {
					content?.setAttribute("data-enter", "");
				});
			});

			queueMicrotask(() => {
				if (shown?.positioner !== shownPositioner) return;
				focusOnOpen();
			});

			shown = {
				anchor: shownAnchor,
				positioner: shownPositioner,
				hide: () => {
					win.cancelAnimationFrame(frame);
					listObserver?.disconnect();
					listObserver = null;
					content?.removeAttribute("data-enter");
					removeOutside();
					removeLayer();
					removeAnchorName();
					if (shownPositioner.matches(":popover-open")) shownPositioner.hidePopover();
					shownPositioner.hidden = true;
				},
			};
			watchList();
		}
	}

	/**
	 * Watch the list while it is shown. The caller filters the options in React, so they change after a
	 * text change. Keep the active option valid, and let autoSelect pick the first option of the new list.
	 * A caller can also swap the list for a "No results" message and back, so watch the new element.
	 */
	function watchList() {
		listObserver?.disconnect();
		listObserver = null;
		const root = listbox();
		if (!shown || !root) return;
		listObserver = new MutationObserver(() => {
			const current = active.get();
			if (autoSelectArmed) active.set(enabledItems()[0] ?? null, true);
			else if (current && !current.isConnected) active.set(null, false);
			writeSelected();
		});
		listObserver.observe(root, { childList: true, subtree: true });
	}

	/**
	 * Move focus in after the current event, like Ariakit, and make the selected option active. With no
	 * selected option, a keyboard open makes the first (or the last) option active. With a search input,
	 * focus goes to the input and no option is active, like Ariakit's search select. With
	 * `autoFocusOnShow` off, focus stays on the trigger.
	 */
	function focusOnOpen() {
		const focusOwner = owner();
		if (!focusOwner) return;
		writeSelected();
		if (search) {
			if (focusOwner.ownerDocument.activeElement !== focusOwner) focusOwner.focus({ preventScroll: true });
			return;
		}
		// Focus stays on the trigger, so no option is active until an arrow key moves into the list.
		if (!autoFocusOnShow) return;
		if (!focusOwner.contains(focusOwner.ownerDocument.activeElement)) focusOwner.focus({ preventScroll: true });
		const selected = selectedItem();
		const enabled = enabledItems();
		if (selected && selected.getAttribute("aria-disabled") !== "true") active.set(selected, true);
		else if (openReason === "keyboard-first") active.set(enabled[0] ?? null, true);
		else if (openReason === "keyboard-last") active.set(enabled.at(-1) ?? null, true);
	}

	/**
	 * Where focus goes when the list closes. It runs before the list hides, so focus never falls back to
	 * the page body. Ariakit's rule: focus that already moved to another element outside stays there.
	 */
	function restoreFocus() {
		const doc = positioner?.ownerDocument ?? trigger?.ownerDocument;
		const target = trigger ?? (focusBeforeOpen?.isConnected ? focusBeforeOpen : null);
		focusBeforeOpen = null;
		if (!doc || !target || closeReason === "outside" || closeReason === "focus") return;
		const focused = doc.activeElement;
		const focusInside = !!positioner?.contains(focused);
		if (focused && !focusInside && focused !== target && focus_is_focusable(focused)) return;
		target.focus({ preventScroll: true });
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;
		if (value) {
			closeReason = null;
			if (!trigger) {
				const focused = (positioner ?? point)?.ownerDocument.activeElement ?? document.activeElement;
				focusBeforeOpen = focused instanceof HTMLElement ? focused : null;
			}
		} else {
			restoreFocus();
			active.set(null, false);
			clearTimeout(typeaheadTimer);
			typeaheadBuffer = "";
			autoSelectArmed = false;
			lastPoint = null;
			// An uncontrolled search starts empty on the next open. The caller resets its filter on close.
			if (search && !search.controlled) search.input.value = "";
		}
		writeAria();
		sync();
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled list applies it. `setOpen` always hears about it, even
	 * when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean, reason: SelectOpenReason | SelectCloseReason) {
		if (value) {
			openReason = reason as SelectOpenReason;
			if (open) return;
		} else {
			if (!open) return;
			closeReason = reason as SelectCloseReason;
			// A caller can unmount the select right after this request, such as a picker that goes away
			// on Escape. React renders that before any timer, so destroy() keeps the reason only until then.
			closeRequestedNow = true;
			setTimeout(() => {
				closeRequestedNow = false;
			});
		}
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape(event: KeyboardEvent) {
		if (!open || covered()) return false;
		// A press inside the popup goes to its own key handler, after the handlers inside it, so a
		// control that uses Escape first can keep the list open.
		if (is_node(event.target) && positioner?.contains(event.target)) return false;
		request(false, "escape");
		return true;
	}
	// #endregion show

	// #region value
	/**
	 * Pick an option value. A multi-value select adds or removes it. A single select replaces the value.
	 */
	function pick(value: string) {
		const current = currentValue();
		const next: SelectValue = Array.isArray(current)
			? current.includes(value)
				? current.filter((item) => item !== value)
				: [...current, value]
			: value;
		if (options.value === undefined) {
			ownValue = next;
			writeSelected();
		}
		options.setValue?.(next);
	}
	// #endregion value

	// #region keys
	function typeaheadMatch(event: KeyboardEvent, from: HTMLElement | null) {
		clearTimeout(typeaheadTimer);
		if (!typeahead_is_key(event, typeaheadBuffer)) {
			typeaheadBuffer = "";
			return undefined;
		}
		const enabled = enabledItems();
		const texts = enabled.map((item) => typeahead_normalize(typeahead_text(item)));
		const next = typeahead_next(texts, from ? enabled.indexOf(from) : -1, typeaheadBuffer, event.key);
		typeaheadBuffer = next.buffer;
		typeaheadTimer = setTimeout(() => {
			typeaheadBuffer = "";
		}, TYPEAHEAD_RESET);
		event.preventDefault();
		return next.index === -1 ? null : enabled[next.index]!;
	}

	/**
	 * The arrow key that points toward the list opens it, like Ariakit. `left` and `right` are logical,
	 * so in RTL they swap.
	 */
	function openKeyReason(event: KeyboardEvent, element: HTMLElement): SelectOpenReason | null {
		let side = placement_side(options.placement);
		if (getComputedStyle(element).direction === "rtl") {
			if (side === "right") side = "left";
			else if (side === "left") side = "right";
		}
		if (side === "top" || side === "bottom") {
			if (event.key === "ArrowDown") return "keyboard-first";
			if (event.key === "ArrowUp") return "keyboard-last";
			return null;
		}
		if (side === "right" && event.key === "ArrowRight") return "keyboard-first";
		if (side === "left" && event.key === "ArrowLeft") return "keyboard-first";
		return null;
	}

	/**
	 * Keys on the trigger. Enter and Space click the trigger button, so the click handler toggles.
	 */
	function handleTriggerKeyDown(event: KeyboardEvent, typeahead: boolean) {
		if (event.defaultPrevented || event.isComposing) return;
		const element = event.currentTarget as HTMLElement;

		// With autoFocusOnShow off, focus stays on the trigger while the list is open. The arrows move
		// focus into the list and make the first or the last option active in one press. Typeahead moves
		// the active option there too. It does not pick while the list is open.
		if (open) {
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
				if (!typeahead || event.key === " ") return;
				const match = typeaheadMatch(event, active.get());
				// Move focus into the list with the match, like the arrows, so Enter picks it.
				if (match) {
					owner()?.focus({ preventScroll: true });
					move(match);
				}
				return;
			}
			event.preventDefault();
			// The focus owner is the listbox, or the search input in a search select.
			owner()?.focus({ preventScroll: true });
			const enabled = enabledItems();
			const next = list_step(enabled.length, active.get() ? enabled.indexOf(active.get()!) : -1, event.key, "none");
			if (next !== undefined) move(enabled[next]);
			return;
		}

		const reason = openKeyReason(event, element);
		if (reason) {
			event.preventDefault();
			request(true, reason);
			return;
		}

		// Typeahead on a closed select changes the value without opening it, like a native select and
		// like Ariakit. It needs the options in the DOM, so an unmountOnHide list does not do it. Like
		// Ariakit, it never changes the value of a multi-value select.
		if (!typeahead || event.key === " " || multiple()) return;
		const match = typeaheadMatch(event, selectedItem());
		const value = match ? values.get(match) : undefined;
		if (value !== undefined && !isSelected(value)) pick(value);
	}

	/**
	 * Keys in the list (no search input). DOM focus is on the listbox.
	 */
	function handleContentKeyDown(event: KeyboardEvent) {
		// Only keys on the listbox itself. A focused control inside an option, such as a row action
		// button, keeps Enter and Space for itself.
		if (!content || search || event.target !== content || event.defaultPrevented || event.isComposing) return;

		// Space is a typeahead character only inside a running search. Otherwise it picks.
		if (event.key !== " " || typeaheadBuffer) {
			const match = typeaheadMatch(event, active.get());
			if (match !== undefined) {
				if (match) move(match);
				return;
			}
		}

		const enabled = enabledItems();
		const current = active.get();
		const index = current ? enabled.indexOf(current) : -1;

		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp":
			case "Home":
			case "End": {
				// No loop at the ends, like Ariakit's select.
				const next = list_step(enabled.length, index, event.key, "none");
				if (next !== undefined) move(enabled[next]);
				break;
			}
			case "PageDown":
				move(list_page_item(enabled, current, 1, content));
				break;
			case "PageUp":
				move(list_page_item(enabled, current, -1, content));
				break;
			case "Enter":
				// Enter with no active option closes the list, like Ariakit's `hideOnEnter`.
				if (current) current.click();
				else request(false, "select");
				break;
			case " ":
				// Pick on keyup, like a native button. Stop the page from scrolling now.
				spaceItem = current;
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function handleContentKeyUp(event: KeyboardEvent) {
		if (event.key !== " " || search || event.target !== content) return;
		const item = spaceItem;
		spaceItem = null;
		if (event.defaultPrevented) return;
		event.preventDefault();
		if (!item) request(false, "select");
		else if (item === active.get()) item.click();
	}

	/**
	 * Keys in the search input. DOM focus stays in the input. The arrows loop through the input, like
	 * Ariakit's combobox. Home and End stay in the text until an option is active.
	 */
	function handleSearchKeyDown(event: KeyboardEvent) {
		if (!search || event.defaultPrevented || event.isComposing) return;
		const enabled = enabledItems();
		const current = active.get();
		const index = current ? enabled.indexOf(current) : -1;

		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp": {
				autoSelectArmed = false;
				const next = list_step(enabled.length, index, event.key, "through-owner");
				if (next === -1) active.set(null, false);
				else if (next !== undefined) move(enabled[next]);
				break;
			}
			case "Home":
			case "End":
				if (!current) return;
				autoSelectArmed = false;
				move(enabled[list_step(enabled.length, index, event.key, "none")!]);
				break;
			case "PageDown":
			case "PageUp":
				if (!current) return;
				autoSelectArmed = false;
				move(list_page_item(enabled, current, event.key === "PageDown" ? 1 : -1, list));
				break;
			case "Enter":
				// Enter never submits a form around the search input, like Ariakit's combobox.
				current?.click();
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	/**
	 * Escape on the popup, after the handlers inside it.
	 */
	function handlePopupKeyDown(event: KeyboardEvent) {
		if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
		event.preventDefault();
		request(false, "escape");
	}
	// #endregion keys

	// #region pointer
	/**
	 * Hover moves the active option, for a mouse or a pen. A touch never hovers: a tap clicks. Hover never
	 * scrolls the list, and focus stays where it is.
	 */
	function handlePointerMove(event: PointerEvent) {
		if (event.pointerType === "touch") return;
		// Browsers send a pointermove when the list scrolls under a still pointer. Ignore it, like Ariakit.
		if (lastPoint && lastPoint.x === event.clientX && lastPoint.y === event.clientY) return;
		lastPoint = { x: event.clientX, y: event.clientY };
		const item = levelItem(event.target);
		if (item?.getAttribute("aria-disabled") === "true") return;
		if (item === active.get()) return;
		// The user picked a row with the pointer, so a later list change must not move back to the first.
		if (item) autoSelectArmed = false;
		active.set(item, false);
	}

	function handlePointerLeave(event: PointerEvent) {
		if (event.pointerType === "touch") return;
		lastPoint = null;
		active.set(null, false);
	}

	/**
	 * A press inside the popup keeps DOM focus on the focus owner (the listbox or the search input), so
	 * `aria-activedescendant` stays on the focused element. A text field inside still takes focus.
	 */
	function handleMouseDown(event: MouseEvent) {
		if (!is_element(event.target)) return;
		if (event.target.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;
		event.preventDefault();
	}
	// #endregion pointer

	const select = {
		/**
		 * The anchor-name the anchor gets while the list is open.
		 */
		anchorName,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * The value of the active option, for `SelectItem.useActive`.
		 */
		getActiveValue: () => {
			const item = active.get();
			return item ? (values.get(item) ?? null) : null;
		},
		subscribeActive: (listener: () => void) => {
			activeListeners.add(listener);
			return () => {
				activeListeners.delete(listener);
			};
		},
		configure(next: SelectOptions) {
			const placementChanged = options.placement !== next.placement;
			const valueChanged = options.value !== next.value;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (valueChanged) writeSelected();
			if (placementChanged) notify();
		},
		request,
		isMultiple: multiple,
		pick,
		/**
		 * Toggle from a trigger click. A click from Enter or Space has no detail.
		 */
		toggle(keyboard: boolean) {
			if (open) request(false, "toggle");
			else request(true, keyboard ? "keyboard-first" : "pointer");
		},
		configurePopover(next: { autoFocusOnShow: boolean; anchorRect: SelectAnchorRect | null }) {
			autoFocusOnShow = next.autoFocusOnShow;
			// An unmountOnHide list with no trigger has no element yet, so use the global document.
			const doc = (positioner ?? trigger)?.ownerDocument ?? document;
			if (next.anchorRect) {
				if (!point) {
					point = doc.body.appendChild(doc.createElement("span"));
					point.className = "np-SelectPoint";
					point.setAttribute("aria-hidden", "true");
				}
				point.style.left = `${next.anchorRect.x}px`;
				point.style.top = `${next.anchorRect.y}px`;
				point.style.width = `${next.anchorRect.width}px`;
				point.style.height = `${next.anchorRect.height}px`;
				sync();
			} else if (!next.anchorRect && point) {
				point.remove();
				point = null;
				sync();
			}
		},
		registerTrigger(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				trigger = element;
				writeAria();
				sync();
				return;
			}
			if (trigger !== previous) return;
			trigger = null;
			// A replacement trigger can attach later in the same commit. Close only when none came back and
			// no virtual anchor holds the list.
			queueMicrotask(() => {
				if (!trigger && !point) request(false, "focus");
				sync();
			});
		},
		registerLabel(element: HTMLElement | null) {
			label = element;
			writeAria();
		},
		/**
		 * A click on the label focuses the trigger, like Ariakit's `SelectLabel`.
		 */
		focusTrigger() {
			trigger?.focus();
		},
		registerSearch(input: HTMLInputElement | null, settings: { autoSelect: boolean; controlled: boolean }) {
			search = input ? { input, ...settings } : null;
			writeAria();
			watchList();
			notify();
		},
		registerList(element: HTMLElement | null) {
			list = element;
			writeAria();
			writeSelected();
			watchList();
		},
		registerItem(item: HTMLElement, value: string) {
			values.set(item, value);
			item.setAttribute("aria-selected", isSelected(value) ? "true" : "false");
		},
		unregisterItem(item: HTMLElement) {
			if (active.get() === item) active.set(null, false);
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			if (element) {
				sync();
				return;
			}
			// StrictMode detaches and attaches a new ref in the same commit. Wait, so the list does not hide
			// and show again. A real unmount still hides it: the next sync finds no positioner.
			queueMicrotask(sync);
		},
		setContent(element: HTMLElement | null) {
			if (!element) active.set(null, false);
			content = element;
			writeAria();
			writeSelected();
			watchList();
		},
		/**
		 * A text change in the search input. With autoSelect, the first option of the new list becomes
		 * active once the caller has filtered it. Without, the active option clears, like Ariakit.
		 */
		searchChanged(composing: boolean) {
			if (!search || composing) return;
			if (search.autoSelect) {
				autoSelectArmed = true;
				queueMicrotask(() => {
					if (autoSelectArmed && open) active.set(enabledItems()[0] ?? null, true);
				});
			} else {
				active.set(null, false);
			}
		},
		handleTriggerKeyDown,
		handleContentKeyDown,
		handleContentKeyUp,
		handleSearchKeyDown,
		handlePopupKeyDown,
		handlePointerMove,
		handlePointerLeave,
		handleMouseDown,
		destroy() {
			// A remount after Fast Refresh must start closed. An unmount does not move focus, unless it comes
			// right after a close request: a caller that unmounts the select on Escape still gets focus back.
			// An older request, such as a close that a controlled parent refused, does not count.
			if (!closeRequestedNow) closeReason = "focus";
			applyOpen(false);
			clearTimeout(typeaheadTimer);
			point?.remove();
			point = null;
			sync();
			writeAria();
			notify();
		},
	};

	return select;
}
