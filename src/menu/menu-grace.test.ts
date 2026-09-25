import { describe, expect, test } from "vitest";
import { menu_grace_area, menu_grace_contains } from "./menu-grace.ts";

// A parent menu item at x 0-200 and a submenu 8px to its right, like t3-chat's "Turn into" submenu.
const item = { left: 0, right: 200, top: 100, bottom: 132 };
const submenuRight = { left: 208, right: 408, top: 95, bottom: 395 };
const submenuLeft = { left: -208, right: -8, top: 95, bottom: 395 };

describe("menu_grace_area", () => {
	test("a submenu on the right builds a polygon from the apex to its four corners", () => {
		expect(menu_grace_area({ x: 180, y: 110 }, item, submenuRight)).toEqual({
			side: "right",
			polygon: [
				{ x: 175, y: 110 },
				{ x: 208, y: 95 },
				{ x: 408, y: 95 },
				{ x: 408, y: 395 },
				{ x: 208, y: 395 },
			],
		});
	});

	test("a submenu that a CSS fallback flipped to the left gets the left side", () => {
		const area = menu_grace_area({ x: 20, y: 110 }, item, submenuLeft);
		expect(area?.side).toBe("left");
		expect(area?.polygon[0]).toEqual({ x: 25, y: 110 });
	});

	test("a submenu that overlaps the item has no grace area", () => {
		expect(menu_grace_area({ x: 100, y: 110 }, item, { left: 100, right: 300, top: 132, bottom: 400 })).toBeNull();
	});
});

describe("menu_grace_contains", () => {
	const area = menu_grace_area({ x: 180, y: 110 }, item, submenuRight)!;

	test("a diagonal path from the item toward the submenu bottom stays inside", () => {
		// The pointer crosses the other items below it on its way down and right.
		for (const point of [
			{ x: 185, y: 115 },
			{ x: 195, y: 150 },
			{ x: 204, y: 250 },
			{ x: 207, y: 380 },
		]) {
			expect(menu_grace_contains(area.polygon, point)).toBe(true);
		}
	});

	test("a point straight below the item is outside", () => {
		expect(menu_grace_contains(area.polygon, { x: 150, y: 200 })).toBe(false);
	});

	test("a point behind the apex is outside", () => {
		expect(menu_grace_contains(area.polygon, { x: 100, y: 110 })).toBe(false);
	});

	test("a point above the submenu top is outside", () => {
		expect(menu_grace_contains(area.polygon, { x: 300, y: 50 })).toBe(false);
	});
});
