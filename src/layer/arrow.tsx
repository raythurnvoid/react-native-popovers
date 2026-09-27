import { memo, useId, useLayoutEffect, useRef, type ComponentPropsWithRef, type CSSProperties } from "react";
import { cx, useFn, useForwardRefs } from "../react-utils.ts";
import type { placement_side } from "./placement.ts";
import "./arrow.css";

// Adapted from Ariakit's PopoverArrow (MIT, Copyright (c) Diego Haz):
// packages/ariakit-react-components/src/popover/popover-arrow.tsx
// Changes: CSS anchor positioning places and rotates the arrow, and the colors are written to CSS
// variables instead of React state, so reading them does not render again.

/*
 * Copyright 2017 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications Copyright 2019 - present by Diego Haz.
 *
 * Extracted the SVG path and made the tip more angled.
 *
 * Copied from Ariakit: packages/ariakit-react-components/src/popover/popover-arrow-path.ts
 */
const ARROW_PATH =
	"M23 27.8C24.1 29 26.4 30 28 30H30H0H2C3.7 30 5.9 29 7 27.8L14 20.6C14.7 19.8 15.3 19.8 16 20.6L23 27.8Z";

/**
 * The class and the variables of a positioner that holds a `LayerArrow`.
 */
export type LayerArrowHost_ClassNames = "np-ArrowHost";

export type LayerArrowHost_CssVars = {
	"--np-Arrow-anchor": string;
	"--np-Arrow-box": string;
};

type LayerArrow_ClassNames = "np-Arrow" | "np-Arrow-underlay";

type LayerArrow_CssVars = {
	"--np-Arrow-size": string;
};

export type LayerArrowProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
	/**
	 * Width and height of the arrow box, in pixels. The visible tip is about a third of it.
	 */
	size: number;
	/**
	 * Stroke width. Read from the content's border, or from a ring box-shadow, when omitted.
	 */
	borderWidth: number | undefined;
	/**
	 * The owner's open state, from its snapshot. The colors are read again on each open.
	 */
	open: boolean;
	/**
	 * The side the owner asked for, from its snapshot. The border color is read on that side.
	 */
	side: ReturnType<typeof placement_side>;
};

// The SVG path is drawn in a 30 by 30 box.
const VIEW_SIZE = 30;

/**
 * Replace every character inside parentheses with a space. Then length matching and comma splitting
 * cannot pick up numbers or commas from color functions such as rgb() or oklch(). The indexes still
 * match the original text.
 */
function mask_parentheses(text: string) {
	let masked = "";
	let depth = 0;
	for (const char of text) {
		if (char === "(") depth += 1;
		if (char === ")") depth = Math.max(0, depth - 1);
		masked += depth > 0 && char !== "(" ? " " : char;
	}
	return masked;
}

// A ring is a box-shadow part with zero x, y, and blur, and a positive spread.
const RING_LENGTHS = /(?:^|\s)0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+((?:\d*\.)?\d+)px(?=\s|$)/;

/**
 * Find the first box-shadow part that draws a ring, like Tailwind ring utilities, and return its
 * width and color. Copied in spirit from Ariakit's getRing.
 */
function get_ring(style: CSSStyleDeclaration) {
	const boxShadow = style.getPropertyValue("box-shadow");
	if (!boxShadow || boxShadow === "none") return;

	const masked = mask_parentheses(boxShadow);
	let start = 0;
	// Split on top-level commas only. rgb(59, 130, 246) has commas of its own, but they are masked.
	for (let index = 0; index <= masked.length; index += 1) {
		if (index !== masked.length && masked[index] !== ",") continue;
		const segment = boxShadow.slice(start, index);
		const match = masked.slice(start, index).match(RING_LENGTHS);
		start = index + 1;
		const width = match?.[1] ? Number.parseFloat(match[1]) : 0;
		// A zero spread is a placeholder, not a ring.
		if (!match || !width) continue;

		const lengthsStart = match.index ?? 0;
		const rest = `${segment.slice(0, lengthsStart)} ${segment.slice(lengthsStart + match[0].length)}`;
		const color = rest.replace(/\binset\b/g, " ").trim();
		return { width, color };
	}
	return;
}

/**
 * The arrow that `TooltipArrow` and `HovercardArrow` render. It must sit inside the content of a
 * positioner with the class `np-ArrowHost` that sets `--np-Arrow-anchor` (the anchor name) and
 * `--np-Arrow-box` (its own anchor name, see `arrow.css`).
 *
 * It points at the anchor's center and moves to the other side when the browser flips the layer.
 * It takes its fill and stroke from the content's background and border, or from a ring box-shadow.
 */
export const LayerArrow = memo(function LayerArrow(props: LayerArrowProps) {
	const { ref, className, style, size, borderWidth, open, side, ...rest } = props;
	const maskId = useId();
	const element = useRef<HTMLDivElement | null>(null);

	const setElement = useFn((node: HTMLDivElement) => {
		element.current = node;
		return () => {
			element.current = null;
		};
	});

	useForwardRefs(element, [ref]);

	// The host adds half the arrow size to the gap, so the tip reaches toward the anchor.
	useLayoutEffect(() => {
		const host = element.current?.closest<HTMLElement>(".np-ArrowHost");
		host?.style.setProperty("--np-ArrowHost-arrow-size", `${size}px`);
		return () => {
			host?.style.removeProperty("--np-ArrowHost-arrow-size");
		};
	}, [size]);

	useLayoutEffect(() => {
		const node = element.current;
		const host = node?.closest<HTMLElement>(".np-ArrowHost");
		const content = host && [...host.children].find((child) => child.contains(node!));
		if (!node || !content || !open) return;

		const computed = content.ownerDocument.defaultView!.getComputedStyle(content);
		const fill = computed.getPropertyValue("background-color") || "none";
		const borderColor = computed.getPropertyValue(`border-${side}-color`) || "none";
		const border = Number.parseFloat(computed.getPropertyValue(`border-${side}-width`)) || 0;
		// A ring sits outside the box, so the arrow base does not overlap it. A border is inside the box.
		const ring = borderWidth === undefined && !border ? get_ring(computed) : undefined;
		const stroke = ring ? ring.color || computed.getPropertyValue("color") || "none" : borderColor;
		const width = borderWidth ?? (ring ? Math.ceil(ring.width) : Math.ceil(border));

		node.style.setProperty("--np-Arrow-fill", fill);
		node.style.setProperty("--np-Arrow-stroke", stroke);
		node.style.setProperty("--np-Arrow-border", `${border}px`);
		// The stroke is drawn in the 30px view box, and half of it is masked away.
		node.style.setProperty("--np-Arrow-stroke-width", `${width * 2 * (VIEW_SIZE / size)}`);
		node.toggleAttribute("data-ring", !!ring);
	}, [open, side, size, borderWidth]);

	return (
		<div
			{...rest}
			ref={setElement}
			aria-hidden
			className={cx("np-Arrow" satisfies LayerArrow_ClassNames, className)}
			style={{ "--np-Arrow-size": `${size}px`, ...style } satisfies LayerArrow_CssVars as CSSProperties}
		>
			<svg display="block" viewBox="0 0 30 30">
				{/* This path paints the content background under the border stroke, like an HTML border. */}
				<path
					className={"np-Arrow-underlay" satisfies LayerArrow_ClassNames}
					fill="none"
					style={{ stroke: "var(--np-Arrow-fill)" }}
					d={ARROW_PATH}
					mask={`url(#${CSS.escape(maskId)})`}
				/>
				<path fill="none" d={ARROW_PATH} mask={`url(#${CSS.escape(maskId)})`} />
				<path stroke="none" d={ARROW_PATH} />
				<mask id={maskId} maskUnits="userSpaceOnUse">
					<rect x="-15" y="0" width="60" height="30" fill="white" stroke="black" />
				</mask>
			</svg>
		</div>
	);
});
