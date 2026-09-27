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
import { createHovercard, type HovercardController } from "./hovercard-controller.ts";
import "./hovercard.css";

// #region context
// The value is one stable controller, so reading it never renders a consumer again.
const HovercardContext = createContext<HovercardController | null>(null);

function useHovercardContext(owner: string) {
	const hovercard = use(HovercardContext);
	if (!hovercard) throw new Error(`${owner} must be used within HovercardProvider`);
	return hovercard;
}
// #endregion context

// #region provider
export type HovercardProviderProps = {
	children?: ReactNode;
	/**
	 * Preferred side and alignment, with Ariakit names. The browser flips it when it does not fit.
	 * @default "bottom"
	 */
	placement?: Placement;
	/**
	 * The show and hide delay in milliseconds, when `showTimeout` or `hideTimeout` is not given.
	 * @default 500
	 */
	timeout?: number;
	/**
	 * How long the pointer rests on the anchor before the card opens.
	 * @default timeout
	 */
	showTimeout?: number;
	/**
	 * How long the pointer stays away from the anchor and the card before the card closes.
	 * @default timeout
	 */
	hideTimeout?: number;
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
 * Owns one hovercard. Put one `HovercardAnchor`, one `HovercardDisclosure`, and one `Hovercard` inside it.
 *
 * @example
 * ```tsx
 * <HovercardProvider placement="right-start">
 *   <HovercardAnchor>3 online</HovercardAnchor>
 *   <HovercardDisclosure aria-label="Show who is online" />
 *   <Hovercard aria-label="Online users" gutter={4}>
 *     <button type="button">Disable</button>
 *     <HovercardArrow />
 *   </Hovercard>
 * </HovercardProvider>
 * ```
 */
export const HovercardProvider = memo(function HovercardProvider(props: HovercardProviderProps) {
	const { children, placement = "bottom", timeout = 500, showTimeout, hideTimeout, open, setOpen } = props;
	const options = {
		placement,
		showTimeout: showTimeout ?? timeout,
		hideTimeout: hideTimeout ?? timeout,
		open,
		setOpen,
	};
	const [hovercard] = useState(() => createHovercard(options));

	useLayoutEffect(() => {
		hovercard.configure(options);
	});

	useLayoutEffect(() => () => hovercard.destroy(), [hovercard]);

	return <HovercardContext value={hovercard}>{children}</HovercardContext>;
});
// #endregion provider

// #region anchor
export type HovercardAnchorProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the anchor props merged in. A function gets them as its
	 * argument. Without it, the anchor is an `a` around `children`, like Ariakit.
	 */
	render?: RenderProp;
};

const ANCHOR_EVENT_NAMES = new Set(["onPointerEnter", "onPointerMove", "onPointerLeave", "onPointerDown"]);

/**
 * The element that opens the card on hover. It does not open on focus, like Ariakit: the keyboard way
 * in is `HovercardDisclosure`. Hover does not render it again.
 */
export const HovercardAnchor = memo(function HovercardAnchor(props: HovercardAnchorProps) {
	const { ref, render, children, ...rest } = props;
	const hovercard = useHovercardContext("HovercardAnchor");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		const pointerEvent = event as PointerEvent<HTMLElement>;
		// Touch never opens a hovercard, like Ariakit. A pen does.
		if (pointerEvent.pointerType === "touch") return;
		switch (name) {
			case "onPointerEnter":
				hovercard.anchorPointerEnter();
				return;
			case "onPointerMove":
				hovercard.anchorPointerMove();
				return;
			case "onPointerLeave":
				hovercard.anchorPointerLeave(pointerEvent.relatedTarget);
				return;
			case "onPointerDown":
				hovercard.anchorPointerDown();
		}
	});

	const merged = merge_render_props({ ...rest, children }, render, ANCHOR_EVENT_NAMES, handleEvent);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		hovercard.registerAnchor(node, null);

		return () => {
			element.current = null;
			hovercard.registerAnchor(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	return render_element(render, merged, setRef, "a");
});
// #endregion anchor

// #region disclosure
export type HovercardDisclosureProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the disclosure props merged in. A function gets them as
	 * its argument. Without it, the disclosure is a `button type="button"` around `children`.
	 */
	render?: RenderProp;
};

const CLICK_EVENT_NAMES = new Set(["onClick"]);

/**
 * The button that opens and closes the card from the keyboard or a click, with focus moving into the
 * card. It gets `aria-haspopup="dialog"`, `aria-controls`, and `aria-expanded`, which is `true` only
 * when this button opened the card, like Ariakit. Opening and closing do not render it again.
 */
export const HovercardDisclosure = memo(function HovercardDisclosure(props: HovercardDisclosureProps) {
	const { ref, render, children, ...rest } = props;
	const hovercard = useHovercardContext("HovercardDisclosure");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleClick = useFn((event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		hovercard.toggleFromDisclosure();
	});

	const merged = merge_render_props(
		// Like Ariakit, add the button type only to the default button.
		{ "aria-haspopup": "dialog", ...(render ? {} : { type: "button" }), ...rest, children },
		render,
		CLICK_EVENT_NAMES,
		(_name, event) => handleClick(event),
	);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		hovercard.registerDisclosure(node, null);

		return () => {
			element.current = null;
			hovercard.registerDisclosure(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	// Safari does not focus a button on click. The tabindex makes it take focus, so focus restore and
	// the outside rules see the disclosure as the focused element, like Ariakit.
	useFocusableTabIndex(element, !merged.disabled, merged.tabIndex !== undefined);

	return render_element(render, merged, setRef, "button");
});
// #endregion disclosure

// #region hovercard
type Hovercard_ClassNames = "np-HovercardPositioner" | "np-Hovercard";

type Hovercard_CssVars = LayerArrowHost_CssVars & {
	"--np-HovercardPositioner-anchor": string;
	"--np-HovercardPositioner-gutter": string;
	"--np-HovercardPositioner-overflow-padding": string;
	"--np-HovercardPositioner-position-area": string;
	"--np-HovercardPositioner-position-try-fallbacks": string;
};

export type HovercardProps = ComponentPropsWithRef<"div"> & {
	/**
	 * Accepted so Ariakit call sites keep working. The popover top layer already lifts the card above
	 * everything, so no React portal is created.
	 */
	portal?: boolean;
	/**
	 * Space between the anchor and the card, in pixels. A `HovercardArrow` adds half its size.
	 * @default 0
	 */
	gutter?: number;
	/**
	 * Least space between the card and the viewport edges, in pixels, on the axis where the browser
	 * shifts it. Like Ariakit's `overflowPadding`.
	 * @default 8
	 */
	overflowPadding?: number;
	/**
	 * Remove the content from the DOM while closed. With `false`, it stays mounted and hidden.
	 * @default true
	 */
	unmountOnHide?: boolean;
};

/**
 * The card, a non-modal `role="dialog"`. It shows in the browser top layer and CSS anchor positioning
 * places it. Two invisible strips fill the gap, so the pointer can move from the anchor into the card.
 *
 * `className`, `style`, and the other div props go to the content element. A wrapper element
 * (`np-HovercardPositioner`) holds the position and the gap.
 */
export const Hovercard = memo(function Hovercard(props: HovercardProps) {
	const {
		ref,
		id,
		className,
		children,
		portal: _portal,
		gutter = 0,
		overflowPadding = 8,
		unmountOnHide = true,
		onKeyDown,
		...rest
	} = props;
	const hovercard = useHovercardContext("Hovercard");
	// Only this component and HovercardArrow render when the card opens or closes.
	const { open, placement } = useSyncExternalStore(hovercard.subscribe, hovercard.getSnapshot, hovercard.getSnapshot);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		hovercard.setPositioner(node);
		return () => hovercard.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		hovercard.setContent(node);
		return () => {
			content.current = null;
			hovercard.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch") return;
		hovercard.cardPointerEnter();
	};

	const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch") return;
		hovercard.cardPointerLeave(event.relatedTarget);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		// React runs this after the handlers inside the card. A control that already used Escape called
		// preventDefault, and the card stays open. The preventDefault here tells a dialog around the card
		// that the press is used.
		if (event.key !== "Escape" || event.nativeEvent.isComposing || event.defaultPrevented) return;
		event.preventDefault();
		hovercard.request(false, "escape");
	};

	if (!open && unmountOnHide) return null;

	const side = placement_side(placement);
	const align = placement_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			className={cx(
				"np-HovercardPositioner" satisfies Hovercard_ClassNames,
				"np-ArrowHost" satisfies LayerArrowHost_ClassNames,
			)}
			data-side={side}
			data-align={align}
			style={
				{
					"--np-HovercardPositioner-anchor": hovercard.anchorName,
					// The arrow reads both names: it points at the anchor and stays inside the positioner box.
					"--np-Arrow-anchor": hovercard.anchorName,
					"--np-Arrow-box": `${hovercard.anchorName}-box`,
					"--np-HovercardPositioner-gutter": `${gutter}px`,
					"--np-HovercardPositioner-overflow-padding": `${overflowPadding}px`,
					"--np-HovercardPositioner-position-area": placement_position_area(placement),
					"--np-HovercardPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
				} satisfies Hovercard_CssVars as CSSProperties
			}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
		>
			<div
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				role="dialog"
				// The card takes focus when it has nothing focusable inside, like an Ariakit dialog.
				tabIndex={-1}
				className={cx("np-Hovercard" satisfies Hovercard_ClassNames, className)}
				data-side={side}
				data-align={align}
				data-open={open ? "" : undefined}
				onKeyDown={handleKeyDown}
			>
				{children}
			</div>
		</div>
	);
});
// #endregion hovercard

// #region arrow
type HovercardArrow_ClassNames = "np-HovercardArrow";

export type HovercardArrowProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
	/**
	 * Width and height of the arrow box, in pixels. Half of it is added to the gap, like Ariakit's
	 * `PopoverArrow`.
	 * @default 30
	 */
	size?: number;
	/**
	 * Stroke width. Read from the card's border, or from a ring box-shadow, when omitted.
	 */
	borderWidth?: number;
};

/**
 * An arrow that points from `Hovercard` to its anchor. Put it inside `Hovercard`. It works like
 * `TooltipArrow`.
 */
export const HovercardArrow = memo(function HovercardArrow(props: HovercardArrowProps) {
	const { className, size = 30, borderWidth, ...rest } = props;
	const hovercard = useHovercardContext("HovercardArrow");
	// Read the colors again on each open. A theme switch can change them while the card is closed.
	const { open, placement } = useSyncExternalStore(hovercard.subscribe, hovercard.getSnapshot, hovercard.getSnapshot);

	return (
		<LayerArrow
			{...rest}
			className={cx("np-HovercardArrow" satisfies HovercardArrow_ClassNames, className)}
			size={size}
			borderWidth={borderWidth}
			open={open}
			side={placement_side(placement)}
		/>
	);
});
// #endregion arrow
