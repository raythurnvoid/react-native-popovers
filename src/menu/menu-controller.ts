import { anchor_name_add } from "../layer/anchor-name.ts";
import { focus_is_focusable } from "../layer/focus.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import { outside_add } from "../layer/outside.ts";
import type { Placement } from "../layer/placement.ts";
import { MENU_GRACE_TIMEOUT, menu_grace_area, menu_grace_contains, type Point } from "./menu-grace.ts";
import { menu_typeahead_is_key, menu_typeahead_next, menu_typeahead_normalize } from "./menu-typeahead.ts";

export type MenuOptions = {
	placement: Placement;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

/**
 * How a menu opens. `pointer` focuses the menu with no active item. The keyboard reasons also make
 * the first or last item active. `hover` opens a submenu and leaves focus in the parent menu. A
 * mouse click on a submenu item opens with `hover` too, so focus stays in the parent like after a
 * hover.
 */
type MenuOpenReason = "pointer" | "keyboard-first" | "keyboard-last" | "hover";

/**
 * Why a menu closes. Focus restore reads it.
 * - `toggle`, `escape`, `select`: focus goes back to the button (or, in a submenu, to the parent menu).
 *   `escape` is Escape, the arrow key that closes a submenu, or a submenu that stops rendering.
 * - `outside`, `blur`: focus stays where the user put it.
 * - `focus`: focus already moved outside, and stays there.
 * - `sibling`: another item of the parent menu took over. `parent`: the parent menu is closing.
 */
type MenuCloseReason = "toggle" | "escape" | "select" | "outside" | "blur" | "focus" | "sibling" | "parent";

export type MenuController = ReturnType<typeof createMenu>;

/**
 * What one level calls on its parent or its submenus. A named type, because the controller type
 * cannot refer to itself in `createMenu`'s own parameter.
 */
type MenuLevel = {
	request: (value: boolean, reason: MenuCloseReason | MenuOpenReason) => void;
	root: () => MenuLevel;
	getButton: () => HTMLElement | null;
	getContent: () => HTMLElement | null;
	contains: (target: EventTarget | null) => boolean;
	registerChild: (item: HTMLElement, child: MenuLevel) => void;
	unregisterChild: (item: HTMLElement, child: MenuLevel) => void;
	childOpened: (child: MenuLevel) => void;
	childClosed: (child: MenuLevel) => void;
	focusItem: (item: HTMLElement | null) => void;
	openChildOf: (item: HTMLElement, reason: MenuOpenReason) => void;
};

type Shown = {
	positioner: HTMLElement;
	anchor: HTMLElement;
	removeAnchorName: () => void;
	hide: () => void;
};

const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';

/**
 * How long the pointer rests on a submenu item before the submenu opens (Ariakit and Astryx).
 */
const HOVER_OPEN_DELAY = 150;

/**
 * Typeahead characters join into one search while each key comes within this time (Ariakit).
 */
const TYPEAHEAD_RESET = 500;

/**
 * A text field inside a menu keeps DOM focus, its own keys, and the browser's own context menu. A
 * checkbox, radio, button, or range input takes no typing, so it is not a text field.
 */
const TEXT_FIELD_SELECTOR =
	"input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file], [type=image]), textarea, select, [contenteditable]:not([contenteditable='false'])";

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

function is_element(target: EventTarget | null): target is Element {
	return is_node(target) && target.nodeType === 1;
}

/**
 * The item text that typeahead matches: the text outside `aria-hidden="true"` elements. Ariakit
 * reads all of `textContent`, so a hidden icon or sample letter ("A" before "Purple") becomes the
 * first letter, and "p" never reaches Purple. The hidden text is not part of the item's name either.
 */
function typeahead_text(item: Element) {
	let text = "";
	const walker = item.ownerDocument.createTreeWalker(item, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			is_element(node) && node.getAttribute("aria-hidden") === "true"
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
	}
	return text;
}

/**
 * The state of one menu level: a root menu, or a submenu inside `parent`.
 *
 * Like the popover, opening and closing renders only `Menu`. The controller writes the button's aria
 * attributes, the active item (`data-active-item`), and `aria-activedescendant` to the DOM itself, so
 * the button and the items never render for a key press or a hover.
 *
 * Focus stays on the menu element (Ariakit's virtual focus). The active item is only marked, so the
 * menu element gets every key and this controller handles it.
 */
export function createMenu(initial: MenuOptions, parent: MenuLevel | null) {
	const anchorName = `--np-menu-${++next_anchor_id}`;
	let options = initial;
	// Start closed even when controlled open. The first configure() opens it.
	let open = false;
	// The MenuButton. In a submenu, it is the parent menu item that opens this menu.
	let button: HTMLElement | null = null;
	// Set while a context menu trigger opened the menu. `anchor` is where the menu shows: the point
	// element or the focused element. `disclosure` gets focus back on close.
	let context: { anchor: HTMLElement; disclosure: HTMLElement } | null = null;
	let pointAnchor: HTMLElement | null = null;
	let contextTriggers = 0;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	// What `Menu` renders from. A new object on each change, so useSyncExternalStore and the React
	// Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement };
	let openReason: MenuOpenReason = "pointer";
	let closeReason: MenuCloseReason | null = null;
	let shown: Shown | null = null;
	const listeners = new Set<() => void>();

	// Submenus, keyed by the item that opens them.
	const children = new Map<HTMLElement, MenuLevel>();
	let openChild: MenuLevel | null = null;

	let activeItem: HTMLElement | null = null;
	let typeaheadBuffer = "";
	let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
	let spaceItem: HTMLElement | null = null;
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	let hoverItem: HTMLElement | null = null;
	let lastPoint: Point | null = null;
	let lastX = 0;
	let pointerDirection: "left" | "right" = "right";
	// The last pointer point on an item. When it was the item of the open submenu, the grace area starts there.
	let lastItemPoint: { item: HTMLElement; point: Point } | null = null;
	let grace: { side: "left" | "right"; polygon: Point[]; timer: ReturnType<typeof setTimeout> } | null = null;
	// The trigger or button id that the content's `aria-labelledby` points at, when this controller wrote it.
	let labelledBy: string | null = null;

	function notify() {
		snapshot = { open, placement: options.placement };
		for (const listener of listeners) listener();
	}

	function anchor() {
		return context?.anchor ?? button;
	}

	function disclosure() {
		return context?.disclosure ?? button;
	}

	function root(): MenuLevel {
		return parent ? parent.root() : menu;
	}

	/**
	 * The button, the context menu trigger, and the positioner count as inside. Submenus are DOM
	 * children of their parent menu, so the root positioner holds every level.
	 */
	function inside(target: EventTarget | null) {
		return (
			is_node(target) &&
			(!!button?.contains(target) || !!disclosure()?.contains(target) || !!positioner?.contains(target))
		);
	}

	/**
	 * True while a modal above the menu made it inert. Same rule as the popover: the modal owns the
	 * input, and the menu stays open under it.
	 */
	function covered() {
		return !!positioner?.closest("[inert]") && !!anchor()?.checkVisibility();
	}

	/**
	 * Write the button's aria attributes and the menu's name. React does not own them, so the button does not
	 * render on open or close.
	 */
	function writeAria() {
		if (button) {
			// Like Ariakit, only the element that opened the menu is expanded. A context menu open leaves
			// the button of the same menu collapsed.
			button.setAttribute("aria-expanded", open && !context ? "true" : "false");
			// Like Ariakit, point at the menu only while it is in the DOM.
			if (content?.id) button.setAttribute("aria-controls", content.id);
			else button.removeAttribute("aria-controls");
		}
		// The element that opened the menu names it, like Ariakit, unless the caller named it. That is the
		// context menu trigger when it has an id, else the button. A new element has a new id, so update
		// a name that this controller wrote, and remove it when neither the trigger nor the button has an id.
		const labelId = context?.disclosure.id || button?.id || null;
		const current = content?.getAttribute("aria-labelledby") ?? null;
		if (content && !content.hasAttribute("aria-label") && (current === null || current === labelledBy)) {
			if (labelId) content.setAttribute("aria-labelledby", labelId);
			else content.removeAttribute("aria-labelledby");
			labelledBy = labelId;
		}
	}

	// #region items
	/**
	 * The items of this level, read from the DOM. Items of a submenu belong to the submenu, and
	 * hidden items (`display: none`) are skipped.
	 */
	function items() {
		if (!content) return [];
		return [...content.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
			(item) => item.closest('[role="menu"]') === content && item.checkVisibility(),
		);
	}

	function enabledItems() {
		return items().filter((item) => item.getAttribute("aria-disabled") !== "true");
	}

	function levelItem(target: EventTarget | null) {
		if (!is_element(target)) return null;
		const item = target.closest<HTMLElement>(ITEM_SELECTOR);
		return item && item.closest('[role="menu"]') === content ? item : null;
	}

	/**
	 * The text field that holds `target` in this level. A field around the whole menu, such as an
	 * editor root that the menu renders in, does not count.
	 */
	function levelTextField(target: Element) {
		const field = target.closest(TEXT_FIELD_SELECTOR);
		return field && field.closest('[role="menu"]') === content ? field : null;
	}

	function setActive(item: HTMLElement | null, scroll: boolean) {
		if (activeItem && activeItem !== item) activeItem.removeAttribute("data-active-item");
		activeItem = item;
		if (item) {
			item.setAttribute("data-active-item", "");
			if (item.id) content?.setAttribute("aria-activedescendant", item.id);
			if (scroll) item.scrollIntoView({ block: "nearest" });
		} else {
			content?.removeAttribute("aria-activedescendant");
		}
	}

	/**
	 * Move the active item with the keyboard. Moving it away from the item of an open submenu closes
	 * that submenu, like a hover on another item.
	 */
	function move(item: HTMLElement | undefined) {
		if (!item) return;
		if (openChild && item !== openChild.getButton()) openChild.request(false, "sibling");
		setActive(item, true);
	}

	/**
	 * The item one page away, like Ariakit's PageUp and PageDown: the farthest item that is still
	 * within one scroll-container height of the active item. At the end, it is the last item.
	 */
	function pageItem(list: HTMLElement[], step: 1 | -1) {
		const from = activeItem && list.includes(activeItem) ? activeItem : null;
		if (!from) return step > 0 ? list[0] : list.at(-1);
		let scroller: HTMLElement | null = from.parentElement;
		while (scroller && scroller !== content && scroller.scrollHeight <= scroller.clientHeight) {
			scroller = scroller.parentElement;
		}
		const page = (scroller ?? content ?? from).clientHeight;
		const fromTop = from.getBoundingClientRect().top;
		const start = list.indexOf(from);
		let target = from;
		for (let index = start + step; index >= 0 && index < list.length; index += step) {
			const item = list[index]!;
			if (Math.abs(item.getBoundingClientRect().top - fromTop) > page) break;
			target = item;
		}
		// An item taller than the page still moves one step.
		return target === from ? list[start + step] : target;
	}
	// #endregion items

	// #region submenus
	function cancelHoverOpen() {
		clearTimeout(hoverTimer);
		hoverItem = null;
	}

	function endGrace() {
		if (grace) clearTimeout(grace.timer);
		grace = null;
	}

	/**
	 * Open the submenu of `item`. A level has one open submenu, so another open one closes.
	 */
	function openChildOf(item: HTMLElement, reason: MenuOpenReason) {
		const child = children.get(item);
		if (!child) return;
		cancelHoverOpen();
		if (openChild && openChild !== child) openChild.request(false, "sibling");
		setActive(item, false);
		child.request(true, reason);
	}
	// #endregion submenus

	// #region show
	function syncAnchorName(nextAnchor: HTMLElement) {
		if (!shown || shown.anchor === nextAnchor) return;
		// A second right click moves the menu. Move the anchor name without hiding the popover, so
		// focus and the open state stay as they are.
		shown.removeAnchorName();
		shown.anchor = nextAnchor;
		shown.removeAnchorName = anchor_name_add(nextAnchor, anchorName);
	}

	/**
	 * Show the menu while it is open and both elements are in the document.
	 */
	function sync() {
		const currentAnchor = anchor();
		const nextAnchor = open && currentAnchor?.isConnected ? currentAnchor : null;
		const nextPositioner = open && positioner?.isConnected ? positioner : null;

		if (shown && (!nextAnchor || shown.positioner !== nextPositioner)) {
			shown.hide();
			shown = null;
		}

		if (shown && nextAnchor) syncAnchorName(nextAnchor);

		if (!shown && nextAnchor && nextPositioner) {
			const shownPositioner = nextPositioner;
			const doc = nextAnchor.ownerDocument;
			const win = doc.defaultView!;
			// `source` ties the menu to its button for focus order: Tab from the menu goes to the element
			// after the button, and the root's focus rule then closes the menu.
			if (!shownPositioner.matches(":popover-open")) {
				shownPositioner.showPopover({ source: disclosure() ?? nextAnchor });
			}

			const removeLayer = layer_stack_add(win, { escape });
			// Only the root listens for outside events. Every submenu is inside the root positioner.
			const removeOutside = parent
				? () => {}
				: outside_add(doc, {
						inside,
						covered,
						close: (reason) => request(false, reason),
					});

			// A context menu closes when the window loses focus, so it never stays open behind another window.
			const onBlur = () => request(false, "blur");
			const blurs = !parent && contextTriggers > 0;
			if (blurs) win.addEventListener("blur", onBlur);

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

			const entry: Shown = {
				positioner: shownPositioner,
				anchor: nextAnchor,
				removeAnchorName: anchor_name_add(nextAnchor, anchorName),
				hide: () => {
					win.cancelAnimationFrame(frame);
					content?.removeAttribute("data-enter");
					if (blurs) win.removeEventListener("blur", onBlur);
					removeOutside();
					removeLayer();
					// syncAnchorName() can replace this function while the menu is open.
					entry.removeAnchorName();
					if (shownPositioner.matches(":popover-open")) shownPositioner.hidePopover();
				},
			};
			shown = entry;
		}
	}

	/**
	 * Move focus in after the current event, like Ariakit. A submenu opened by hover leaves focus in
	 * its parent menu, so the pointer can go on without moving focus.
	 */
	function focusOnOpen() {
		if (!content) return;
		if (openReason === "hover") return;
		if (!content.contains(content.ownerDocument.activeElement)) content.focus({ preventScroll: true });
		if (openReason === "keyboard-first") setActive(enabledItems()[0] ?? null, true);
		if (openReason === "keyboard-last") setActive(enabledItems().at(-1) ?? null, true);
	}

	/**
	 * Where focus goes when this level closes. It runs before the menu hides, so focus never falls back
	 * to the page body.
	 */
	function restoreFocus() {
		const doc = content?.ownerDocument;
		if (!doc) return;
		const focusInside = !!positioner?.contains(doc.activeElement);

		if (parent) {
			// Escape, ArrowLeft, and a sibling hover go back to the parent menu, with this submenu's item
			// active. Only when focus was in this submenu: a text field in the parent keeps its focus.
			if ((closeReason === "escape" || closeReason === "sibling") && focusInside) {
				parent.focusItem(button);
			}
			return;
		}

		if (closeReason === "outside" || closeReason === "blur" || closeReason === "focus") return;
		const target = disclosure();
		if (!target) return;
		// Ariakit's rule: focus that already moved to another element outside the menu stays there.
		const active = doc.activeElement;
		if (active && !focusInside && focus_is_focusable(active)) return;
		target.focus({ preventScroll: true });
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;

		if (value) {
			closeReason = null;
			parent?.childOpened(menu);
		} else {
			restoreFocus();
			// Close the submenus first, deepest first. Hiding a manual popover does not hide the manual
			// popovers inside it.
			openChild?.request(false, "parent");
			cancelHoverOpen();
			endGrace();
			setActive(null, false);
			clearTimeout(typeaheadTimer);
			typeaheadBuffer = "";
			parent?.childClosed(menu);
		}

		writeAria();
		sync();
		if (!value && context) {
			context = null;
			pointAnchor?.remove();
			pointAnchor = null;
		}
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled menu applies it. `setOpen` always hears about it, even
	 * when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean, reason: MenuCloseReason | MenuOpenReason) {
		if (value) {
			openReason = reason as MenuOpenReason;
			// A second keyboard open, or a submenu that the keyboard enters after a hover opened it.
			if (open) {
				focusOnOpen();
				return;
			}
		} else {
			if (!open) return;
			closeReason = reason as MenuCloseReason;
		}
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape(event: KeyboardEvent) {
		if (!open || covered()) return false;
		// A press inside this level goes to its own key handler instead. It runs after the handlers
		// inside the menu, so a control that uses Escape first can keep the menu open.
		if (is_node(event.target) && content?.contains(event.target)) return false;
		request(false, "escape");
		return true;
	}
	// #endregion show

	// #region keys
	function handleTypeahead(event: KeyboardEvent) {
		clearTimeout(typeaheadTimer);
		if (!menu_typeahead_is_key(event, typeaheadBuffer)) {
			typeaheadBuffer = "";
			return false;
		}

		const list = enabledItems();
		const texts = list.map((item) => menu_typeahead_normalize(typeahead_text(item)));
		const next = menu_typeahead_next(texts, activeItem ? list.indexOf(activeItem) : -1, typeaheadBuffer, event.key);
		typeaheadBuffer = next.buffer;
		typeaheadTimer = setTimeout(() => {
			typeaheadBuffer = "";
		}, TYPEAHEAD_RESET);
		if (next.index !== -1) move(list[next.index]);
		event.preventDefault();
		return true;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!content || !is_element(event.target) || event.target.closest('[role="menu"]') !== content) return;
		// The browser puts the menu right after its trigger in the Tab order. So Tab from a context menu
		// can land on a button inside the trigger row, and the row counts as inside. Close once the
		// browser has moved focus, unless focus stayed in the menu.
		if (event.key === "Tab" && !event.shiftKey) {
			const doc = content.ownerDocument;
			setTimeout(() => {
				if (!root().contains(doc.activeElement)) root().request(false, "focus");
			});
		}
		// A text field inside the menu keeps its own keys. Only Escape still closes the menu.
		if (levelTextField(event.target) && event.key !== "Escape") return;
		cancelHoverOpen();
		endGrace();
		if (event.defaultPrevented || event.isComposing) return;

		// Space is a typeahead character only inside a running search. Otherwise it clicks.
		if (event.key !== " " || typeaheadBuffer) {
			if (handleTypeahead(event)) return;
		}

		const list = enabledItems();
		const rtl = getComputedStyle(content).direction === "rtl";
		const openKey = rtl ? "ArrowLeft" : "ArrowRight";
		const closeKey = rtl ? "ArrowRight" : "ArrowLeft";
		const index = activeItem ? list.indexOf(activeItem) : -1;

		switch (event.key) {
			case "ArrowDown":
				// No loop at the ends, like Ariakit's default (`focusLoop` false).
				move(index === -1 ? list[0] : list[index + 1]);
				break;
			case "ArrowUp":
				move(index === -1 ? list.at(-1) : list[index - 1]);
				break;
			case "Home":
				move(list[0]);
				break;
			case "End":
				move(list.at(-1));
				break;
			case "PageDown":
				move(pageItem(list, 1));
				break;
			case "PageUp":
				move(pageItem(list, -1));
				break;
			case openKey:
				if (!activeItem || !children.has(activeItem)) return;
				openChildOf(activeItem, "keyboard-first");
				break;
			case closeKey:
				if (!parent) return;
				request(false, "escape");
				break;
			case "Enter":
				if (!activeItem) return;
				if (children.has(activeItem)) openChildOf(activeItem, "keyboard-first");
				else activeItem.click();
				break;
			case " ":
				// Click on keyup, like a native button. Stop the page from scrolling now.
				spaceItem = activeItem;
				break;
			case "Escape":
				request(false, "escape");
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key !== " ") return;
		const item = spaceItem;
		spaceItem = null;
		if (!item || item !== activeItem || event.defaultPrevented) return;
		event.preventDefault();
		if (children.has(item)) openChildOf(item, "keyboard-first");
		else item.click();
	}
	// #endregion keys

	// #region pointer
	/**
	 * Hover moves the active item, for a mouse or a pen. A touch never hovers: a tap clicks.
	 *
	 * With a submenu open, the pointer may cross other items on its way into the submenu. When it leaves
	 * the submenu's item, the grace area starts (Radix): for 300ms, while the pointer stays inside the
	 * polygon and moves toward the submenu, other items ignore it. This is the only place that measures.
	 */
	function handlePointerMove(event: PointerEvent) {
		if (!content || event.pointerType === "touch") return;
		const point = { x: event.clientX, y: event.clientY };
		// Browsers send a pointermove when the content scrolls under a still pointer. Ignore it, like
		// Ariakit. Compare viewport positions: WebKit test input keeps screenX and screenY the same.
		if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) return;
		lastPoint = point;
		if (point.x !== lastX) pointerDirection = point.x > lastX ? "right" : "left";
		lastX = point.x;

		// A move inside a submenu bubbles up here. Entering the submenu ends the grace area.
		if (is_element(event.target) && event.target.closest('[role="menu"]') !== content) {
			if (openChild?.contains(event.target)) endGrace();
			return;
		}

		const item = levelItem(event.target);
		const childButton = openChild?.getButton() ?? null;
		const left = lastItemPoint;
		lastItemPoint = item ? { item, point } : null;

		// The pointer just left the item of the open submenu. Start the grace area at the last point on it.
		if (childButton && item !== childButton && left?.item === childButton) {
			const childContent = openChild?.getContent();
			const area = childContent
				? menu_grace_area(left.point, childButton.getBoundingClientRect(), childContent.getBoundingClientRect())
				: null;
			endGrace();
			if (area) grace = { ...area, timer: setTimeout(endGrace, MENU_GRACE_TIMEOUT) };
		}

		if (grace && pointerDirection === grace.side && menu_grace_contains(grace.polygon, point)) return;
		endGrace();

		if (!item) {
			cancelHoverOpen();
			// Keep the item of an open submenu active, so the user sees where the submenu comes from.
			if (!openChild) setActive(null, false);
			return;
		}

		if (item !== activeItem) {
			if (openChild) openChild.request(false, "sibling");
			setActive(item, false);
		}

		// Hover moves focus to the item's level, like Ariakit. So after the pointer enters a submenu,
		// Enter runs the submenu item, and after it comes back, the keys go to the parent again. A text
		// field of this level keeps focus, so the user can go on typing.
		const focused = content.ownerDocument.activeElement;
		if (focused !== content && !(focused && levelTextField(focused))) content.focus({ preventScroll: true });

		// Later moves on the same item do not restart the timer. An open submenu needs no timer.
		if (!children.has(item)) {
			cancelHoverOpen();
		} else if (hoverItem !== item && item !== childButton) {
			cancelHoverOpen();
			hoverItem = item;
			hoverTimer = setTimeout(() => openChildOf(item, "hover"), HOVER_OPEN_DELAY);
		}
	}

	function handlePointerLeave(event: PointerEvent) {
		if (event.pointerType === "touch") return;
		cancelHoverOpen();
		lastPoint = null;
		// The pointer comes back from outside, so an old point must not start a grace area.
		lastItemPoint = null;
		// Leaving every menu keeps an open submenu open, so a pointer that overshoots does not lose it.
		// Ariakit closes it by default (`hideOnHoverOutside`); t3-chat turned that off.
		if (!openChild) setActive(null, false);
	}

	/**
	 * A press inside this level keeps DOM focus on the menu element, also on padding, a group label, or
	 * a scroll area, so `aria-activedescendant` stays on the focused element. It also stops a native
	 * drag from a draggable ancestor. A text field inside the menu still takes focus.
	 */
	function handleMouseDown(event: MouseEvent) {
		if (!is_element(event.target) || event.target.closest('[role="menu"]') !== content) return;
		if (levelTextField(event.target)) return;
		event.preventDefault();
	}

	/**
	 * Chromium sends a contextmenu event with `button` -1 to the focused element after the ContextMenu
	 * key (on keyup) and Shift+F10. When a key opened the menu, focus is already on this level, so the
	 * browser's own menu would open on top of ours.
	 */
	function handleContextMenu(event: MouseEvent) {
		if (event.button !== -1 || !is_element(event.target)) return;
		if (event.target.closest('[role="menu"]') !== content || levelTextField(event.target)) return;
		event.preventDefault();
	}

	/**
	 * A click on this level outside its items closes the open submenu, like Ariakit, where the
	 * parent menu is outside the submenu.
	 */
	function handleClick(event: MouseEvent) {
		if (!openChild || !is_element(event.target) || event.target.closest('[role="menu"]') !== content) return;
		if (!levelItem(event.target)) openChild.request(false, "sibling");
	}

	/**
	 * A scroll of this level closes its submenu and stops a pending hover open, so a submenu never
	 * floats beside an item that scrolled away. A scroll inside the submenu belongs to the submenu.
	 */
	function handleScroll(event: Event) {
		if (!is_element(event.target)) return;
		if (event.target !== content && event.target.closest('[role="menu"]') !== content) return;
		cancelHoverOpen();
		openChild?.request(false, "sibling");
	}
	// #endregion pointer

	const menu = {
		/**
		 * The anchor-name the anchor gets while the menu is open.
		 */
		anchorName,
		isSubmenu: parent !== null,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(next: MenuOptions) {
			const placementChanged = options.placement !== next.placement;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (placementChanged) notify();
		},
		request,
		root,
		getButton: () => button,
		getContent: () => content,
		contains: (target: EventTarget | null) => is_node(target) && !!positioner?.contains(target),
		/**
		 * Close every level, from the root. An item click calls it.
		 */
		closeAll(reason: MenuCloseReason) {
			root().request(false, reason);
		},
		/**
		 * Open from a context menu trigger. With a point, the menu shows at the pointer. Without one, the
		 * keyboard opened it: it shows at the focused element inside the trigger, with the first item active.
		 */
		openAt(trigger: HTMLElement, at: Point | null) {
			const doc = trigger.ownerDocument;
			let nextAnchor: HTMLElement;
			if (at) {
				// A 0×0 fixed element at the pointer. It lives in body, so a transformed or contained
				// ancestor of the trigger cannot move it.
				pointAnchor ??= doc.body.appendChild(doc.createElement("span"));
				pointAnchor.className = "np-MenuPoint";
				pointAnchor.setAttribute("aria-hidden", "true");
				pointAnchor.style.left = `${at.x}px`;
				pointAnchor.style.top = `${at.y}px`;
				nextAnchor = pointAnchor;
			} else {
				pointAnchor?.remove();
				pointAnchor = null;
				const focused = doc.activeElement;
				nextAnchor = focused instanceof HTMLElement && trigger.contains(focused) ? focused : trigger;
			}
			context = { anchor: nextAnchor, disclosure: trigger };
			sync();
			// An open menu does not run the open steps again, so name it from the new trigger here.
			writeAria();
			request(true, at ? "pointer" : "keyboard-first");
		},
		/**
		 * A button open anchors to the button again, after a context menu open.
		 */
		openFromButton(reason: MenuOpenReason) {
			// A submenu opens through its parent, which makes the item active and closes a sibling submenu.
			if (parent) {
				if (button) parent.openChildOf(button, reason);
				return;
			}
			context = null;
			pointAnchor?.remove();
			pointAnchor = null;
			sync();
			writeAria();
			request(true, reason);
		},
		registerContextTrigger() {
			contextTriggers += 1;
			return () => {
				contextTriggers -= 1;
			};
		},
		/**
		 * Register the button. In a submenu, it is the parent item, so the parent can open this menu.
		 */
		registerButton(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				button = element;
				parent?.registerChild(element, menu);
				writeAria();
				sync();
				return;
			}
			if (button !== previous) return;
			if (previous) parent?.unregisterChild(previous, menu);
			button = null;
			// React detaches the old ref first, and a replacement button can attach later in the same
			// commit. Wait for it, like setPositioner, so an open menu does not hide and show again. Close
			// only when no button came back.
			queueMicrotask(() => {
				if (!button && !context) request(false, "parent");
				sync();
			});
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			if (element) {
				sync();
				return;
			}
			// StrictMode detaches and attaches a new ref in the same commit. Wait, so the menu does not
			// hide and show again. A real unmount still hides it: the next sync finds no positioner.
			queueMicrotask(sync);
		},
		setContent(element: HTMLElement | null) {
			if (!element) setActive(null, false);
			content = element;
			writeAria();
		},
		registerChild(item: HTMLElement, child: MenuLevel) {
			children.set(item, child);
		},
		unregisterChild(item: HTMLElement, child: MenuLevel) {
			if (children.get(item) !== child) return;
			children.delete(item);
			// The submenu item left the DOM, so it cannot stay active.
			if (activeItem === item) setActive(null, false);
		},
		childOpened(child: MenuLevel) {
			if (openChild && openChild !== child) openChild.request(false, "sibling");
			openChild = child;
		},
		childClosed(child: MenuLevel) {
			if (openChild !== child) return;
			openChild = null;
			endGrace();
		},
		/**
		 * Focus this menu with `item` active. A submenu that closes with Escape or ArrowLeft calls it.
		 */
		focusItem(item: HTMLElement | null) {
			content?.focus({ preventScroll: true });
			if (item) setActive(item, false);
		},
		/**
		 * Open the submenu of an item from a click on it. A click never closes a submenu (Ariakit).
		 */
		openChildOf,
		handleKeyDown,
		handleKeyUp,
		handlePointerMove,
		handlePointerLeave,
		handleMouseDown,
		handleContextMenu,
		handleClick,
		handleScroll,
		destroy() {
			// A remount after Fast Refresh must start closed, or the next button click would ask to
			// close a menu that is already closed. An open submenu whose MenuProvider stops rendering
			// closes like Escape: the parent forgets it and takes focus back.
			closeReason = parent ? "escape" : "focus";
			applyOpen(false);
			cancelHoverOpen();
			endGrace();
			clearTimeout(typeaheadTimer);
			pointAnchor?.remove();
			pointAnchor = null;
			context = null;
			sync();
			writeAria();
			notify();
		},
	};

	return menu;
}
