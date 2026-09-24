function split_names(value: string) {
	return value
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name && name !== "none");
}

/**
 * Add `name` to the element's `anchor-name` list and return a function that removes it.
 *
 * Several popups can share one trigger, so append instead of replacing the list.
 * An inline value hides names that come from a stylesheet, so copy those in first.
 * The remove function takes out only this name, so another popup can close in any order.
 */
export function anchor_name_add(element: HTMLElement, name: string) {
	const inline = element.style.getPropertyValue("anchor-name");
	const priority = element.style.getPropertyPriority("anchor-name");
	const base =
		inline || element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue("anchor-name") || "";
	const names = split_names(base);
	if (!names.includes(name)) names.push(name);
	element.style.setProperty("anchor-name", names.join(", "), priority);

	return () => {
		const rest = split_names(element.style.getPropertyValue("anchor-name")).filter((item) => item !== name);
		// Drop the inline value when only the copied stylesheet names are left, so the stylesheet rules again.
		if (!rest.length || (!inline && rest.join(", ") === split_names(base).join(", "))) {
			element.style.removeProperty("anchor-name");
			return;
		}
		element.style.setProperty("anchor-name", rest.join(", "), priority);
	};
}
