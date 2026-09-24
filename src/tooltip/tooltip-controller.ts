import { anchor_name_add } from "../layer/anchor-name.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import type { Placement } from "../layer/placement.ts";

export type TooltipOptions = {
	placement: Placement;
	timeout: number;
	skipTimeout: number;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

export type TooltipController = ReturnType<typeof createTooltip>;

type TooltipGroup = {
	active: TooltipController | null;
	warmUntil: number;
};

// Each document has its own pointer and focus, including Storybook iframes.
const groups = new WeakMap<Document, TooltipGroup>();

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

/**
 * The state of one tooltip. Hover and focus change it without a React render.
 * Only `Tooltip` subscribes, so the anchor and its parent never render during hover.
 */
export function createTooltip(initial: TooltipOptions) {
	const anchorName = `--np-tooltip-${++next_anchor_id}`;
	let options = initial;
	// Start closed even when controlled open. The first configure() opens it, so it joins the group.
	let open = false;
	let anchor: HTMLElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	// What the components render from. A new object on each change, so useSyncExternalStore and the
	// React Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement };
	// The pointer is over the anchor or the tooltip.
	let hovered = false;
	// The tooltip closed while the pointer was on the anchor. The next pointer entry clears it.
	let pointerBlocked = false;
	// The anchor has keyboard focus. Moving the pointer away then keeps the tooltip open.
	let focusVisible = false;
	// Focus goes back to the anchor on close. That focus must not open the tooltip again.
	let restoringFocus = false;
	// A blur close skips the warm window, as in Ariakit. The next applyOpen() clears it, so a controlled
	// parent that closes a render later still gets a cold close.
	let coldClose = false;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let removeShowListeners: (() => void) | undefined;
	let shown: { anchor: HTMLElement; positioner: HTMLElement; hide: () => void } | null = null;
	const listeners = new Set<() => void>();

	function notify() {
		snapshot = { open, placement: options.placement };
		for (const listener of listeners) listener();
	}

	function group() {
		const doc = anchor?.ownerDocument ?? positioner?.ownerDocument;
		if (!doc) return;
		let value = groups.get(doc);
		if (!value) {
			value = { active: null, warmUntil: 0 };
			groups.set(doc, value);
		}
		return value;
	}

	function inside(target: EventTarget | null) {
		return is_node(target) && (!!anchor?.contains(target) || !!positioner?.contains(target));
	}

	/**
	 * Show the popover while the tooltip is open and both elements are in the document.
	 * The anchor gets its anchor-name only here, so idle anchors cost no style work.
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
			// `source` ties the popover to the anchor for focus order and for popover nesting.
			if (!shownPositioner.matches(":popover-open")) shownPositioner.showPopover({ source: shownAnchor });

			const removeLayer = layer_stack_add(win, { escape });
			const outside = (event: Event) => {
				if (inside(event.target)) return;
				// Focus can leave through a control inside the tooltip. The anchor never sees a blur then, so act like one.
				if (event.type === "focusin") {
					focusVisible = false;
					coldClose = true;
				}
				request(false);
			};
			doc.addEventListener("pointerdown", outside, true);
			doc.addEventListener("contextmenu", outside, true);
			doc.addEventListener("focusin", outside);

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
					doc.removeEventListener("pointerdown", outside, true);
					doc.removeEventListener("contextmenu", outside, true);
					doc.removeEventListener("focusin", outside);
					removeLayer();
					removeAnchorName();
					if (shownPositioner.matches(":popover-open")) shownPositioner.hidePopover();
				},
			};
		}
	}

	function cancelShow() {
		clearTimeout(showTimer);
		showTimer = undefined;
		removeShowListeners?.();
		removeShowListeners = undefined;
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;
		cancelShow();
		clearTimeout(hideTimer);

		const current = group();
		if (value) {
			const previous = current?.active;
			if (current) current.active = tooltip;
			// One tooltip at a time. A controlled tooltip that the parent keeps open stays open.
			if (previous && previous !== tooltip) previous.request(false);
		} else {
			if (current?.active === tooltip) {
				current.active = null;
				current.warmUntil = coldClose ? 0 : Date.now() + options.skipTimeout;
			}
			// A close while the pointer rests on the anchor must not reopen on the next pointer move.
			if (hovered) pointerBlocked = true;
			// The content is about to go away. Keep keyboard users on the anchor.
			if (anchor && content?.contains(content.ownerDocument.activeElement)) {
				restoringFocus = true;
				anchor.focus({ preventScroll: true });
				restoringFocus = false;
			}
		}
		coldClose = false;

		sync();
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled tooltip applies it. `setOpen` always hears about it,
	 * even when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean) {
		cancelShow();
		if (value === open) return;
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape() {
		if (!open) return false;
		request(false);
		return true;
	}

	function setActiveAnchor(element: HTMLElement) {
		if (anchor === element) return;
		anchor = element;
		sync();
	}

	const tooltip = {
		/**
		 * The anchor-name the active anchor gets while the tooltip is open.
		 */
		anchorName,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(next: TooltipOptions) {
			const placementChanged = options.placement !== next.placement;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (placementChanged) notify();
		},
		request,
		registerAnchor(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				if (!anchor) setActiveAnchor(element);
				return;
			}
			if (anchor !== previous) return;
			anchor = null;
			sync();
			// A replacement anchor can attach later in the same commit. Close only when none did.
			queueMicrotask(() => {
				if (anchor) return;
				cancelShow();
				hovered = false;
				focusVisible = false;
				request(false);
			});
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			sync();
		},
		setContent(element: HTMLElement | null) {
			content = element;
		},
		pointerEnter() {
			hovered = true;
			pointerBlocked = false;
			clearTimeout(hideTimer);
		},
		pointerMove(element: HTMLElement) {
			if (!hovered || pointerBlocked) return;
			// Several anchors can share one tooltip. An open tooltip moves to the anchor under the pointer.
			if (open) {
				setActiveAnchor(element);
				return;
			}
			if (showTimer !== undefined) return;
			setActiveAnchor(element);

			const current = group();
			const warm = !!current?.active || Date.now() < (current?.warmUntil ?? 0);
			const delay = warm ? 0 : options.timeout;
			if (delay <= 0) {
				request(true);
				return;
			}

			// A scroll or a key press during the wait means the user is doing something else.
			const doc = element.ownerDocument;
			const cancel = () => cancelShow();
			doc.addEventListener("scroll", cancel, true);
			doc.addEventListener("keydown", cancel, true);
			removeShowListeners = () => {
				doc.removeEventListener("scroll", cancel, true);
				doc.removeEventListener("keydown", cancel, true);
			};
			showTimer = setTimeout(() => {
				cancelShow();
				if (hovered && !pointerBlocked) request(true);
			}, delay);
		},
		pointerLeave(relatedTarget: EventTarget | null) {
			hovered = false;
			cancelShow();
			if (!open || focusVisible || inside(relatedTarget)) return;
			clearTimeout(hideTimer);
			// Wait one task. A pointer that moves into the tooltip or onto its gap arrives first.
			hideTimer = setTimeout(() => {
				if (!hovered) request(false);
			}, 0);
		},
		pointerDown() {
			cancelShow();
		},
		contentEnter() {
			hovered = true;
			clearTimeout(hideTimer);
		},
		contentLeave(relatedTarget: EventTarget | null) {
			hovered = false;
			if (!open || focusVisible) return;
			if (is_node(relatedTarget) && anchor?.contains(relatedTarget)) return;
			request(false);
		},
		focus(element: HTMLElement) {
			if (restoringFocus) return;
			focusVisible = true;
			setActiveAnchor(element);
			request(true);
		},
		blur(relatedTarget: EventTarget | null) {
			// Focus that moves into the tooltip keeps it open.
			if (inside(relatedTarget)) return;
			focusVisible = false;
			if (!open) return;
			coldClose = true;
			request(false);
		},
		destroy() {
			cancelShow();
			clearTimeout(hideTimer);
			const current = group();
			if (current?.active === tooltip) {
				current.active = null;
				current.warmUntil = 0;
			}
			open = false;
			sync();
		},
	};

	return tooltip;
}
