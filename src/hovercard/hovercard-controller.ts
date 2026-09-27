import { anchor_name_add } from "../layer/anchor-name.ts";
import { focus_first_in, focus_is_focusable } from "../layer/focus.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import { outside_add } from "../layer/outside.ts";
import type { Placement } from "../layer/placement.ts";

export type HovercardOptions = {
	placement: Placement;
	showTimeout: number;
	hideTimeout: number;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

/**
 * How the card opened. `hover` leaves focus where it is. `disclosure` moves focus into the card.
 */
type HovercardOpenReason = "hover" | "disclosure";

/**
 * Why the card closes. Focus restore reads it.
 * - `hover`: the pointer left the anchor and the card for `hideTimeout`.
 * - `escape`, `toggle`: focus goes back to the disclosure when it was inside the card.
 * - `outside`: a click or a right click outside. Focus stays where the user put it.
 * - `focus`: focus already moved outside, and stays there.
 */
type HovercardCloseReason = "hover" | "escape" | "toggle" | "outside" | "focus";

export type HovercardController = ReturnType<typeof createHovercard>;

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

/**
 * The state of one hovercard. Hover and the disclosure change it without a React render: only
 * `Hovercard` and `HovercardArrow` subscribe. The controller writes the disclosure's aria attributes
 * to the DOM itself, so the anchor and the disclosure never render on open or close.
 */
export function createHovercard(initial: HovercardOptions) {
	const anchorName = `--np-hovercard-${++next_anchor_id}`;
	let options = initial;
	// Start closed even when controlled open. The first configure() opens it.
	let open = false;
	let anchor: HTMLElement | null = null;
	let disclosure: HTMLElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	// What the components render from. A new object on each change, so useSyncExternalStore and the
	// React Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement };
	let openReason: HovercardOpenReason = "hover";
	// The last close request. A controlled parent can apply it a render later, and focus restore still
	// needs it. Cleared on open.
	let closeReason: HovercardCloseReason | null = null;
	// The pointer is over the anchor, the card, or the gap strips.
	let hovered = false;
	// Escape closed the card while the pointer rested on the anchor. The next pointer entry clears it,
	// so a still pointer does not open the card again right away.
	let pointerBlocked = false;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let removeShowListeners: (() => void) | undefined;
	let shown: { anchor: HTMLElement; positioner: HTMLElement; hide: () => void } | null = null;
	const listeners = new Set<() => void>();

	function notify() {
		snapshot = { open, placement: options.placement };
		for (const listener of listeners) listener();
	}

	/**
	 * The anchor, the disclosure, and the positioner count as inside. A tooltip or a popover inside the
	 * card is a DOM child of the positioner, even though the browser shows it in the top layer.
	 */
	function inside(target: EventTarget | null) {
		return (
			is_node(target) &&
			(!!anchor?.contains(target) || !!disclosure?.contains(target) || !!positioner?.contains(target))
		);
	}

	function focusInside() {
		const doc = positioner?.ownerDocument;
		return !!doc && !!positioner?.contains(doc.activeElement);
	}

	/**
	 * True while a modal above the card made it inert, like the popover.
	 */
	function covered() {
		return !!positioner?.closest("[inert]") && !!anchor?.checkVisibility();
	}

	/**
	 * Write the disclosure's aria attributes. Like Ariakit, it is expanded only when it opened the card.
	 */
	function writeDisclosureAria() {
		if (!disclosure) return;
		disclosure.setAttribute("aria-expanded", open && openReason === "disclosure" ? "true" : "false");
		if (content?.id) disclosure.setAttribute("aria-controls", content.id);
		else disclosure.removeAttribute("aria-controls");
	}

	function cancelShow() {
		clearTimeout(showTimer);
		showTimer = undefined;
		removeShowListeners?.();
		removeShowListeners = undefined;
	}

	function cancelHide() {
		clearTimeout(hideTimer);
		hideTimer = undefined;
	}

	/**
	 * Close after `hideTimeout` unless the pointer comes back or focus is inside the card. Ariakit uses
	 * the same timeout, and the delay also covers a diagonal move outside the gap strips.
	 */
	function scheduleHide() {
		if (!open || focusInside()) return;
		cancelHide();
		hideTimer = setTimeout(() => {
			hideTimer = undefined;
			if (!hovered && !focusInside()) request(false, "hover");
		}, options.hideTimeout);
	}

	/**
	 * Show the card while it is open and both elements are in the document.
	 */
	function sync() {
		const nextAnchor = open && anchor?.isConnected ? anchor : null;
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
			// `source` ties the card to the disclosure for focus order: Tab from the card goes to the element
			// after the disclosure, and the outside rule then closes the card.
			if (!shownPositioner.matches(":popover-open")) {
				shownPositioner.showPopover({ source: disclosure ?? shownAnchor });
			}

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

			// A disclosure open moves focus in after the current event, like Ariakit's dialog. A hover open
			// leaves focus where it is.
			queueMicrotask(() => {
				if (shown?.positioner !== shownPositioner || openReason !== "disclosure") return;
				focusIn();
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
				},
			};
		}
	}

	/**
	 * Move focus into the card: the first `[autofocus]` or `[data-autofocus]` element, then the first
	 * tabbable element, then the card itself. Focus that is already inside stays.
	 */
	function focusIn() {
		if (!content || content.contains(content.ownerDocument.activeElement)) return;
		const target =
			[...content.querySelectorAll("[autofocus],[data-autofocus=true]")].find(focus_is_focusable) ??
			focus_first_in(content) ??
			content;
		target.focus({ preventScroll: true });
	}

	/**
	 * Where focus goes when the card closes with focus inside. It runs before the card hides, so focus
	 * never falls back to the page body. The anchor of a hovercard often cannot take focus, and the
	 * disclosure is the keyboard way in, so the disclosure comes first.
	 */
	function restoreFocus() {
		if (closeReason === "outside" || closeReason === "focus" || !focusInside()) return;
		const target = [disclosure, anchor].find((element) => element?.isConnected && focus_is_focusable(element));
		target?.focus({ preventScroll: true });
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;
		cancelShow();
		cancelHide();
		if (value) {
			closeReason = null;
		} else {
			restoreFocus();
			if (hovered && closeReason === "escape") pointerBlocked = true;
		}
		writeDisclosureAria();
		sync();
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled card applies it. `setOpen` always hears about it, even
	 * when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean, reason: HovercardOpenReason | HovercardCloseReason) {
		cancelShow();
		if (value === open) {
			// A disclosure click on a card that hover opened moves focus in, like a new open.
			if (value && reason === "disclosure" && openReason !== "disclosure") {
				openReason = "disclosure";
				writeDisclosureAria();
				focusIn();
			}
			return;
		}
		if (value) openReason = reason as HovercardOpenReason;
		else closeReason = reason as HovercardCloseReason;
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape(event: KeyboardEvent) {
		if (!open || covered()) return false;
		// A press inside the card goes to the card's own key handler, after the handlers inside it, so a
		// control that uses Escape first can keep the card open.
		if (is_node(event.target) && content?.contains(event.target)) return false;
		request(false, "escape");
		return true;
	}

	const hovercard = {
		/**
		 * The anchor-name the anchor gets while the card is open.
		 */
		anchorName,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(next: HovercardOptions) {
			const placementChanged = options.placement !== next.placement;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (placementChanged) notify();
		},
		request,
		toggleFromDisclosure() {
			if (open && openReason === "disclosure") request(false, "toggle");
			else request(true, "disclosure");
		},
		registerAnchor(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				anchor = element;
				sync();
				return;
			}
			if (anchor !== previous) return;
			anchor = null;
			sync();
			// A replacement anchor can attach later in the same commit. Close only when none did.
			queueMicrotask(() => {
				if (anchor) return;
				hovered = false;
				request(false, "focus");
			});
		},
		registerDisclosure(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				disclosure = element;
				writeDisclosureAria();
				return;
			}
			if (disclosure === previous) disclosure = null;
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			if (element) {
				sync();
				return;
			}
			// StrictMode detaches and attaches a new ref in the same commit. Wait, so the card does not hide
			// and show again. A real unmount still hides it: the next sync finds no positioner.
			queueMicrotask(sync);
		},
		setContent(element: HTMLElement | null) {
			content = element;
			writeDisclosureAria();
		},
		anchorPointerMove() {
			hovered = true;
			cancelHide();
			if (open || pointerBlocked || showTimer !== undefined) return;
			const delay = options.showTimeout;
			if (delay <= 0) {
				request(true, "hover");
				return;
			}
			// A press, a scroll, or a key during the wait means the user is doing something else, like
			// Ariakit's "mouse is moving" check.
			const doc = anchor?.ownerDocument;
			if (doc) {
				const cancel = () => cancelShow();
				doc.addEventListener("scroll", cancel, true);
				doc.addEventListener("keydown", cancel, true);
				removeShowListeners = () => {
					doc.removeEventListener("scroll", cancel, true);
					doc.removeEventListener("keydown", cancel, true);
				};
			}
			showTimer = setTimeout(() => {
				cancelShow();
				if (hovered && !pointerBlocked) request(true, "hover");
			}, delay);
		},
		anchorPointerEnter() {
			hovered = true;
			pointerBlocked = false;
			cancelHide();
		},
		anchorPointerLeave(relatedTarget: EventTarget | null) {
			cancelShow();
			if (inside(relatedTarget)) return;
			hovered = false;
			scheduleHide();
		},
		anchorPointerDown() {
			cancelShow();
		},
		cardPointerEnter() {
			hovered = true;
			cancelHide();
		},
		cardPointerLeave(relatedTarget: EventTarget | null) {
			if (inside(relatedTarget)) return;
			hovered = false;
			scheduleHide();
		},
		destroy() {
			cancelShow();
			cancelHide();
			// A remount after Fast Refresh must start closed.
			open = false;
			sync();
			writeDisclosureAria();
			notify();
		},
	};

	return hovercard;
}
