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
import { createPopover, type PopoverController } from "./popover-controller.ts";
import "./popover.css";

// #region context
// The value is one stable controller, so reading it never renders a consumer again.
const PopoverContext = createContext<PopoverController | null>(null);

function usePopoverContext(owner: string) {
	const popover = use(PopoverContext);
	if (!popover) throw new Error(`${owner} must be used within PopoverProvider`);
	return popover;
}
// #endregion context

// #region provider
export type PopoverProviderProps = {
	children?: ReactNode;
	/**
	 * Preferred side and alignment, with Ariakit names. The browser flips it when it does not fit.
	 * @default "bottom"
	 */
	placement?: Placement;
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
 * Owns one popover. Put one `PopoverDisclosure` and one `Popover` inside it.
 *
 * @example
 * ```tsx
 * <PopoverProvider placement="bottom-start">
 *   <PopoverDisclosure>Filters</PopoverDisclosure>
 *   <Popover gutter={4}>
 *     <label>
 *       Name <input />
 *     </label>
 *     <PopoverDismiss />
 *   </Popover>
 * </PopoverProvider>
 * ```
 */
export const PopoverProvider = memo(function PopoverProvider(props: PopoverProviderProps) {
	const { children, placement = "bottom", open, setOpen } = props;
	const options = { placement, open, setOpen };
	const [popover] = useState(() => createPopover(options));

	useLayoutEffect(() => {
		popover.configure(options);
	});

	useLayoutEffect(() => () => popover.destroy(), [popover]);

	return <PopoverContext value={popover}>{children}</PopoverContext>;
});
// #endregion provider

// #region disclosure
export type PopoverDisclosureProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the disclosure props merged in. A function gets them as
	 * its argument. Without it, the disclosure is a `button type="button"` around `children`.
	 */
	render?: RenderProp;
};

const CLICK_EVENT_NAMES = new Set(["onClick"]);

/**
 * The button that opens and closes the popover on click. It gets `aria-expanded`, `aria-controls`,
 * and `aria-haspopup="dialog"`, like Ariakit. Opening and closing do not render it again.
 */
export const PopoverDisclosure = memo(function PopoverDisclosure(props: PopoverDisclosureProps) {
	const { ref, render, children, ...rest } = props;
	const popover = usePopoverContext("PopoverDisclosure");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleClick = useFn((event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		popover.request(!popover.getSnapshot().open, "toggle");
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
		popover.registerAnchor(node, null);

		return () => {
			element.current = null;
			popover.registerAnchor(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	// Safari does not focus a button on click. The tabindex makes it take focus, so focus restore
	// and the outside rules see the disclosure as the focused element, like Ariakit.
	useFocusableTabIndex(element, !merged.disabled, merged.tabIndex !== undefined);

	return render_element(render, merged, setRef, "button");
});
// #endregion disclosure

// #region popover
type Popover_ClassNames = "np-PopoverPositioner" | "np-Popover";

type Popover_CssVars = {
	"--np-PopoverPositioner-anchor": string;
	"--np-PopoverPositioner-gutter": string;
	"--np-PopoverPositioner-position-area": string;
	"--np-PopoverPositioner-position-try-fallbacks": string;
};

export type PopoverProps = ComponentPropsWithRef<"div"> & {
	/**
	 * Accepted so Ariakit call sites keep working. The popover top layer already lifts the popover
	 * above everything, so no React portal is created.
	 */
	portal?: boolean;
	/**
	 * Accepted and ignored, like `portal`.
	 */
	portalElement?: unknown;
	/**
	 * Space between the disclosure and the popover, in pixels.
	 * @default 0
	 */
	gutter?: number;
	/**
	 * Remove the content from the DOM while closed. With `false`, it stays mounted and hidden, like Ariakit.
	 * @default false
	 */
	unmountOnHide?: boolean;
};

/**
 * The popover content, a non-modal dialog. It shows in the browser top layer and CSS anchor
 * positioning places it, so opening it does no JavaScript layout work.
 *
 * `className`, `style`, and the other div props go to the content element. A wrapper element
 * (`np-PopoverPositioner`) holds the position and the gap.
 */
export const Popover = memo(function Popover(props: PopoverProps) {
	const {
		ref,
		id,
		className,
		children,
		portal: _portal,
		portalElement: _portalElement,
		gutter = 0,
		unmountOnHide = false,
		onKeyDown,
		...rest
	} = props;
	const popover = usePopoverContext("Popover");
	// Only this component renders when the popover opens or closes.
	const { open, placement } = useSyncExternalStore(popover.subscribe, popover.getSnapshot, popover.getSnapshot);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		popover.setPositioner(node);
		return () => popover.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		popover.setContent(node);
		return () => {
			content.current = null;
			popover.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		// React runs this after the handlers inside the content. A control that already used Escape
		// (a combobox, an input that clears itself) called preventDefault, and the popover stays open.
		// The preventDefault here tells a dialog around the popover that the press is used.
		if (event.key !== "Escape" || event.nativeEvent.isComposing || event.defaultPrevented) return;
		event.preventDefault();
		popover.request(false, "escape");
	};

	if (!open && unmountOnHide) return null;

	const side = placement_side(placement);
	const align = placement_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			className={"np-PopoverPositioner" satisfies Popover_ClassNames}
			data-side={side}
			data-align={align}
			style={
				{
					"--np-PopoverPositioner-anchor": popover.anchorName,
					"--np-PopoverPositioner-gutter": `${gutter}px`,
					"--np-PopoverPositioner-position-area": placement_position_area(placement),
					"--np-PopoverPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
				} satisfies Popover_CssVars as CSSProperties
			}
		>
			<div
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				role="dialog"
				// The content takes focus when it has nothing focusable inside, like an Ariakit dialog.
				tabIndex={-1}
				className={cx("np-Popover" satisfies Popover_ClassNames, className)}
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
// #endregion popover

// #region dismiss
export type PopoverDismissProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the dismiss props merged in. A function gets them as its
	 * argument. Without it, the dismiss is a `button type="button"`.
	 */
	render?: RenderProp;
};

// Copied from Ariakit's DialogDismiss (MIT, Copyright (c) Diego Haz):
// packages/ariakit-react-components/src/dialog/dialog-dismiss.tsx
const DISMISS_ICON = (
	<svg
		aria-label="Dismiss popup"
		display="block"
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={1.5}
		viewBox="0 0 16 16"
		height="1em"
		width="1em"
	>
		<line x1="4" y1="4" x2="12" y2="12" />
		<line x1="4" y1="12" x2="12" y2="4" />
	</svg>
);

/**
 * A button that closes the popover and moves focus back to the disclosure. Without children it
 * shows Ariakit's X icon, labeled "Dismiss popup".
 */
export const PopoverDismiss = memo(function PopoverDismiss(props: PopoverDismissProps) {
	const { ref, render, children = DISMISS_ICON, ...rest } = props;
	const popover = usePopoverContext("PopoverDismiss");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleClick = useFn((event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		popover.request(false, "dismiss");
	});

	const merged = merge_render_props(
		{ ...(render ? {} : { type: "button" }), ...rest, children },
		render,
		CLICK_EVENT_NAMES,
		(_name, event) => handleClick(event),
	);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		return () => {
			element.current = null;
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	return render_element(render, merged, setRef, "button");
});
// #endregion dismiss
