import { describe, expect, test } from "vitest";
import { list_step } from "./list.ts";

describe("list_step", () => {
	test("with no active item, ArrowDown goes to the first item and ArrowUp to the last", () => {
		expect(list_step(4, -1, "ArrowDown", "none")).toBe(0);
		expect(list_step(4, -1, "ArrowUp", "none")).toBe(3);
	});

	test("Home and End go to the ends from anywhere", () => {
		expect(list_step(4, 2, "Home", "none")).toBe(0);
		expect(list_step(4, 1, "End", "through-owner")).toBe(3);
	});

	test("without a loop, the arrows stop at the ends", () => {
		expect(list_step(4, 3, "ArrowDown", "none")).toBeUndefined();
		expect(list_step(4, 0, "ArrowUp", "none")).toBeUndefined();
	});

	test("through the owner, the ends lead to no active item, and then around", () => {
		expect(list_step(4, 3, "ArrowDown", "through-owner")).toBe(-1);
		expect(list_step(4, 0, "ArrowUp", "through-owner")).toBe(-1);
		expect(list_step(4, -1, "ArrowDown", "through-owner")).toBe(0);
		expect(list_step(4, -1, "ArrowUp", "through-owner")).toBe(3);
	});

	test("an empty list never moves", () => {
		expect(list_step(0, -1, "ArrowDown", "through-owner")).toBeUndefined();
		expect(list_step(0, -1, "Home", "none")).toBeUndefined();
	});
});
