/*
 * The grace area is ported from Radix Primitives (`packages/react/menu/src/menu.tsx`, `onPointerLeave` of
 * `MenuSubTrigger` and `isPointInPolygon`).
 *
 * MIT License
 *
 * Copyright (c) 2022 WorkOS
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * How long the grace area lasts after the pointer leaves a submenu item (Radix).
 */
export const MENU_GRACE_TIMEOUT = 300;

/**
 * Build the area the pointer may cross on its way from a submenu item into its open submenu. While
 * the pointer is inside it and moves toward `side`, other items of the parent menu ignore hover, so
 * the submenu stays open.
 *
 * `apex` is the last pointer point seen on the submenu item. The polygon goes from that point,
 * pulled 5px back toward the item so it stays inside, to the four corners of the submenu.
 *
 * Radix reads the side from `data-side`. Here it comes from the two rects, because a CSS
 * `position-try` fallback can move the submenu to the other side, and JS cannot read which fallback
 * won. Returns null when the submenu is on neither side of the item (it overlaps it), so there is
 * no direction to protect.
 */
export function menu_grace_area(apex: Point, itemRect: Rect, submenuRect: Rect) {
	let side: "left" | "right";
	if (submenuRect.left >= itemRect.right - 1) {
		side = "right";
	} else if (submenuRect.right <= itemRect.left + 1) {
		side = "left";
	} else {
		return null;
	}

	const nearEdge = side === "right" ? submenuRect.left : submenuRect.right;
	const farEdge = side === "right" ? submenuRect.right : submenuRect.left;
	const polygon: Point[] = [
		{ x: apex.x + (side === "right" ? -5 : 5), y: apex.y },
		{ x: nearEdge, y: submenuRect.top },
		{ x: farEdge, y: submenuRect.top },
		{ x: farEdge, y: submenuRect.bottom },
		{ x: nearEdge, y: submenuRect.bottom },
	];

	return { side, polygon };
}

/**
 * Ray casting: whether `point` is inside `polygon` (Radix `isPointInPolygon`).
 */
export function menu_grace_contains(polygon: readonly Point[], point: Point) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i]!;
		const b = polygon[j]!;
		if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}

	return inside;
}
