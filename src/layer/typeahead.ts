/**
 * Lowercase text with accents removed, so "É" matches "e". Ariakit's `normalizeString` plus trim
 * and lowercase.
 */
export function typeahead_normalize(text: string) {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase();
}

/**
 * Whether a key press adds to the search: one letter or digit with no Ctrl, Alt, or Meta. Space
 * counts only when a search is already running, so a lone Space still clicks the active item.
 * Ariakit's `isValidTypeaheadEvent`.
 */
export function typeahead_is_key(
	event: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean },
	buffer: string,
) {
	if (event.key === " ") return buffer.length > 0;
	return (
		event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && /^[\p{L}\p{N}]$/u.test(event.key)
	);
}

/**
 * Find the item to move to after a typeahead key. `texts` holds the normalized text of the enabled
 * items, in order. `activeIndex` is the active item's index in `texts`, or -1. Returns the index to
 * move to (-1 when nothing matches) and the new search buffer. The caller clears the buffer after
 * 500ms without a key.
 *
 * The rule is Ariakit's (MIT, `ariakit-react-core` `composite-typeahead.tsx`, `getSameInitialItems`):
 * - The buffer grows with each key and matches the start of an item's text.
 * - When the active item starts with the new letter, the same letter typed again cycles: the buffer
 *   collapses to that one letter, and the search looks at the other items with that initial,
 *   starting after the active item and wrapping. A longer buffer that still matches the active item
 *   keeps growing instead ("co" then "cop").
 * - Otherwise the search starts at the top of the list.
 * - No match clears the buffer and keeps the active item.
 */
export function typeahead_next(args: {
	texts: readonly string[];
	activeIndex: number;
	buffer: string;
	key: string;
}) {
	const { texts, activeIndex, buffer, key } = args;

	const char = typeahead_normalize(key) || key;
	let chars = buffer + char;
	let candidates = texts.map((text, index) => ({ text, index }));

	const active = texts[activeIndex];
	if (active !== undefined && active.startsWith(char) && !(chars !== char && active.startsWith(chars))) {
		chars = char;
		const same = candidates.filter((candidate) => candidate.text.startsWith(char));
		const position = same.findIndex((candidate) => candidate.index === activeIndex);
		candidates = [...same.slice(position + 1), ...same.slice(0, position)];
	}

	const match = candidates.find((candidate) => candidate.text.startsWith(chars));
	return match ? { index: match.index, buffer: chars } : { index: -1, buffer: "" };
}

/**
 * The item text that typeahead matches: the text outside `aria-hidden="true"` elements. Ariakit
 * reads all of `textContent`, so a hidden icon or sample letter ("A" before "Purple") becomes the
 * first letter, and "p" never reaches Purple. The hidden text is not part of the item's name either.
 */
export function typeahead_text(item: Element) {
	let text = "";
	const walker = item.ownerDocument.createTreeWalker(item, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.nodeType === Node.ELEMENT_NODE && (node as Element).getAttribute("aria-hidden") === "true"
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
	}
	return text;
}
