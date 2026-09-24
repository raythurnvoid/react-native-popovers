import { anchor_name_add } from "../layer/anchor-name.ts";
import { focus_first_in, focus_is_focusable } from "../layer/focus.ts";
import { layer_stack_add } from "../layer/layer-stack.ts";
import type { Placement } from "../layer/placement.ts";

export type PopoverOptions = {
	placement: Placement;
	open: boolean | undefined;
	setOpen: ((open: boolean) => void) | undefined;
};

/**
 * Why the popover asked to close. Focus restore reads it.
 */
type PopoverCloseReason = "toggle" | "outside" | "escape" | "dismiss";

export type PopoverController = ReturnType<typeof createPopover>;

let next_anchor_id = 0;

function is_node(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Node).nodeType === "number";
}

/**
 * The state of one popover. Opening and closing it renders only `Popover`, not the disclosure:
 * the controller writes the disclosure's aria attributes to the DOM itself. `anchor` is the disclosure.
 */
export function createPopover(initial: PopoverOptions) {
	const anchorName = `--np-popover-${++next_anchor_id}`;
	let options = initial;
	// Start closed even when controlled open. The first configure() opens it.
	let open = false;
	let anchor: HTMLElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	// What the components render from. A new object on each change, so useSyncExternalStore and the
	// React Compiler see the change. Components must not read the mutable variables above in render.
	let snapshot = { open, placement: options.placement };
	// The last close request. A controlled parent can apply it a render later, and focus restore
	// still needs to know that the close came from an outside click. Cleared on open.
	let closeReason: PopoverCloseReason | null = null;
	let shown: { anchor: HTMLElement; positioner: HTMLElement; hide: () => void } | null = null;
	const listeners = new Set<() => void>();

	function notify() {
		snapshot = { open, placement: options.placement };
		for (const listener of listeners) listener();
	}

	/**
	 * The anchor and the positioner count as inside. A nested popover or a tooltip inside the content
	 * is a DOM child of the positioner, even though the browser shows it in the top layer.
	 */
	function inside(target: EventTarget | null) {
		return is_node(target) && (!!anchor?.contains(target) || !!positioner?.contains(target));
	}

	/**
	 * Write the disclosure's aria attributes. React does not own them, because the disclosure never
	 * passes them, so the disclosure does not render on open or close.
	 */
	function writeAnchorAria() {
		if (!anchor) return;
		anchor.setAttribute("aria-expanded", open ? "true" : "false");
		// Like Ariakit, point at the content only while it is in the DOM.
		if (content?.id) anchor.setAttribute("aria-controls", content.id);
		else anchor.removeAttribute("aria-controls");
	}

	/**
	 * Show the popover while it is open and both elements are in the document.
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

			// Ariakit's outside rules. A click closes only when the press also started outside, so a
			// text selection dragged out of the content does not close it. The click that opened the
			// popover has no recorded press, so it is ignored too.
			let pressedOutside: boolean | null = null;
			const onPointerDown = (event: Event) => {
				pressedOutside = !inside(event.target);
			};
			const onClick = (event: Event) => {
				const pressed = pressedOutside;
				pressedOutside = null;
				if (!pressed || inside(event.target)) return;
				request(false, "outside");
			};
			const onContextMenu = (event: Event) => {
				if (inside(event.target)) return;
				request(false, "outside");
			};
			const onFocusIn = (event: Event) => {
				// Some browsers send focusin to the document itself when the window gets focus. Ignore it, like Ariakit.
				if (event.target === doc || inside(event.target)) return;
				// The focused element keeps focus, so this is not an "outside" close for focus restore.
				request(false);
			};
			doc.addEventListener("pointerdown", onPointerDown, true);
			doc.addEventListener("click", onClick, true);
			doc.addEventListener("contextmenu", onContextMenu, true);
			doc.addEventListener("focusin", onFocusIn);

			// Paint one frame without data-enter so a CSS enter transition can run.
			let frame = win.requestAnimationFrame(() => {
				frame = win.requestAnimationFrame(() => {
					content?.setAttribute("data-enter", "");
				});
			});

			// Move focus in after the current event, like Ariakit. Focus that is already inside stays.
			queueMicrotask(() => {
				if (shown?.positioner !== shownPositioner || !content) return;
				if (content.contains(doc.activeElement)) return;
				const target =
					[...content.querySelectorAll("[autofocus],[data-autofocus=true]")].find(focus_is_focusable) ??
					focus_first_in(content) ??
					content;
				target.focus({ preventScroll: true });
			});

			shown = {
				anchor: shownAnchor,
				positioner: shownPositioner,
				hide: () => {
					win.cancelAnimationFrame(frame);
					content?.removeAttribute("data-enter");
					doc.removeEventListener("pointerdown", onPointerDown, true);
					doc.removeEventListener("click", onClick, true);
					doc.removeEventListener("contextmenu", onContextMenu, true);
					doc.removeEventListener("focusin", onFocusIn);
					removeLayer();
					removeAnchorName();
					if (shownPositioner.matches(":popover-open")) shownPositioner.hidePopover();
				},
			};
		}
	}

	/**
	 * Ariakit's focus restore: go back to the anchor, unless an outside click or right click closed
	 * the popover, or focus already sits on another element outside it.
	 */
	function restoreFocus() {
		if (!anchor || closeReason === "outside") return;
		const active = anchor.ownerDocument.activeElement;
		if (active && !positioner?.contains(active) && focus_is_focusable(active)) return;
		anchor.focus({ preventScroll: true });
	}

	function applyOpen(value: boolean) {
		if (open === value) return;
		open = value;
		if (value) closeReason = null;
		// Restore focus before the content hides, so focus never falls back to the page body.
		else restoreFocus();

		writeAnchorAria();
		sync();
		notify();
	}

	/**
	 * Ask for a new open state. An uncontrolled popover applies it. `setOpen` always hears about it,
	 * even when a controlled parent keeps its `open` prop as it is.
	 */
	function request(value: boolean, reason: PopoverCloseReason | null = null) {
		if (value === open) return;
		if (!value) closeReason = reason;
		if (options.open === undefined) applyOpen(value);
		options.setOpen?.(value);
	}

	function escape(event: KeyboardEvent) {
		if (!open) return false;
		// A press inside the content goes to the content's own key handler instead. It runs after the
		// handlers inside the content, so a control that uses Escape first can keep the popover open.
		if (is_node(event.target) && content?.contains(event.target)) return false;
		request(false, "escape");
		return true;
	}

	const popover = {
		/**
		 * The anchor-name the anchor gets while the popover is open.
		 */
		anchorName,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		configure(next: PopoverOptions) {
			const placementChanged = options.placement !== next.placement;
			options = next;
			if (next.open !== undefined) applyOpen(next.open);
			if (placementChanged) notify();
		},
		request,
		/**
		 * Register the disclosure node. A popover has one disclosure.
		 */
		registerAnchor(element: HTMLElement | null, previous: HTMLElement | null) {
			if (element) {
				anchor = element;
				writeAnchorAria();
				sync();
				return;
			}
			if (anchor !== previous) return;
			anchor = null;
			sync();
			// A replacement anchor can attach later in the same commit. Close only when none did.
			queueMicrotask(() => {
				if (!anchor) request(false);
			});
		},
		setPositioner(element: HTMLElement | null) {
			positioner = element;
			sync();
		},
		setContent(element: HTMLElement | null) {
			content = element;
			writeAnchorAria();
		},
		destroy() {
			// Also update the disclosure's aria attributes and the `Popover` snapshot. A remount after Fast
			// Refresh must start closed, or the next trigger click would ask to close a popover that is already closed.
			open = false;
			sync();
			writeAnchorAria();
			notify();
		},
	};

	return popover;
}
