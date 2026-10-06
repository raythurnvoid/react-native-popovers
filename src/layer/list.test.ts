import { describe, expect, test } from "vitest";
import { list_enabled, list_step } from "./list.ts";

describe("list_step", () => {
	test("with no active item, ArrowDown goes to the first item and ArrowUp to the last", () => {
		expect(list_step({ length: 4, index: -1, key: "ArrowDown", loop: "none" })).toBe(0);
		expect(list_step({ length: 4, index: -1, key: "ArrowUp", loop: "none" })).toBe(3);
	});

	test("Home and End go to the ends from anywhere", () => {
		expect(list_step({ length: 4, index: 2, key: "Home", loop: "none" })).toBe(0);
		expect(list_step({ length: 4, index: 1, key: "End", loop: "through-owner" })).toBe(3);
	});

	test("without a loop, the arrows stop at the ends", () => {
		expect(list_step({ length: 4, index: 3, key: "ArrowDown", loop: "none" })).toBeUndefined();
		expect(list_step({ length: 4, index: 0, key: "ArrowUp", loop: "none" })).toBeUndefined();
	});

	test("through the owner, the ends lead to no active item, and then around", () => {
		expect(list_step({ length: 4, index: 3, key: "ArrowDown", loop: "through-owner" })).toBe(-1);
		expect(list_step({ length: 4, index: 0, key: "ArrowUp", loop: "through-owner" })).toBe(-1);
		expect(list_step({ length: 4, index: -1, key: "ArrowDown", loop: "through-owner" })).toBe(0);
		expect(list_step({ length: 4, index: -1, key: "ArrowUp", loop: "through-owner" })).toBe(3);
	});

	test("an empty list never moves", () => {
		expect(list_step({ length: 0, index: -1, key: "ArrowDown", loop: "through-owner" })).toBeUndefined();
		expect(list_step({ length: 0, index: -1, key: "Home", loop: "none" })).toBeUndefined();
	});
});

describe("list_enabled", () => {
	// The tests run in Node without a DOM, so plain objects stand in for the items.
	const item = (attributes: Record<string, string>) =>
		({
			getAttribute: (name: string) => attributes[name] ?? null,
			hasAttribute: (name: string) => name in attributes,
		}) as unknown as HTMLElement;
	const arrowDownFrom = (list: HTMLElement[], from: HTMLElement) =>
		list[list_step({ length: list.length, index: list.indexOf(from), key: "ArrowDown", loop: "none" })!];

	test("ArrowDown skips a disabled item", () => {
		const items = [item({}), item({ "aria-disabled": "true" }), item({})];
		expect(arrowDownFrom(list_enabled(items), items[0]!)).toBe(items[2]);
	});

	test("ArrowDown reaches a disabled item that stays accessible when disabled", () => {
		const items = [item({}), item({ "aria-disabled": "true", "data-accessible-when-disabled": "true" }), item({})];
		expect(arrowDownFrom(list_enabled(items), items[0]!)).toBe(items[1]);
	});
});
