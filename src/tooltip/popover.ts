type PopoverElement = HTMLElement & {
	showPopover?: (options?: { source?: Element }) => void;
	hidePopover?: () => void;
};

export function tooltip_show_popover(element: HTMLElement, source: Element | null) {
	const popover = element as PopoverElement;
	if (typeof popover.showPopover !== "function") return;
	if (element.matches(":popover-open")) return;
	popover.showPopover(source ? { source } : undefined);
}

export function tooltip_hide_popover(element: HTMLElement) {
	const popover = element as PopoverElement;
	if (typeof popover.hidePopover !== "function") return;
	if (!element.matches(":popover-open")) return;
	popover.hidePopover();
}

/**
 * Several popups can share one trigger. Append this tooltip's name instead of
 * replacing the list, and put the old inline value back on cleanup.
 */
export function tooltip_add_anchor_name(element: HTMLElement, name: string) {
	const previous = element.style.getPropertyValue("anchor-name");
	const priority = element.style.getPropertyPriority("anchor-name");
	const computed = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue("anchor-name") ?? "";
	const names = computed
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part && part !== "none");
	if (!names.includes(name)) names.push(name);
	element.style.setProperty("anchor-name", names.join(", "));

	return () => {
		if (previous) element.style.setProperty("anchor-name", previous, priority);
		else element.style.removeProperty("anchor-name");
	};
}
