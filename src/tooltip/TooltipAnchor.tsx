import { cloneElement, isValidElement, useEffect, type FocusEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { tooltip_add_anchor_name } from "./popover.ts";
import { useTooltipContext } from "./tooltip-context.ts";

type AnchorEventProps = {
	ref?: Ref<HTMLElement>;
	className?: string;
	id?: string;
	tabIndex?: number;
	"aria-describedby"?: string;
	onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
	onPointerOver?: (event: PointerEvent<HTMLElement>) => void;
	onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
	onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
	onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
};

export type TooltipAnchorProps = {
	render?: ReactElement<AnchorEventProps> | ((props: AnchorEventProps) => ReactNode);
	children?: ReactElement<AnchorEventProps>;
	className?: string;
	id?: string;
	ref?: Ref<HTMLElement>;
	tabIndex?: number;
	focusable?: boolean;
	disabled?: boolean;
};

export function TooltipAnchor(props: TooltipAnchorProps) {
	const { render, children, className, id, ref, tabIndex, focusable = true, disabled = false } = props;
	const tooltip = useTooltipContext();
	const child = render ?? children;

	useEffect(() => {
		const anchor = tooltip.anchorElement;
		if (!anchor) return;
		return tooltip_add_anchor_name(anchor, tooltip.anchorName);
	}, [tooltip.anchorElement, tooltip.anchorName]);

	if (!isValidElement(child) && typeof child !== "function") return null;

	const describedBy = merge_described_by(
		isValidElement(child) ? child.props["aria-describedby"] : undefined,
		tooltip.open ? tooltip.contentId : undefined,
	);

	const anchorProps: AnchorEventProps = {
		id,
		className,
		tabIndex: focusable ? tabIndex : (tabIndex ?? -1),
		"aria-describedby": describedBy,
		ref: (node) => {
			assign_ref(ref, node);
			if (isValidElement(child)) assign_ref(child.props.ref, node);
			tooltip.setAnchorElement(node);
		},
		onPointerEnter: (event) => {
			if (isValidElement(child)) child.props.onPointerEnter?.(event);
			if (disabled || event.pointerType === "touch") return;
			tooltip.scheduleShow();
		},
		onPointerOver: (event) => {
			if (isValidElement(child)) child.props.onPointerOver?.(event);
			if (disabled || event.pointerType === "touch") return;
			tooltip.scheduleShow();
		},
		onPointerMove: (event) => {
			if (isValidElement(child)) child.props.onPointerMove?.(event);
			if (disabled || event.pointerType === "touch") return;
			if (tooltip.pointerBlocked) return;
			if (!tooltip.open) tooltip.scheduleShow();
		},
		onPointerDown: (event) => {
			if (isValidElement(child)) child.props.onPointerDown?.(event);
			tooltip.cancelPendingShow();
		},
		onPointerLeave: (event) => {
			if (isValidElement(child)) child.props.onPointerLeave?.(event);
			tooltip.clearPointerBlock();
			if (disabled) return;
			const next = event.relatedTarget;
			if (next instanceof Node && tooltip.contentElement?.contains(next)) return;
			tooltip.cancelPendingShow();
			tooltip.scheduleHide();
		},
		onFocus: (event) => {
			if (isValidElement(child)) child.props.onFocus?.(event);
			if (disabled || !focusable) return;
			if (tooltip.focusBlocked) return;
			tooltip.cancelPendingShow();
			tooltip.requestOpen(true, "focus");
		},
		onBlur: (event) => {
			if (isValidElement(child)) child.props.onBlur?.(event);
			const next = event.relatedTarget;
			if (next instanceof Node && tooltip.contentElement?.contains(next)) return;
			tooltip.requestOpen(false, "focus");
		},
	};

	if (typeof child === "function") return child(anchorProps);
	if (!isValidElement(child)) return null;

	return cloneElement(child, {
		...anchorProps,
		id: child.props.id ?? anchorProps.id,
		className: [child.props.className, className].filter(Boolean).join(" ") || undefined,
		tabIndex: child.props.tabIndex ?? anchorProps.tabIndex,
		"aria-describedby": describedBy,
	});
}

function merge_described_by(existing: string | undefined, tooltipId: string | undefined) {
	const parts = (existing ?? "").split(/\s+/).filter((part) => part && part !== tooltipId);
	if (tooltipId) parts.push(tooltipId);
	return parts.join(" ") || undefined;
}

function assign_ref(ref: Ref<HTMLElement> | undefined, node: HTMLElement | null) {
	if (!ref) return;
	if (typeof ref === "function") {
		ref(node);
		return;
	}
	ref.current = node;
}
