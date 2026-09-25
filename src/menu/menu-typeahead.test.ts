import { describe, expect, test } from "vitest";
import { menu_typeahead_is_key, menu_typeahead_next, menu_typeahead_normalize } from "./menu-typeahead.ts";

const key = (value: string, modifiers: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
	key: value,
	ctrlKey: false,
	altKey: false,
	metaKey: false,
	...modifiers,
});

describe("menu_typeahead_normalize", () => {
	test("removes accents, trims, and lowercases", () => {
		expect(menu_typeahead_normalize("  Éclair Crème ")).toBe("eclair creme");
	});
});

describe("menu_typeahead_is_key", () => {
	test("accepts one letter or digit", () => {
		expect(menu_typeahead_is_key(key("a"), "")).toBe(true);
		expect(menu_typeahead_is_key(key("7"), "")).toBe(true);
		expect(menu_typeahead_is_key(key("ü"), "")).toBe(true);
	});

	test("rejects named keys, symbols, and modifier shortcuts", () => {
		expect(menu_typeahead_is_key(key("ArrowDown"), "")).toBe(false);
		expect(menu_typeahead_is_key(key("-"), "")).toBe(false);
		expect(menu_typeahead_is_key(key("a", { ctrlKey: true }), "")).toBe(false);
		expect(menu_typeahead_is_key(key("a", { altKey: true }), "")).toBe(false);
		expect(menu_typeahead_is_key(key("a", { metaKey: true }), "")).toBe(false);
	});

	test("accepts Space only while a search is running", () => {
		expect(menu_typeahead_is_key(key(" "), "")).toBe(false);
		expect(menu_typeahead_is_key(key(" "), "show")).toBe(true);
	});
});

describe("menu_typeahead_next", () => {
	// The files sidebar menu from the baseline, with the disabled "Paste" item already left out by the caller.
	const baseline = ["cut", "copy", "show archived items", "upload file"];

	test("the same letter cycles after the active item and wraps", () => {
		const first = menu_typeahead_next(baseline, 0, "", "c");
		expect(first).toEqual({ index: 1, buffer: "c" });

		const second = menu_typeahead_next(baseline, first.index, first.buffer, "c");
		expect(second).toEqual({ index: 0, buffer: "c" });
	});

	test("a letter whose only match is already active finds nothing, so the active item stays", () => {
		expect(menu_typeahead_next(baseline, 0, "", "u")).toEqual({ index: 3, buffer: "u" });
		expect(menu_typeahead_next(baseline, 3, "u", "u")).toEqual({ index: -1, buffer: "" });
	});

	test("no match clears the buffer and keeps the active item", () => {
		expect(menu_typeahead_next(baseline, 0, "", "p")).toEqual({ index: -1, buffer: "" });
	});

	test("searches from the top when the active item does not start with the letter", () => {
		// Radix would pick "avocado" here, because it searches after the active item.
		expect(menu_typeahead_next(["apple", "banana", "avocado"], 1, "", "a")).toEqual({ index: 0, buffer: "a" });
	});

	test("with no active item, the first match wins", () => {
		expect(menu_typeahead_next(baseline, -1, "", "s")).toEqual({ index: 2, buffer: "s" });
	});

	test("more letters narrow the search", () => {
		const texts = ["copy", "cut", "cursor"];
		const first = menu_typeahead_next(texts, -1, "", "c");
		const second = menu_typeahead_next(texts, first.index, first.buffer, "u");
		const third = menu_typeahead_next(texts, second.index, second.buffer, "r");
		expect([first, second, third]).toEqual([
			{ index: 0, buffer: "c" },
			{ index: 1, buffer: "cu" },
			{ index: 2, buffer: "cur" },
		]);
	});

	test("a repeated letter keeps growing while the active item still matches the whole buffer", () => {
		expect(menu_typeahead_next(["cc one", "c two"], 0, "c", "c")).toEqual({ index: 0, buffer: "cc" });
	});

	test("uppercase and accented keys match normalized text", () => {
		expect(menu_typeahead_next(["apple", "eclair"], -1, "", "E")).toEqual({ index: 1, buffer: "e" });
		expect(menu_typeahead_next(["apple", "eclair"], -1, "", "é")).toEqual({ index: 1, buffer: "e" });
	});

	test("Space inside a search matches words with spaces", () => {
		expect(menu_typeahead_next(baseline, 2, "show", " ")).toEqual({ index: 2, buffer: "show " });
	});
});
