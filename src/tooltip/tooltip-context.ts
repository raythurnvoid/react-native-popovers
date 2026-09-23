import { createContext, use } from "react";
import type { tooltip_Placement } from "./placement.ts";

export type TooltipOpenReason = "hover" | "focus" | "dismiss" | "controlled";

export type TooltipContextValue = {
	placement: tooltip_Placement;
	timeout: number;
	gutter: number;
	open: boolean;
	contentId: string;
	anchorName: string;
	anchorElement: HTMLElement | null;
	setAnchorElement: (element: HTMLElement | null) => void;
	contentElement: HTMLElement | null;
	setContentElement: (element: HTMLElement | null) => void;
	requestOpen: (next: boolean, reason: TooltipOpenReason) => void;
	cancelPendingShow: () => void;
	scheduleShow: () => void;
	scheduleHide: () => void;
	pointerBlocked: boolean;
	focusBlocked: boolean;
	clearPointerBlock: () => void;
};

export const TooltipContext = createContext<TooltipContextValue | null>(null);

export function useTooltipContext() {
	const value = use(TooltipContext);
	if (!value) throw new Error("Tooltip parts must be rendered inside TooltipProvider");
	return value;
}
