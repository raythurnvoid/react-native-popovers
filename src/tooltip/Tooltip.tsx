import { useEffect, type CSSProperties, type ReactNode, type Ref } from "react";
import { tooltip_align, tooltip_position_area, tooltip_position_try_fallbacks, tooltip_side } from "./placement.ts";
import { tooltip_hide_popover, tooltip_show_popover } from "./popover.ts";
import { useTooltipContext } from "./tooltip-context.ts";
import "./Tooltip.css";

export type TooltipProps = {
	children?: ReactNode;
	className?: string;
	id?: string;
	ref?: Ref<HTMLDivElement>;
	/**
	 * Accepted so existing call sites can keep passing it.
	 * The popover top layer already lifts the tooltip, so this does not create a React portal.
	 */
	portal?: boolean;
	gutter?: number;
	unmountOnHide?: boolean;
};

export function Tooltip(props: TooltipProps) {
	const { children, className, id, ref, gutter, unmountOnHide = true } = props;
	const tooltip = useTooltipContext();
	const gap = gutter ?? tooltip.gutter;

	useEffect(() => {
		const element = tooltip.contentElement;
		if (!element) return;
		const anchor = tooltip.anchorElement;
		element.style.setProperty("position-anchor", tooltip.anchorName);
		element.style.setProperty("position-area", tooltip_position_area(tooltip.placement));
		element.style.setProperty("position-try-fallbacks", tooltip_position_try_fallbacks(tooltip.placement));
		if (tooltip_align(tooltip.placement) === "center") element.style.setProperty("place-self", "anchor-center");
		else element.style.removeProperty("place-self");
		if (tooltip.open) tooltip_show_popover(element, anchor);
		else tooltip_hide_popover(element);
	}, [tooltip.open, tooltip.contentElement, tooltip.anchorElement, tooltip.placement, tooltip.anchorName]);

	useEffect(() => {
		const element = tooltip.contentElement;
		if (!element) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !tooltip.open) return;
			event.preventDefault();
			tooltip.requestOpen(false, "dismiss");
		};
		element.ownerDocument.addEventListener("keydown", onKeyDown);
		return () => element.ownerDocument.removeEventListener("keydown", onKeyDown);
	}, [tooltip.contentElement, tooltip.open, tooltip.requestOpen]);

	if (!tooltip.open && unmountOnHide) return null;

	const side = tooltip_side(tooltip.placement);
	const align = tooltip_align(tooltip.placement);

	return (
		<div
			ref={(node) => {
				assign_content_ref(ref, node);
				tooltip.setContentElement(node);
			}}
			id={id ?? tooltip.contentId}
			role="tooltip"
			popover="manual"
			data-side={side}
			data-align={align}
			className={["Tooltip", className].filter(Boolean).join(" ")}
			style={tooltip_margin_style(tooltip.placement, gap)}
		>
			{children}
		</div>
	);
}

/**
 * Put the gutter on both edges of the axis that can flip.
 * position-try can flip the tooltip at paint time. A margin on only one edge
 * ends up on the far side, and the gap disappears.
 */
function tooltip_margin_style(placement: Parameters<typeof tooltip_side>[0], gutter: number): CSSProperties {
	const side = tooltip_side(placement);
	const gap = `${gutter}px`;
	const marginBlock = side === "top" || side === "bottom" ? gap : "0";
	const marginInline = side === "left" || side === "right" ? gap : "0";

	return {
		position: "fixed",
		inset: "auto",
		margin: "0",
		marginBlockStart: marginBlock,
		marginBlockEnd: marginBlock,
		marginInlineStart: marginInline,
		marginInlineEnd: marginInline,
	};
}

function assign_content_ref(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
	if (!ref) return;
	if (typeof ref === "function") {
		ref(node);
		return;
	}
	ref.current = node;
}
