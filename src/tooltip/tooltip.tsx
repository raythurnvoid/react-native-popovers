import {
	createContext,
	createElement,
	isValidElement,
	memo,
	use,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type ComponentPropsWithRef,
	type CSSProperties,
	type FocusEvent,
	type HTMLAttributes,
	type KeyboardEvent,
	type PointerEvent,
	type ReactElement,
	type ReactNode,
	type Ref,
	type RefCallback,
	type SyntheticEvent,
} from "react";
import { cx, useFn, useForwardRefs } from "../react-utils.ts";
import {
	tooltip_align,
	tooltip_position_area,
	tooltip_position_try_fallbacks,
	tooltip_side,
	type tooltip_Placement,
} from "./placement.ts";
import { createTooltip, type TooltipController } from "./tooltip-controller.ts";
import "./tooltip.css";

// #region context
// The value is one stable controller, so reading it never renders a consumer again.
const TooltipContext = createContext<TooltipController | null>(null);

function useTooltipContext(owner: string) {
	const tooltip = use(TooltipContext);
	if (!tooltip) throw new Error(`${owner} must be used within TooltipProvider`);
	return tooltip;
}
// #endregion context

// #region provider
export type TooltipProviderProps = {
	children?: ReactNode;
	/**
	 * Preferred side and alignment, with Ariakit names. The browser flips it when it does not fit.
	 * @default "top"
	 */
	placement?: tooltip_Placement;
	/**
	 * Hover show delay in milliseconds. Hide is immediate. After a close, the next tooltip in the
	 * same document skips the delay for this long.
	 * @default 500
	 */
	timeout?: number;
	/**
	 * Controlled open state. `true` forces it open, `false` forces it closed. Omit it for uncontrolled.
	 */
	open?: boolean;
	/**
	 * Called when an interaction asks to open or close, even when a controlled parent ignores it.
	 */
	setOpen?: (open: boolean) => void;
};

/**
 * Owns one tooltip. Put `TooltipAnchor` and `Tooltip` inside it.
 *
 * @example
 * ```tsx
 * <TooltipProvider placement="bottom">
 *   <TooltipAnchor render={<button type="button">Save</button>} />
 *   <Tooltip>
 *     Save the file
 *     <TooltipArrow />
 *   </Tooltip>
 * </TooltipProvider>
 * ```
 */
export const TooltipProvider = memo(function TooltipProvider(props: TooltipProviderProps) {
	const { children, placement = "top", timeout = 500, open, setOpen } = props;
	const options = { placement, timeout, open, setOpen };
	const [tooltip] = useState(() => createTooltip(options));

	useLayoutEffect(() => {
		tooltip.configure(options);
	});

	useLayoutEffect(() => () => tooltip.destroy(), [tooltip]);

	return <TooltipContext value={tooltip}>{children}</TooltipContext>;
});
// #endregion provider

// #region anchor
type TooltipAnchorRenderProps = HTMLAttributes<HTMLElement> & { ref: RefCallback<HTMLElement> };

export type TooltipAnchorProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the anchor props merged in. A function gets them as its argument.
	 * Without it, the anchor is a `div` around `children`.
	 */
	render?: ReactElement | ((props: TooltipAnchorRenderProps) => ReactNode);
	/**
	 * Show the tooltip on keyboard focus, and add `tabIndex={0}` to an element that cannot take focus.
	 * @default true
	 */
	focusable?: boolean;
	/**
	 * Never show the tooltip from this anchor, and mark it with `aria-disabled`.
	 * @default false
	 */
	disabled?: boolean;
};

type EventHandler = (event: SyntheticEvent<HTMLElement>) => void;

const ANCHOR_EVENT_NAMES = new Set([
	"onPointerEnter",
	"onPointerMove",
	"onPointerLeave",
	"onPointerDown",
	"onFocus",
	"onBlur",
	"onKeyDown",
] as const);

type AnchorEventName = typeof ANCHOR_EVENT_NAMES extends Set<infer Name> ? Name : never;

const DISABLEABLE_TAGS = new Set(["button", "fieldset", "input", "optgroup", "option", "select", "textarea"]);

const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);

function is_natively_tabbable(element: HTMLElement) {
	switch (element.tagName) {
		case "BUTTON":
		case "IFRAME":
		case "SELECT":
		case "SUMMARY":
		case "TEXTAREA":
			return true;
		case "INPUT":
			return (element as HTMLInputElement).type !== "hidden";
		case "A":
		case "AREA":
			return element.hasAttribute("href");
		case "AUDIO":
		case "VIDEO":
			return element.hasAttribute("controls");
	}
	return element.isContentEditable;
}

const BUTTON_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "image", "radio", "reset", "submit"]);

/**
 * Safari does not focus a button, checkbox, or radio on click unless it has an explicit tabIndex.
 * Ariakit's Focusable adds one, so a key after a click can open the tooltip. Ariakit also checks for a
 * Mac platform. Real Safari always runs on Apple platforms, and the vendor check alone also covers
 * Playwright's WebKit on Windows.
 */
function needs_safari_tab_index(element: HTMLElement) {
	if (!/apple/i.test(element.ownerDocument.defaultView?.navigator.vendor ?? "")) return false;
	if (element.tagName === "BUTTON") return true;
	return element.tagName === "INPUT" && BUTTON_INPUT_TYPES.has((element as HTMLInputElement).type);
}

/**
 * The element that shows the tooltip on hover and on keyboard focus.
 * Hover and focus do not render it again. The tooltip id is added to its `aria-describedby` while open.
 */
export const TooltipAnchor = memo(function TooltipAnchor(props: TooltipAnchorProps) {
	const { ref, render, focusable = true, disabled = false, children, ...rest } = props;
	const tooltip = useTooltipContext("TooltipAnchor");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const elementProps = renderElement?.props ?? {};
	// Whether the current focus came from the keyboard. Reset on blur.
	const keyboardFocus = useRef(false);
	const element = useRef<HTMLElement | null>(null);
	// Whether this component added the tabindex attribute, so it may remove it again.
	const addedTabIndex = useRef(false);

	// One stable handler for every tooltip event. It reads refs, so it must be a useFn: the React
	// Compiler cannot tell that the merged props below are only called as event handlers.
	const handleInternal = useFn((name: AnchorEventName, event: SyntheticEvent<HTMLElement>) => {
		switch (name) {
			case "onPointerEnter":
				// Touch never opens a tooltip. Chrome's mouse events after a tap are not pointer events.
				if ((event as PointerEvent<HTMLElement>).pointerType === "touch" || disabled) return;
				tooltip.pointerEnter();
				return;
			case "onPointerMove":
				if ((event as PointerEvent<HTMLElement>).pointerType === "touch" || disabled) return;
				tooltip.pointerMove(event.currentTarget);
				return;
			case "onPointerLeave":
				tooltip.pointerLeave((event as PointerEvent<HTMLElement>).relatedTarget);
				return;
			case "onPointerDown":
				tooltip.pointerDown();
				return;
			case "onFocus":
				// Focus on a nested control belongs to that control.
				if (event.target !== event.currentTarget || !focusable || disabled) return;
				// :focus-visible is the browser's own keyboard check. A mouse press or a tap on a button does not match.
				keyboardFocus.current = event.currentTarget.matches(":focus-visible");
				if (keyboardFocus.current) tooltip.focus(event.currentTarget);
				return;
			case "onBlur":
				if (event.target !== event.currentTarget) return;
				keyboardFocus.current = false;
				tooltip.blur((event as FocusEvent<HTMLElement>).relatedTarget);
				return;
			case "onKeyDown": {
				const { key, altKey, ctrlKey, metaKey } = event as KeyboardEvent<HTMLElement>;
				if (keyboardFocus.current || !focusable || disabled || event.target !== event.currentTarget) return;
				if (altKey || ctrlKey || metaKey || MODIFIER_KEYS.has(key)) return;
				// A key after a mouse focus switches to keyboard use once per focus, as in Ariakit.
				// Escape counts too, so the next key cannot reopen the tooltip that Escape closed.
				if (key === "Escape") {
					keyboardFocus.current = true;
					return;
				}
				const element = event.currentTarget;
				// Let the other key handlers run first, and respect their preventDefault.
				queueMicrotask(() => {
					if (event.defaultPrevented || element.ownerDocument.activeElement !== element) return;
					keyboardFocus.current = true;
					tooltip.focus(element);
				});
			}
		}
	});

	// Merge like Ariakit: the render element's values win, class names and styles join, and every
	// handler runs. The internal handler runs last and skips when an earlier one called preventDefault.
	const merged: Record<string, unknown> = { ...rest, children };
	for (const [key, value] of Object.entries(elementProps)) {
		if (value === undefined || key === "ref") continue;
		merged[key] = value;
	}
	merged.className = cx(rest.className, elementProps.className as string | undefined);
	merged.style = rest.style || elementProps.style ? { ...rest.style, ...(elementProps.style as object) } : undefined;
	for (const key of new Set([...Object.keys(rest), ...Object.keys(elementProps), ...ANCHOR_EVENT_NAMES])) {
		if (!/^on[A-Z]/.test(key)) continue;
		const elementHandler = elementProps[key] as EventHandler | undefined;
		const propHandler = (rest as Record<string, unknown>)[key] as EventHandler | undefined;
		const internal = ANCHOR_EVENT_NAMES.has(key as AnchorEventName);
		merged[key] = (event: SyntheticEvent<HTMLElement>) => {
			if (typeof elementHandler === "function") elementHandler(event);
			if (typeof propHandler === "function") propHandler(event);
			// The layer stack marks a used Escape before React sees it. The key handler must still record it.
			if (internal && (!event.defaultPrevented || (event as KeyboardEvent<HTMLElement>).key === "Escape")) {
				handleInternal(key as AnchorEventName, event);
			}
		};
	}
	if (disabled) {
		merged["aria-disabled"] = true;
		if (typeof renderElement?.type === "string" && DISABLEABLE_TAGS.has(renderElement.type)) merged.disabled = true;
	}

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		addedTabIndex.current = false;
		tooltip.registerAnchor(node, null);

		return () => {
			element.current = null;
			tooltip.registerAnchor(null, node);
		};
	});
	merged.ref = setRef;

	useForwardRefs(element, [ref, elementProps.ref as Ref<HTMLElement> | undefined]);

	// Match Ariakit: an element that cannot take focus gets tabIndex 0, and so does a button in Safari.
	// The check needs the DOM node, and it runs again when focusable or disabled changes.
	// A tabIndex prop always wins.
	useLayoutEffect(() => {
		const node = element.current;
		if (!node || merged.tabIndex !== undefined) return;
		const wanted = focusable && !disabled && (!is_natively_tabbable(node) || needs_safari_tab_index(node));
		if (wanted && !node.hasAttribute("tabindex")) {
			node.tabIndex = 0;
			addedTabIndex.current = true;
		} else if (!wanted && addedTabIndex.current) {
			node.removeAttribute("tabindex");
			addedTabIndex.current = false;
		}
	});

	// A render that changes the anchor's own aria-describedby drops the tooltip id. Add it back.
	useLayoutEffect(() => {
		tooltip.syncDescription();
	});

	if (typeof render === "function") return render({ ...(merged as HTMLAttributes<HTMLElement>), ref: setRef });
	if (renderElement) return createElement(renderElement.type, { ...merged, key: renderElement.key });
	return createElement("div", merged);
});
// #endregion anchor

// #region tooltip
type Tooltip_ClassNames = "np-TooltipPositioner" | "np-Tooltip";

type Tooltip_CssVars = {
	"--np-TooltipPositioner-anchor": string;
	"--np-TooltipPositioner-box": string;
	"--np-TooltipPositioner-gutter": string;
	"--np-TooltipPositioner-position-area": string;
	"--np-TooltipPositioner-position-try-fallbacks": string;
};

export type TooltipProps = ComponentPropsWithRef<"div"> & {
	/**
	 * Accepted so Ariakit call sites keep working. The popover top layer already lifts the tooltip
	 * above everything, so no React portal is created.
	 */
	portal?: boolean;
	/**
	 * Space between the anchor and the tooltip, in pixels. A `TooltipArrow` adds half its size.
	 * @default 8
	 */
	gutter?: number;
	/**
	 * Remove the content from the DOM while closed. With `false`, it stays mounted and hidden.
	 * @default true
	 */
	unmountOnHide?: boolean;
};

/**
 * The tooltip content. It shows in the browser top layer and CSS anchor positioning places it,
 * so opening it does no JavaScript layout work.
 *
 * `className`, `style`, and the other div props go to the content element. A wrapper element
 * (`np-TooltipPositioner`) holds the position and the gap.
 */
export const Tooltip = memo(function Tooltip(props: TooltipProps) {
	const {
		ref,
		id,
		className,
		children,
		portal: _portal,
		gutter = 8,
		unmountOnHide = true,
		onFocus,
		onBlur,
		...rest
	} = props;
	const tooltip = useTooltipContext("Tooltip");
	// Only this component renders when the tooltip opens or closes.
	const { open, placement } = useSyncExternalStore(tooltip.subscribe, tooltip.getSnapshot, tooltip.getSnapshot);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		tooltip.setPositioner(node);
		return () => tooltip.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		tooltip.setContent(node);
		return () => {
			content.current = null;
			tooltip.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	const handlePointerEnter = useFn((event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch") return;
		tooltip.contentEnter();
	});

	const handlePointerLeave = useFn((event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch") return;
		tooltip.contentLeave(event.relatedTarget);
	});

	const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
		onBlur?.(event);
		// Focus that leaves the tooltip for the page closes it, like a blur on the anchor.
		if (!event.defaultPrevented && event.target === event.currentTarget) tooltip.blur(event.relatedTarget);
	};

	// A new id must reach the anchor's aria-describedby.
	useLayoutEffect(() => {
		tooltip.syncDescription();
	});

	if (!open && unmountOnHide) return null;

	const side = tooltip_side(placement);
	const align = tooltip_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			className={"np-TooltipPositioner" satisfies Tooltip_ClassNames}
			data-side={side}
			data-align={align}
			style={
				{
					// The arrow reads both names: it points at the anchor and stays inside the positioner box.
					"--np-TooltipPositioner-anchor": tooltip.anchorName,
					"--np-TooltipPositioner-box": `${tooltip.anchorName}-box`,
					"--np-TooltipPositioner-gutter": `${gutter}px`,
					"--np-TooltipPositioner-position-area": tooltip_position_area(placement),
					"--np-TooltipPositioner-position-try-fallbacks": tooltip_position_try_fallbacks(placement),
				} satisfies Tooltip_CssVars as CSSProperties
			}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
		>
			<div
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				role="tooltip"
				// Clicking the text focuses the content instead of the page, so the anchor blur sees it and stays open.
				tabIndex={-1}
				className={cx("np-Tooltip" satisfies Tooltip_ClassNames, className)}
				data-side={side}
				data-align={align}
				data-open={open ? "" : undefined}
				onFocus={onFocus}
				onBlur={handleBlur}
			>
				{children}
			</div>
		</div>
	);
});
// #endregion tooltip

// #region arrow
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

type TooltipArrow_ClassNames = "np-TooltipArrow" | "np-TooltipArrow-underlay";

type TooltipArrow_CssVars = {
	"--np-TooltipArrow-size": string;
};

export type TooltipArrowProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
	/**
	 * Width and height of the arrow box, in pixels. The visible tip is about a third of it.
	 * @default 16
	 */
	size?: number;
	/**
	 * Stroke width. Read from the tooltip's border, or from a ring box-shadow, when omitted.
	 */
	borderWidth?: number;
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
 * An arrow that points from `Tooltip` to its anchor. Put it inside `Tooltip`.
 *
 * It points at the anchor's center and moves to the other side when the browser flips the tooltip.
 * It takes its fill and stroke from the tooltip's background and border, or from a ring box-shadow.
 */
export const TooltipArrow = memo(function TooltipArrow(props: TooltipArrowProps) {
	const { ref, className, style, size = 16, borderWidth, ...rest } = props;
	const tooltip = useTooltipContext("TooltipArrow");
	// Read the colors again on each open. A theme switch can change them while the tooltip is closed.
	const { open, placement } = useSyncExternalStore(tooltip.subscribe, tooltip.getSnapshot, tooltip.getSnapshot);
	const side = tooltip_side(placement);
	const maskId = useId();
	const element = useRef<HTMLDivElement | null>(null);

	const setElement = useFn((node: HTMLDivElement) => {
		element.current = node;
		return () => {
			element.current = null;
		};
	});

	useForwardRefs(element, [ref]);

	// The positioner adds half the arrow size to the gap, so the tip reaches toward the anchor.
	useLayoutEffect(() => {
		const positioner = element.current?.closest<HTMLElement>(".np-TooltipPositioner");
		positioner?.style.setProperty("--np-TooltipPositioner-arrow-size", `${size}px`);
		return () => {
			positioner?.style.removeProperty("--np-TooltipPositioner-arrow-size");
		};
	}, [size]);

	useLayoutEffect(() => {
		const node = element.current;
		const content = node?.closest<HTMLElement>(".np-Tooltip");
		if (!node || !content || !open) return;

		const computed = content.ownerDocument.defaultView!.getComputedStyle(content);
		const fill = computed.getPropertyValue("background-color") || "none";
		const borderColor = computed.getPropertyValue(`border-${side}-color`) || "none";
		const border = Number.parseFloat(computed.getPropertyValue(`border-${side}-width`)) || 0;
		// A ring sits outside the box, so the arrow base does not overlap it. A border is inside the box.
		const ring = borderWidth === undefined && !border ? get_ring(computed) : undefined;
		const stroke = ring ? ring.color || computed.getPropertyValue("color") || "none" : borderColor;
		const width = borderWidth ?? (ring ? Math.ceil(ring.width) : Math.ceil(border));

		node.style.setProperty("--np-TooltipArrow-fill", fill);
		node.style.setProperty("--np-TooltipArrow-stroke", stroke);
		node.style.setProperty("--np-TooltipArrow-border", `${border}px`);
		// The stroke is drawn in the 30px view box, and half of it is masked away.
		node.style.setProperty("--np-TooltipArrow-stroke-width", `${width * 2 * (VIEW_SIZE / size)}`);
		node.toggleAttribute("data-ring", !!ring);
	}, [open, side, size, borderWidth]);

	return (
		<div
			{...rest}
			ref={setElement}
			aria-hidden
			className={cx("np-TooltipArrow" satisfies TooltipArrow_ClassNames, className)}
			style={{ "--np-TooltipArrow-size": `${size}px`, ...style } satisfies TooltipArrow_CssVars as CSSProperties}
		>
			<svg display="block" viewBox="0 0 30 30">
				{/* This path paints the tooltip background under the border stroke, like an HTML border. */}
				<path
					className={"np-TooltipArrow-underlay" satisfies TooltipArrow_ClassNames}
					fill="none"
					style={{ stroke: "var(--np-TooltipArrow-fill)" }}
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
// #endregion arrow
