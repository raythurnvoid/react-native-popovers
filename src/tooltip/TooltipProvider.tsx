import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { tooltip_Placement } from "./placement.ts";
import { TooltipContext, type TooltipContextValue } from "./tooltip-context.ts";
import {
	tooltip_session_claim,
	tooltip_session_is_warm,
	tooltip_session_set_open,
	tooltip_session_subscribe,
} from "./tooltip-session.ts";

export type TooltipProviderProps = {
	children?: ReactNode;
	placement?: tooltip_Placement;
	/**
	 * Hover show delay in milliseconds. Ariakit's tooltip store uses this name.
	 * Hide stays immediate. A tooltip that is open, or that just closed inside
	 * this same window, skips the delay for the next one.
	 */
	timeout?: number;
	open?: boolean;
	setOpen?: (open: boolean) => void;
};

export function TooltipProvider(props: TooltipProviderProps) {
	const { children, placement = "top", timeout = 500, open: openProp, setOpen } = props;
	const reactId = useId().replace(/:/g, "");
	const ownerId = reactId;
	const contentId = `tooltip-${reactId}`;
	const anchorName = `--nl-${reactId}`;
	const isControlled = openProp !== undefined;
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = isControlled ? Boolean(openProp) : uncontrolledOpen;
	const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
	const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
	const [pendingShow, setPendingShow] = useState(false);
	const [pointerBlocked, setPointerBlocked] = useState(false);
	const [focusBlocked, setFocusBlocked] = useState(false);
	const openRef = useRef(open);
	const pointerBlockedRef = useRef(false);
	const focusBlockedRef = useRef(false);
	const closeReasonRef = useRef<null | "hover" | "focus" | "dismiss" | "controlled">(null);
	const sawOpenRef = useRef(open);
	const timerRef = useRef<number | null>(null);
	const timerKindRef = useRef<"show" | "hide" | null>(null);
	openRef.current = open;

	const clearTimer = () => {
		if (timerRef.current == null) return;
		window.clearTimeout(timerRef.current);
		timerRef.current = null;
		timerKindRef.current = null;
	};

	const applyOpen = (next: boolean) => {
		setOpen?.(next);
		if (!isControlled) setUncontrolledOpen(next);
	};

	const requestOpenRef = useRef<(next: boolean, reason: "hover" | "focus" | "dismiss" | "controlled") => void>(() => {});

	requestOpenRef.current = (next, reason) => {
		// Write the block before the next event in this same turn can schedule a show.
		if (next && reason === "hover" && pointerBlockedRef.current) return;
		if (next && reason === "focus" && focusBlockedRef.current) return;
		if (!next && reason === "dismiss") {
			pointerBlockedRef.current = true;
			focusBlockedRef.current = true;
			setPointerBlocked(true);
			setFocusBlocked(true);
		}
		if (!next && reason === "focus") {
			pointerBlockedRef.current = true;
			focusBlockedRef.current = false;
			setPointerBlocked(true);
			setFocusBlocked(false);
		}
		if (!next && reason === "controlled") {
			pointerBlockedRef.current = true;
			setPointerBlocked(true);
		}
		if (next) {
			focusBlockedRef.current = false;
			setFocusBlocked(false);
		}
		closeReasonRef.current = next ? null : reason;
		applyOpen(next);
	};

	const cancelPendingShow = () => {
		clearTimer();
		setPendingShow(false);
	};

	const scheduleShow = () => {
		if (pointerBlockedRef.current) return;
		if (openRef.current) return;
		// Pointer move repeats while the cursor stays on the trigger.
		// Restarting a show timer here would make the delay never finish.
		// A pending hide is different: the pointer came back, so cancel the hide.
		if (timerKindRef.current === "show") return;
		clearTimer();
		const delay = tooltip_session_is_warm() ? 0 : timeout;
		setPendingShow(true);
		timerKindRef.current = "show";
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			timerKindRef.current = null;
			setPendingShow(false);
			requestOpenRef.current(true, "hover");
		}, delay);
	};

	const scheduleHide = () => {
		clearTimer();
		setPendingShow(false);
		timerKindRef.current = "hide";
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			timerKindRef.current = null;
			requestOpenRef.current(false, "hover");
		}, 0);
	};

	useEffect(() => {
		tooltip_session_set_open(ownerId, open, timeout);
		if (open) tooltip_session_claim(ownerId);
		// A parent that forces the tooltip closed did not go through hover or Escape.
		// Block the pointer until it leaves, the same way a blur close does.
		if (sawOpenRef.current && !open && closeReasonRef.current === null) {
			pointerBlockedRef.current = true;
			setPointerBlocked(true);
		}
		if (!open) closeReasonRef.current = null;
		sawOpenRef.current = open;
		return () => {
			tooltip_session_set_open(ownerId, false, timeout);
		};
	}, [open, ownerId, timeout]);

	useEffect(() => {
		return tooltip_session_subscribe((claimedId) => {
			if (claimedId !== ownerId && openRef.current) requestOpenRef.current(false, "hover");
		});
	}, [ownerId]);

	useEffect(() => {
		if (!pendingShow) return;
		const onScroll = () => {
			cancelPendingShow();
		};
		window.addEventListener("scroll", onScroll, true);
		return () => window.removeEventListener("scroll", onScroll, true);
	}, [pendingShow]);

	useEffect(() => {
		return () => {
			clearTimer();
		};
	}, []);

	const value: TooltipContextValue = {
		placement,
		timeout,
		gutter: 8,
		open,
		contentId,
		anchorName,
		anchorElement,
		setAnchorElement,
		contentElement,
		setContentElement,
		requestOpen: (next, reason) => requestOpenRef.current(next, reason),
		cancelPendingShow,
		scheduleShow,
		scheduleHide,
		pointerBlocked,
		focusBlocked,
		clearPointerBlock: () => {
			pointerBlockedRef.current = false;
			setPointerBlocked(false);
		},
	};

	return <TooltipContext value={value}>{children}</TooltipContext>;
}
