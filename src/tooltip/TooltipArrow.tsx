import type { ReactNode } from "react";

export type TooltipArrowProps = {
	children?: ReactNode;
	className?: string;
};

export function TooltipArrow(props: TooltipArrowProps) {
	const { children, className } = props;

	return <span className={["TooltipArrow", className].filter(Boolean).join(" ")}>{children}</span>;
}
