import { anchor_name_add } from "../layer/anchor-name.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import { list_active, list_enabled, list_items, list_page_item, list_step } from "../layer/list.ts";
import { outside_add, outside_controls } from "../layer/outside.ts";
import type { Placement } from "../layer/placement.ts";

export type ComboboxOptions = {
	placement: Placement;
	/**
	 * The controlled input text, or `undefined` for an uncontrolled input.
	 */
	value: string | undefined;
	setValue: ((value: string) => void) | undefined;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

/**
 * The input's show rules, like Ariakit's `showOnChange`, `showOnClick`, and `showOnKeyPress`.
 */
export type ComboboxInputSettings = {
	showOnChange: boolean;
	showOnClick: boolean;
	showOnKeyPress: boolean;
	autoSelect: boolean;
};

export type ComboboxController = ReturnType<typeof createCombobox>;

const OPTION_SELECTOR = '[role="option"]';

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

function is_element(target: EventTarget | null): target is Element {
	return is_node(target) && target.nodeType === 1;
}

/**
 * The state of one editable combobox. DOM focus stays in the input the whole time (virtual focus, like
 * Ariakit): the active option gets `data-active-item`, and the input gets `aria-activedescendant`. Only
 * `ComboboxPopover` subscribes. The controller writes the input's aria attributes to the DOM itself.
 *
 * The list can live in a `ComboboxPopover` (a `popover="manual"` element placed with CSS anchor
 * positioning), or inline with `open` kept true, with no popover at all.
 */
export function createCombobox(initial: ComboboxOptions) {
	const anchorName = `--np-combobox-${++next_anchor_id}`;
	let options = initial;
	// Start closed even when controlled open. The first configure() opens it.
	let open = false;
	let input: HTMLInputElement | null = null;
	let settings: ComboboxInputSettings = {
		showOnChange: true,
		showOnClick: true,
		showOnKeyPress: true,
		autoSelect: false,
	};
	let label: HTMLLabelElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	let list: HTMLElement | null = null;
	const cancels = new Set<HTMLElement>();
	// What `ComboboxPopover` renders from. A new object on each change, so useSyncExternalStore and the
	// React Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement, list: false };
	let shown: { anchor: HTMLElement; positioner: HTMLElement; hide: () => void } | null = null;
	const listeners = new Set<() => void>();
	const active = list_active(() => input);
	// autoSelect: after a text change, the first option becomes active, until a navigation key.
	let autoSelectArmed = false;
	let listObserver: MutationObserver | null = null;
	let lastPoint: { x: number; y: number } | null = null;

	function notify() {
		snapshot = { open, placement: options.placement, list: !!list };
		for (const listener of listeners) listener();
	}

	/**
	 * The listbox: a `ComboboxList`, or the popover content when it holds the options itself.
	 */
	function listbox() {
		return list ?? content;
	}

	/**
	 * The input, the positioner, and an element whose `aria-controls` names the list or the input (a
	 * `ComboboxCancel`, a filter button) count as inside, like Ariakit.
	 */
	function inside(target: EventTarget | null) {
		return (
			is_node(target) &&
			(!!input?.contains(target) ||
				!!positioner?.contains(target) ||
				outside_controls(target, [content?.id, list?.id, input?.id]))
		);
	}

	/**
	 * True while a modal above the list made it inert. Same rule as the popover and the menu.
	 */
	function covered() {
		return !!positioner?.closest("[inert]") && !!input?.checkVisibility();
	}

	// #region items
	function items() {
		const root = listbox();
		return list_items({
			container: root,
			selector: OPTION_SELECTOR,
			owns: (item) => item.closest('[role="listbox"]') === root,
		});
	}

	function enabledItems() {
		return list_enabled(items());
	}

	function levelItem(target: EventTarget | null) {
		if (!is_element(target)) return null;
		const item = target.closest<HTMLElement>(OPTION_SELECTOR);
		return item && item.closest('[role="listbox"]') === listbox() ? item : null;
	}

	function move(item: HTMLElement | undefined) {
		if (item === undefined) return;
		active.set(item, true);
	}
	// #endregion items

	/**
	 * Write the input's aria attributes. React does not own them, so the input does not render on open,
	 * close, or a key.
	 */
	function writeAria() {
		if (input) {
			input.setAttribute("aria-expanded", open ? "true" : "false");
			// A separate `ComboboxList` makes the popover content a dialog, and the input points at that
			// dialog. When the popover is the list itself, or the list is inline, the input points at the listbox.
			const dialog = !!positioner && !!list && !!content;
			input.setAttribute("aria-haspopup", dialog ? "dialog" : "listbox");
			const controlled = (dialog ? content : listbox())?.id;
			if (controlled && (open || !positioner)) input.setAttribute("aria-controls", controlled);
			else input.removeAttribute("aria-controls");
			if (label) {
				label.htmlFor = input.id;
				if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) {
					input.setAttribute("aria-labelledby", label.id);
				}
			}
		}
		for (const cancel of cancels) {
			if (input?.id) cancel.setAttribute("aria-controls", input.id);
		}
	}

	/**
	 * Watch the list while it is shown. The caller filters the options in React, so they change after a
	 * text change. Keep the active option valid, and let autoSelect pick the first option of the new list.
	 */
	function watchList() {
		listObserver?.disconnect();
		listObserver = null;
		const root = listbox();
		if (!open || !root) return;
		listObserver = new MutationObserver(() => {
			const current = active.get();
			if (autoSelectArmed) active.set(enabledItems()[0] ?? null, true);
			else if (current && !current.isConnected) active.set(null, false);
		});
		listObserver.observe(root, { childList: true, subtree: true });
	}

	// #region show
	/**
	 * Show the list while it is open and both elements are in the document.
	 */
	function sync() {
		const nextAnchor = open && input?.isConnected ? input : null;
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
			// A closed popover that stays mounted has `hidden`, like Ariakit. Take it off before the show.
			shownPositioner.hidden = false;
			// No `source`: it would put the popup right after the input in the Tab order. Focus stays in
			// the input, so Tab must go to the next element in the DOM, like Ariakit (a filter button).
			if (!shownPositioner.matches(":popover-open")) shownPositioner.showPopover();

			const removeLayer = layer_stack_add(win, { escape });
			const removeOutside = outside_add(doc, { inside, covered, close: () => request(false) });

			// Paint one frame without data-enter so a CSS enter transition can run.
			let frame = win.requestAnimationFrame(() => {
				frame = win.requestAnimationFrame(() => {
					content?.setAttribute("data-enter", "");
				});
			});

			shown = {
				anchor: shownAnchor,
				positioner: shownPositioner,
				hide: () => {
					win.cancelAnimationFrame(frame);
					content?.removeAttribute("data-enter");
					removeOutside();
					removeLayer();
					removeAnchorName();
					if (shownPositioner.matches(":popover-open")) shownPositioner.hidePopover();
					shownPositioner.hidden = true;
				},
			};
		}
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;
		if (!value) {
			// Focus can sit on a control inside the popup, such as a `<details>` summary. Give it back to the
			// input before the popup hides, so it does not fall to the page body. An outside click already
			// moved focus away, so this skips it.
			if (positioner?.contains(positioner.ownerDocument.activeElement)) input?.focus({ preventScroll: true });
			active.set(null, false);
			autoSelectArmed = false;
			lastPoint = null;
		}
		writeAria();
		sync();
		watchList();
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled combobox applies it. `setOpen` always hears about it,
	 * even when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean) {
		if (value === open) return;
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape() {
		if (!open || covered()) return false;
		request(false);
		return true;
	}
	// #endregion show

	// #region keys
	/**
	 * Enter with an active option picks it in the capture phase and marks the key as used, so the
	 * caller's own `onKeyDown` sees `defaultPrevented`, like Ariakit.
	 */
	function handleInputKeyDownCapture(event: KeyboardEvent) {
		if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || !open) return;
		const current = active.get();
		if (!current) return;
		event.preventDefault();
		current.click();
	}

	/**
	 * Keys in the input, after the caller's `onKeyDown`. The arrows loop through the input (last option,
	 * then no active option, then the first), like Ariakit's combobox. Home and End stay in the text.
	 */
	function handleInputKeyDown(event: KeyboardEvent) {
		if (event.isComposing) return;
		// Enter while open never submits a form around the input.
		if (event.key === "Enter" && open) event.preventDefault();
		if (event.defaultPrevented) return;

		if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "PageDown" && event.key !== "PageUp") {
			return;
		}
		if (!open) {
			if (!settings.showOnKeyPress || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
			event.preventDefault();
			request(true);
			return;
		}
		autoSelectArmed = false;
		const enabled = enabledItems();
		const current = active.get();
		const index = current ? enabled.indexOf(current) : -1;
		if (event.key === "PageDown" || event.key === "PageUp") {
			move(list_page_item({ list: enabled, from: current, step: event.key === "PageDown" ? 1 : -1, container: listbox() }));
		} else {
			const next = list_step({ length: enabled.length, index, key: event.key, loop: "through-owner" });
			if (next === -1) active.set(null, false);
			else if (next !== undefined) move(enabled[next]);
		}
		event.preventDefault();
	}

	/**
	 * A text change. `showOnChange` opens the list. With autoSelect, the first option of the new list
	 * becomes active once the caller has filtered it. Without it, the active option clears, like Ariakit.
	 */
	function inputChanged(text: string, composing: boolean) {
		options.setValue?.(text);
		if (composing) return;
		if (settings.showOnChange) request(true);
		if (settings.autoSelect) {
			autoSelectArmed = true;
			queueMicrotask(() => {
				if (autoSelectArmed && open) active.set(enabledItems()[0] ?? null, true);
			});
		} else {
			active.set(null, false);
		}
	}

	// #endregion keys

	// #region pointer
	/**
	 * A press on the input. `showOnClick` opens the list before the release, and the active option
	 * clears, like Ariakit.
	 */
	function handleInputMouseDown(event: MouseEvent) {
		if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
		active.set(null, false);
		if (settings.showOnClick) request(true);
	}

	/**
	 * Hover moves the active option, for a mouse or a pen, and never scrolls the list.
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
	 * A press in the list keeps DOM focus in the input, so the user can go on typing after a pick. A text
	 * field or a `<details>` summary in the popup still takes focus.
	 */
	function handleListMouseDown(event: MouseEvent) {
		if (!is_element(event.target)) return;
		if (event.target.closest("input, textarea, summary, [contenteditable]:not([contenteditable='false'])")) return;
		event.preventDefault();
	}
	// #endregion pointer

	const combobox = {
		/**
		 * The anchor-name the input gets while the list is open.
		 */
		anchorName,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(next: ComboboxOptions) {
			const placementChanged = options.placement !== next.placement;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (placementChanged) notify();
		},
		request,
		/**
		 * An option click. `setValueOnClick` writes the option value into the text, `hideOnClick` closes.
		 */
		pick(args: {
			value: string | undefined;
			setValue: boolean;
			hide: boolean;
		}) {
			const { value, setValue, hide } = args;

			if (setValue && value !== undefined) {
				// An uncontrolled input keeps its text in the DOM.
				if (options.value === undefined && input) input.value = value;
				options.setValue?.(value);
			}
			if (hide) request(false);
		},
		/**
		 * Clear the text, keep the list open, and keep focus in the input, like Ariakit's ComboboxCancel.
		 */
		clear() {
			if (options.value === undefined && input) input.value = "";
			options.setValue?.("");
			active.set(null, false);
			input?.focus();
		},
		registerInput(element: HTMLInputElement | null, nextSettings: ComboboxInputSettings) {
			settings = nextSettings;
			if (element) {
				input = element;
				writeAria();
				sync();
				return;
			}
			input = null;
			// A replacement input can attach later in the same commit. Close only when none came back.
			queueMicrotask(() => {
				if (!input) request(false);
				sync();
			});
		},
		registerLabel(element: HTMLLabelElement | null) {
			label = element;
			writeAria();
		},
		/**
		 * Add or remove a `ComboboxCancel`. It is a set, not one slot like the input, because a caller can
		 * render more than one clear button.
		 */
		registerCancel(element: HTMLElement, add: boolean) {
			if (add) cancels.add(element);
			else cancels.delete(element);
			writeAria();
		},
		registerList(element: HTMLElement | null) {
			list = element;
			writeAria();
			watchList();
			notify();
		},
		unregisterItem(item: HTMLElement) {
			if (active.get() === item) active.set(null, false);
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			if (element) {
				// React attaches this parent ref after the content and list refs, so write the aria again.
				writeAria();
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
			watchList();
		},
		handleInputKeyDownCapture,
		handleInputKeyDown,
		handleInputMouseDown,
		inputChanged,
		handlePointerMove,
		handlePointerLeave,
		handleListMouseDown,
		destroy() {
			// A remount after Fast Refresh must start closed.
			applyOpen(false);
			listObserver?.disconnect();
			listObserver = null;
			sync();
			writeAria();
			notify();
		},
	};

	return combobox;
}
