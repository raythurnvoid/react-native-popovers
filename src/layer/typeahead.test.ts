import { describe, expect, test } from "vitest";
import { typeahead_is_key, typeahead_next, typeahead_normalize } from "./typeahead.ts";

const key = (value: string, modifiers: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
	key: value,
	ctrlKey: false,
	altKey: false,
	metaKey: false,
	...modifiers,
});

describe("typeahead_normalize", () => {
	test("removes accents, trims, and lowercases", () => {
		expect(typeahead_normalize("  Éclair Crème ")).toBe("eclair creme");
	});
});

describe("typeahead_is_key", () => {
	test("accepts one letter or digit", () => {
		expect(typeahead_is_key(key("a"), "")).toBe(true);
		expect(typeahead_is_key(key("7"), "")).toBe(true);
		expect(typeahead_is_key(key("ü"), "")).toBe(true);
	});

	test("rejects named keys, symbols, and modifier shortcuts", () => {
		expect(typeahead_is_key(key("ArrowDown"), "")).toBe(false);
		expect(typeahead_is_key(key("-"), "")).toBe(false);
		expect(typeahead_is_key(key("a", { ctrlKey: true }), "")).toBe(false);
		expect(typeahead_is_key(key("a", { altKey: true }), "")).toBe(false);
		expect(typeahead_is_key(key("a", { metaKey: true }), "")).toBe(false);
	});

	test("accepts Space only while a search is running", () => {
		expect(typeahead_is_key(key(" "), "")).toBe(false);
		expect(typeahead_is_key(key(" "), "show")).toBe(true);
	});
});

describe("typeahead_next", () => {
	// The files sidebar menu from the baseline, with the disabled "Paste" item already left out by the caller.
	const baseline = ["cut", "copy", "show archived items", "upload file"];

	test("the same letter cycles after the active item and wraps", () => {
		const first = typeahead_next({ texts: baseline, activeIndex: 0, buffer: "", key: "c" });
		expect(first).toEqual({ index: 1, buffer: "c" });

		const second = typeahead_next({ texts: baseline, activeIndex: first.index, buffer: first.buffer, key: "c" });
		expect(second).toEqual({ index: 0, buffer: "c" });
	});

	test("a letter whose only match is already active finds nothing, so the active item stays", () => {
		expect(typeahead_next({ texts: baseline, activeIndex: 0, buffer: "", key: "u" })).toEqual({ index: 3, buffer: "u" });
		expect(typeahead_next({ texts: baseline, activeIndex: 3, buffer: "u", key: "u" })).toEqual({ index: -1, buffer: "" });
	});

	test("no match clears the buffer and keeps the active item", () => {
		expect(typeahead_next({ texts: baseline, activeIndex: 0, buffer: "", key: "p" })).toEqual({ index: -1, buffer: "" });
	});

	test("searches from the top when the active item does not start with the letter", () => {
		// Radix would pick "avocado" here, because it searches after the active item.
		expect(typeahead_next({ texts: ["apple", "banana", "avocado"], activeIndex: 1, buffer: "", key: "a" })).toEqual({ index: 0, buffer: "a" });
	});

	test("with no active item, the first match wins", () => {
		expect(typeahead_next({ texts: baseline, activeIndex: -1, buffer: "", key: "s" })).toEqual({ index: 2, buffer: "s" });
	});

	test("more letters narrow the search", () => {
		const texts = ["copy", "cut", "cursor"];
		const first = typeahead_next({ texts, activeIndex: -1, buffer: "", key: "c" });
		const second = typeahead_next({ texts, activeIndex: first.index, buffer: first.buffer, key: "u" });
		const third = typeahead_next({ texts, activeIndex: second.index, buffer: second.buffer, key: "r" });
		expect([first, second, third]).toEqual([
			{ index: 0, buffer: "c" },
			{ index: 1, buffer: "cu" },
			{ index: 2, buffer: "cur" },
		]);
	});

	test("a repeated letter keeps growing while the active item still matches the whole buffer", () => {
		expect(typeahead_next({ texts: ["cc one", "c two"], activeIndex: 0, buffer: "c", key: "c" })).toEqual({ index: 0, buffer: "cc" });
	});

	test("uppercase and accented keys match normalized text", () => {
		expect(typeahead_next({ texts: ["apple", "eclair"], activeIndex: -1, buffer: "", key: "E" })).toEqual({ index: 1, buffer: "e" });
		expect(typeahead_next({ texts: ["apple", "eclair"], activeIndex: -1, buffer: "", key: "é" })).toEqual({ index: 1, buffer: "e" });
	});

	test("Space inside a search matches words with spaces", () => {
		expect(typeahead_next({ texts: baseline, activeIndex: 2, buffer: "show", key: " " })).toEqual({ index: 2, buffer: "show " });
	});
});
