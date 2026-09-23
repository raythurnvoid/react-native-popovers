import type { ReactNode, Ref } from "react";

export type TooltipArrowProps = {
	ref?: Ref<HTMLSpanElement>;
	id?: string;
	children?: ReactNode;
	className?: string;
};

export function TooltipArrow(props: TooltipArrowProps) {
	const { ref, id, children, className } = props;

	return (
		<span ref={ref} id={id} className={["TooltipArrow", className].filter(Boolean).join(" ")}>
			{children}
		</span>
	);
}
