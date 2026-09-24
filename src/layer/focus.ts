/**
 * Whether the element is in the Tab order without a tabindex attribute.
 */
export function focus_is_natively_tabbable(element: HTMLElement) {
	switch (element.tagName) {
		case "BUTTON":
		case "IFRAME":
		case "SELECT":
		case "SUMMARY":
		case "TEXTAREA":
			return true;
		case "INPUT":
			return (element as HTMLInputElement).type !== "hidden";
		case "A":
		case "AREA":
			return element.hasAttribute("href");
		case "AUDIO":
		case "VIDEO":
			return element.hasAttribute("controls");
	}
	return element.isContentEditable;
}

const BUTTON_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "image", "radio", "reset", "submit"]);

/**
 * Safari does not focus a button, checkbox, or radio on click unless it has an explicit tabIndex.
 * Ariakit's Focusable adds one, so a key after a click can open a tooltip, and a popover opened by
 * a click can take focus from the page. Ariakit also checks for a Mac platform. Real Safari always
 * runs on Apple platforms, and the vendor check alone also covers Playwright's WebKit on Windows.
 */
export function focus_needs_safari_tab_index(element: HTMLElement) {
	if (!/apple/i.test(element.ownerDocument.defaultView?.navigator.vendor ?? "")) return false;
	if (element.tagName === "BUTTON") return true;
	return element.tagName === "INPUT" && BUTTON_INPUT_TYPES.has((element as HTMLInputElement).type);
}

const CANDIDATES =
	"a[href], area[href], button, input, select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable]:not([contenteditable='false']), [tabindex]";

/**
 * Whether the element can take focus now: a focusable kind of element that is not disabled,
 * not inert, and rendered.
 */
export function focus_is_focusable(element: Element): element is HTMLElement {
	return (
		element.matches(CANDIDATES) &&
		!element.matches(":disabled") &&
		!element.closest("[inert]") &&
		element.checkVisibility()
	);
}

/**
 * The first element in `container` that Tab would reach, or else the first one that can take focus
 * at all, like Ariakit's getFirstTabbableIn with its focusable fallback.
 */
export function focus_first_in(container: HTMLElement) {
	let firstFocusable: HTMLElement | null = null;
	for (const element of container.querySelectorAll(CANDIDATES)) {
		if (!focus_is_focusable(element)) continue;
		if (element.tabIndex >= 0) return element;
		firstFocusable ??= element;
	}
	return firstFocusable;
}
