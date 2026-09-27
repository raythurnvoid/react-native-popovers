import {
	createContext,
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
	type ReactNode,
	type Ref,
	type SyntheticEvent,
} from "react";
import {
	cx,
	merge_render_props,
	render_element,
	useFocusableTabIndex,
	useFn,
	useForwardRefs,
	type RenderProp,
} from "../react-utils.ts";
import {
	placement_align,
	placement_position_area,
	placement_position_try_fallbacks,
	placement_side,
	type Placement,
} from "../layer/placement.ts";
import { LayerArrow, type LayerArrowHost_ClassNames, type LayerArrowHost_CssVars } from "../layer/arrow.tsx";
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
	placement?: Placement;
	/**
	 * Hover show delay in milliseconds. Hide is immediate.
	 * @default 500
	 */
	timeout?: number;
	/**
	 * After this tooltip closes, every tooltip in the same document skips its show delay for this
	 * many milliseconds, like Ariakit.
	 * @default 300
	 */
	skipTimeout?: number;
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
	const { children, placement = "top", timeout = 500, skipTimeout = 300, open, setOpen } = props;
	const options = { placement, timeout, skipTimeout, open, setOpen };
	const [tooltip] = useState(() => createTooltip(options));

	useLayoutEffect(() => {
		tooltip.configure(options);
	});

	useLayoutEffect(() => () => tooltip.destroy(), [tooltip]);

	return <TooltipContext value={tooltip}>{children}</TooltipContext>;
});
// #endregion provider

// #region anchor
export type TooltipAnchorProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the anchor props merged in. A function gets them as its argument.
	 * Without it, the anchor is a `div` around `children`.
	 */
	render?: RenderProp;
	/**
	 * Show the tooltip on keyboard focus, and add `tabIndex={0}` to an element that cannot take focus.
	 * @default true
	 */
	focusable?: boolean;
	/**
	 * Never show the tooltip from this anchor, mark it with `aria-disabled`, and take it out of the
	 * tab order, even when it has a `tabIndex` prop.
	 * @default false
	 */
	disabled?: boolean;
	/**
	 * Show the tooltip on hover. A function is asked on each pointer move, like Ariakit, so it can
	 * skip hover while the anchor is in some state (for example, while its menu is open).
	 * @default true
	 */
	showOnHover?: boolean | ((event: PointerEvent<HTMLElement>) => boolean);
};

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

/**
 * The element that shows the tooltip on hover and on keyboard focus.
 * Hover and focus do not render it again. Like Ariakit, it does not add the tooltip to its `aria-describedby`.
 */
export const TooltipAnchor = memo(function TooltipAnchor(props: TooltipAnchorProps) {
	const { ref, render, focusable = true, disabled = false, showOnHover = true, children, ...rest } = props;
	const tooltip = useTooltipContext("TooltipAnchor");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	// Whether the current focus came from the keyboard. Reset on blur.
	const keyboardFocus = useRef(false);
	const element = useRef<HTMLElement | null>(null);

	// One stable handler for every tooltip event. It reads refs, so it must be a useFn: the React
	// Compiler cannot tell that the merged props below are only called as event handlers.
	const handleInternal = useFn((name: AnchorEventName, event: SyntheticEvent<HTMLElement>) => {
		// An earlier handler that called preventDefault takes the event. Escape is the exception: the layer
		// stack marks a used Escape before React sees it, and the key handler must still record it.
		if (event.defaultPrevented && (event as KeyboardEvent<HTMLElement>).key !== "Escape") return;
		switch (name) {
			case "onPointerEnter":
				// Touch never opens a tooltip. Chrome's mouse events after a tap are not pointer events.
				if ((event as PointerEvent<HTMLElement>).pointerType === "touch" || disabled) return;
				tooltip.pointerEnter();
				return;
			case "onPointerMove":
				if ((event as PointerEvent<HTMLElement>).pointerType === "touch" || disabled) return;
				if (typeof showOnHover === "function" ? !showOnHover(event as PointerEvent<HTMLElement>) : !showOnHover) return;
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

	const merged = merge_render_props({ ...rest, children }, render, ANCHOR_EVENT_NAMES, (name, event) =>
		handleInternal(name as AnchorEventName, event),
	);
	if (disabled) {
		merged["aria-disabled"] = true;
		// Take a disabled anchor out of the tab order, even when it has a tabIndex prop, like Ariakit.
		// A tag that supports `disabled` gets it. A link cannot be disabled, so it gets -1.
		const tag = typeof renderElement?.type === "string" ? renderElement.type : null;
		if (tag && DISABLEABLE_TAGS.has(tag)) merged.disabled = true;
		merged.tabIndex = tag === "a" ? -1 : undefined;
	}

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		tooltip.registerAnchor(node, null);

		return () => {
			element.current = null;
			tooltip.registerAnchor(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	useFocusableTabIndex(element, focusable && !disabled, merged.tabIndex !== undefined);

	return render_element(render, merged, setRef, "div");
});
// #endregion anchor

// #region tooltip
type Tooltip_ClassNames = "np-TooltipPositioner" | "np-Tooltip";

type Tooltip_CssVars = LayerArrowHost_CssVars & {
	"--np-TooltipPositioner-anchor": string;
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
	/**
	 * Let the pointer move from the anchor into the tooltip, so its text can be selected or clicked.
	 * With `false`, the tooltip and its gap let the pointer pass through to the page, and leaving the
	 * anchor closes it. Ariakit has no single prop for this. The name comes from Tippy and Floating UI.
	 * @default true
	 */
	interactive?: boolean;
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
		interactive = true,
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

	if (!open && unmountOnHide) return null;

	const side = placement_side(placement);
	const align = placement_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			className={cx(
				"np-TooltipPositioner" satisfies Tooltip_ClassNames,
				"np-ArrowHost" satisfies LayerArrowHost_ClassNames,
			)}
			data-side={side}
			data-align={align}
			data-interactive={interactive ? undefined : "false"}
			style={
				{
					"--np-TooltipPositioner-anchor": tooltip.anchorName,
					// The arrow reads both names: it points at the anchor and stays inside the positioner box.
					"--np-Arrow-anchor": tooltip.anchorName,
					"--np-Arrow-box": `${tooltip.anchorName}-box`,
					"--np-TooltipPositioner-gutter": `${gutter}px`,
					"--np-TooltipPositioner-position-area": placement_position_area(placement),
					"--np-TooltipPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
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
type TooltipArrow_ClassNames = "np-TooltipArrow";

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

/**
 * An arrow that points from `Tooltip` to its anchor. Put it inside `Tooltip`.
 *
 * It points at the anchor's center and moves to the other side when the browser flips the tooltip.
 * It takes its fill and stroke from the tooltip's background and border, or from a ring box-shadow.
 */
export const TooltipArrow = memo(function TooltipArrow(props: TooltipArrowProps) {
	const { className, size = 16, borderWidth, ...rest } = props;
	const tooltip = useTooltipContext("TooltipArrow");
	// Read the colors again on each open. A theme switch can change them while the tooltip is closed.
	const { open, placement } = useSyncExternalStore(tooltip.subscribe, tooltip.getSnapshot, tooltip.getSnapshot);

	return (
		<LayerArrow
			{...rest}
			className={cx("np-TooltipArrow" satisfies TooltipArrow_ClassNames, className)}
			size={size}
			borderWidth={borderWidth}
			open={open}
			side={placement_side(placement)}
		/>
	);
});
// #endregion arrow
