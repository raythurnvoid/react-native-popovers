export const PLACEMENTS = [
	"top",
	"bottom",
	"left",
	"right",
	"top-start",
	"top-end",
	"bottom-start",
	"bottom-end",
	"left-start",
	"left-end",
	"right-start",
	"right-end",
] as const;

export type Placement = (typeof PLACEMENTS)[number];

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

/**
 * Map an Ariakit placement to a CSS position-area value.
 *
 * The keywords are the self-* family. A top-layer popover's containing block
 * is the viewport, so plain inline-start would ignore the element's direction.
 * Start alignment spans toward the inline end so the popup's start edge
 * meets the trigger's start edge. This is the same map Astryx uses.
 *
 * Firefox quirk (checked in Firefox 155): in RTL, Firefox resolves the self-* keywords to the wrong
 * side. So an RTL menu, submenu, or tooltip can open on the opposite side, or off screen. LTR is
 * fine. We keep the logical keywords and add no Firefox-only fallback. The e2e tests skip this case
 * (see the README browser notes).
 */
export function placement_position_area(placement: Placement): string {
	const { side, align } = split_placement(placement);
	if (side === "top" || side === "bottom") {
		const block = side === "top" ? "self-block-start" : "self-block-end";
		if (align === "start") return `${block} span-self-inline-end`;
		if (align === "end") return `${block} span-self-inline-start`;
		return block;
	}

	const inline = side === "left" ? "self-inline-start" : "self-inline-end";
	if (align === "start") return `${inline} span-self-block-end`;
	if (align === "end") return `${inline} span-self-block-start`;
	return inline;
}

/**
 * Flip list for position-try-fallbacks.
 *
 * A centered popup stays centered when you only flip, so overflow on the
 * other axis still clips it. Centered placements add span slides after the flips.
 * The slides use the same logical self-* keywords as the placement, so RTL keeps working.
 * The tooltip arrow in tooltip.css matches these exact values in its anchored container
 * queries, so keep both in sync.
 */
export function placement_position_try_fallbacks(placement: Placement): string {
	const { side, align } = split_placement(placement);
	const flips = "flip-block, flip-inline, flip-block flip-inline";
	if (align !== "center") return flips;

	if (side === "top" || side === "bottom") {
		const same = side === "top" ? "self-block-start" : "self-block-end";
		const opposite = side === "top" ? "self-block-end" : "self-block-start";
		return `${flips}, ${same} span-self-inline-start, ${same} span-self-inline-end, ${opposite} span-self-inline-start, ${opposite} span-self-inline-end`;
	}

	const same = side === "left" ? "self-inline-start" : "self-inline-end";
	const opposite = side === "left" ? "self-inline-end" : "self-inline-start";
	return `${flips}, ${same} span-self-block-start, ${same} span-self-block-end, ${opposite} span-self-block-start, ${opposite} span-self-block-end`;
}

export function placement_side(placement: Placement): Side {
	return split_placement(placement).side;
}

export function placement_align(placement: Placement): Align {
	return split_placement(placement).align;
}

function split_placement(placement: Placement): { side: Side; align: Align } {
	const [side, align = "center"] = placement.split("-") as [Side, Align | undefined];
	return { side, align: align ?? "center" };
}
