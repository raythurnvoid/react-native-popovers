/**
 * How the arrow keys behave at the ends of a list.
 * - `none`: stop at the first and the last item (menu and select, Ariakit's default).
 * - `through-owner`: after the last item comes "no active item", and then the first item again. The
 *   owner is the element that keeps DOM focus, such as a combobox input. Ariakit's combobox does this,
 *   so the user can get back to the typed text.
 */
export type ListLoop = "none" | "through-owner";

export type ListStepKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * The index a navigation key moves to in a list of `length` enabled items. `index` is the active
 * item's index, or -1 when no item is active. Returns -1 for "no active item" (only with
 * `through-owner`), or `undefined` when the key does not move.
 */
export function list_step(length: number, index: number, key: ListStepKey, loop: ListLoop) {
	if (length === 0) return undefined;
	switch (key) {
		case "Home":
			return 0;
		case "End":
			return length - 1;
		case "ArrowDown":
			if (index === -1) return 0;
			if (index < length - 1) return index + 1;
			return loop === "through-owner" ? -1 : undefined;
		case "ArrowUp":
			if (index === -1) return length - 1;
			if (index > 0) return index - 1;
			return loop === "through-owner" ? -1 : undefined;
	}
}

/**
 * Whether `item` is rendered inside `container`, even while `container` itself is hidden: no element
 * from the item up to the container has `display: none` or the `hidden` attribute. A closed popover
 * hides its content, and closed typeahead still has to find the items.
 */
function list_rendered_in(item: HTMLElement, container: HTMLElement) {
	const win = item.ownerDocument.defaultView;
	for (let element: HTMLElement | null = item; element; element = element.parentElement) {
		if (element.hidden || win?.getComputedStyle(element).display === "none") return false;
		if (element === container) return true;
	}
	return false;
}

/**
 * The items of a list, read from the DOM in order. `owns` drops items that belong to another list
 * nested inside this one, such as a submenu. Hidden items (`display: none`) are skipped. While the
 * container is shown, `checkVisibility()` decides. While it is hidden, the ancestors decide.
 */
export function list_items(container: HTMLElement | null, selector: string, owns: (item: HTMLElement) => boolean) {
	if (!container) return [];
	const shown = container.checkVisibility();
	return [...container.querySelectorAll<HTMLElement>(selector)].filter(
		(item) => owns(item) && (shown ? item.checkVisibility() : list_rendered_in(item, container)),
	);
}

/**
 * The items a key or typeahead can reach: the ones without `aria-disabled="true"`.
 */
export function list_enabled(items: HTMLElement[]) {
	return items.filter((item) => item.getAttribute("aria-disabled") !== "true");
}

/**
 * The active item of a list with virtual focus. DOM focus stays on the owner element (a menu, a
 * listbox, or an input). The active item gets `data-active-item`, and the owner gets
 * `aria-activedescendant`. `onChange` runs after each change.
 */
export function list_active(owner: () => HTMLElement | null, onChange?: (item: HTMLElement | null) => void) {
	let active: HTMLElement | null = null;

	return {
		get: () => active,
		set(item: HTMLElement | null, scroll: boolean) {
			const changed = active !== item;
			if (active && changed) active.removeAttribute("data-active-item");
			active = item;
			if (item) {
				item.setAttribute("data-active-item", "");
				if (item.id) owner()?.setAttribute("aria-activedescendant", item.id);
				if (scroll) item.scrollIntoView({ block: "nearest" });
			} else {
				owner()?.removeAttribute("aria-activedescendant");
			}
			if (changed) onChange?.(item);
		},
	};
}

/**
 * The item one page away, like Ariakit's PageUp and PageDown: the farthest item that is still
 * within one scroll-container height of `from`. At the end, it is the last item. With no `from`,
 * PageDown goes to the first item and PageUp to the last.
 */
export function list_page_item(
	list: HTMLElement[],
	from: HTMLElement | null,
	step: 1 | -1,
	container: HTMLElement | null,
) {
	const start = from ? list.indexOf(from) : -1;
	if (!from || start === -1) return step > 0 ? list[0] : list.at(-1);
	let scroller: HTMLElement | null = from.parentElement;
	while (scroller && scroller !== container && scroller.scrollHeight <= scroller.clientHeight) {
		scroller = scroller.parentElement;
	}
	const page = (scroller ?? container ?? from).clientHeight;
	const fromTop = from.getBoundingClientRect().top;
	let target = from;
	for (let index = start + step; index >= 0 && index < list.length; index += step) {
		const item = list[index]!;
		if (Math.abs(item.getBoundingClientRect().top - fromTop) > page) break;
		target = item;
	}
	// An item taller than the page still moves one step.
	return target === from ? list[start + step] : target;
}
