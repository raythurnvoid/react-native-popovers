type Outside = {
	/**
	 * True when the event target belongs to the layer: its anchor, its content, or a nested layer.
	 */
	inside: (target: EventTarget | null) => boolean;
	/**
	 * True while a modal above the layer made it inert. The layer then ignores outside events.
	 */
	covered: () => boolean;
	/**
	 * Close the layer. `"outside"` is a click or a right click outside, so focus must not go back to
	 * the anchor. `"focus"` means focus moved outside, and the focused element keeps it.
	 */
	close: (reason: "outside" | "focus") => void;
};

/**
 * Listen for Ariakit's outside rules on `doc` and return a function that stops listening.
 *
 * A click closes only when the press also started outside, so a text selection dragged out of the
 * content does not close it. The click that opened the layer has no recorded press, so it is
 * ignored too. A right click outside and focus that moves outside also close it.
 */
export function layer_outside_add(doc: Document, outside: Outside) {
	let pressedOutside: boolean | null = null;
	const onPointerDown = (event: Event) => {
		pressedOutside = !outside.covered() && !outside.inside(event.target);
	};
	const onClick = (event: Event) => {
		const pressed = pressedOutside;
		pressedOutside = null;
		if (!pressed || outside.covered() || outside.inside(event.target)) return;
		outside.close("outside");
	};
	const onContextMenu = (event: Event) => {
		if (outside.covered() || outside.inside(event.target)) return;
		outside.close("outside");
	};
	const onFocusIn = (event: Event) => {
		// Some browsers send focusin to the document itself when the window gets focus. Ignore it, like Ariakit.
		if (event.target === doc || outside.covered() || outside.inside(event.target)) return;
		outside.close("focus");
	};
	doc.addEventListener("pointerdown", onPointerDown, true);
	doc.addEventListener("click", onClick, true);
	doc.addEventListener("contextmenu", onContextMenu, true);
	doc.addEventListener("focusin", onFocusIn);

	return () => {
		doc.removeEventListener("pointerdown", onPointerDown, true);
		doc.removeEventListener("click", onClick, true);
		doc.removeEventListener("contextmenu", onContextMenu, true);
		doc.removeEventListener("focusin", onFocusIn);
	};
}
