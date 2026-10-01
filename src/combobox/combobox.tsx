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
	type ChangeEvent,
	type ComponentPropsWithRef,
	type CompositionEvent,
	type CSSProperties,
	type HTMLAttributes,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	type SyntheticEvent,
} from "react";
import { cx, merge_render_props, render_element, useFn, useForwardRefs, type RenderProp } from "../react-utils.ts";
import {
	placement_align,
	placement_position_area,
	placement_position_try_fallbacks,
	placement_side,
	type Placement,
} from "../layer/placement.ts";
import { LayerGroup, LayerGroupLabel, type LayerGroupLabelProps, type LayerGroupProps } from "../layer/group.tsx";
import { createCombobox, type ComboboxController } from "./combobox-controller.ts";
import "./combobox.css";

// #region context
// The controller is one stable object, so reading it never renders a consumer again. The text context
// changes with the controlled input text, and only the input reads it.
const ComboboxContext = createContext<ComboboxController | null>(null);
const ComboboxTextContext = createContext<{ value: string | undefined; defaultValue: string }>({
	value: undefined,
	defaultValue: "",
});
// True inside a ComboboxPopover, whose content already runs the pointer handlers for the whole popup.
const ComboboxInPopoverContext = createContext(false);

function useComboboxContext(owner: string) {
	const combobox = use(ComboboxContext);
	if (!combobox) throw new Error(`${owner} must be used within ComboboxProvider`);
	return combobox;
}
// #endregion context

// #region provider
export type ComboboxProviderProps = {
	children?: ReactNode;
	/**
	 * The input text. Omit it for an uncontrolled input.
	 */
	value?: string;
	/**
	 * The first text of an uncontrolled input.
	 * @default ""
	 */
	defaultValue?: string;
	/**
	 * Called with the new text when the user types, picks an option, or clears the input.
	 */
	setValue?: (value: string) => void;
	/**
	 * Controlled open state. `true` forces it open, `false` forces it closed. Omit it for uncontrolled.
	 * An inline `ComboboxList` with no popover keeps it `true`.
	 */
	open?: boolean;
	/**
	 * Called when an interaction asks to open or close, even when a controlled parent ignores it.
	 */
	setOpen?: (open: boolean) => void;
	/**
	 * Preferred side and alignment, with Ariakit names. The browser flips it when it does not fit.
	 * @default "bottom-start"
	 */
	placement?: Placement;
};

/**
 * Owns one editable combobox. Put one `Combobox` (the input) and one `ComboboxPopover` or inline
 * `ComboboxList` inside it. The caller filters the options from the text.
 *
 * @example
 * ```tsx
 * <ComboboxProvider value={text} setValue={setText}>
 *   <Combobox aria-label="Fruit" />
 *   <ComboboxPopover gutter={4}>
 *     {fruits.filter((fruit) => fruit.includes(text)).map((fruit) => (
 *       <ComboboxItem key={fruit} value={fruit}>{fruit}</ComboboxItem>
 *     ))}
 *   </ComboboxPopover>
 * </ComboboxProvider>
 * ```
 */
export const ComboboxProvider = memo(function ComboboxProvider(props: ComboboxProviderProps) {
	const { children, value, defaultValue = "", setValue, open, setOpen, placement = "bottom-start" } = props;
	const options = { placement, value, setValue, open, setOpen };
	const [combobox] = useState(() => createCombobox(options));

	useLayoutEffect(() => {
		combobox.configure(options);
	});

	useLayoutEffect(() => () => combobox.destroy(), [combobox]);

	return (
		<ComboboxContext value={combobox}>
			<ComboboxTextContext value={{ value, defaultValue }}>{children}</ComboboxTextContext>
		</ComboboxContext>
	);
});
// #endregion provider

// #region label
export type ComboboxLabelProps = ComponentPropsWithRef<"label">;

/**
 * The visible label of the input. It points at the input with `for`, like Ariakit's `ComboboxLabel`.
 */
export const ComboboxLabel = memo(function ComboboxLabel(props: ComboboxLabelProps) {
	const { ref, id, ...rest } = props;
	const combobox = useComboboxContext("ComboboxLabel");
	const generatedId = useId();
	const element = useRef<HTMLLabelElement | null>(null);

	const setElement = useFn((node: HTMLLabelElement) => {
		element.current = node;
		combobox.registerLabel(node);
		return () => {
			element.current = null;
			combobox.registerLabel(null);
		};
	});

	useForwardRefs(element, [ref]);

	return <label {...rest} ref={setElement} id={id ?? generatedId} />;
});
// #endregion label

// #region input
export type ComboboxProps = ComponentPropsWithRef<"input"> & {
	/**
	 * Open the list when the text changes.
	 * @default true
	 */
	showOnChange?: boolean;
	/**
	 * Open the list on a press on the input (main button, no Ctrl or Cmd), before the release.
	 * @default true
	 */
	showOnClick?: boolean;
	/**
	 * Open the list with ArrowDown or ArrowUp while it is closed.
	 * @default true
	 */
	showOnKeyPress?: boolean;
	/**
	 * After each text change, make the first option active, like Ariakit's `autoSelect`. Any navigation
	 * key turns it off until the next change.
	 * @default false
	 */
	autoSelect?: boolean;
};

/**
 * The input, a `role="combobox"` with `aria-autocomplete="list"`. DOM focus stays here while the arrow
 * keys move the active option (`aria-activedescendant`), and Enter picks it. The controller writes
 * `aria-expanded`, `aria-haspopup`, and `aria-controls`, so the input renders only when its text changes.
 * They point at the popover as a `dialog` when it contains a `ComboboxList`, like Ariakit,
 * and at the listbox otherwise.
 */
export const Combobox = memo(function Combobox(props: ComboboxProps) {
	const {
		ref,
		id,
		showOnChange = true,
		showOnClick = true,
		showOnKeyPress = true,
		autoSelect = false,
		onChange,
		onKeyDown,
		onKeyDownCapture,
		onMouseDown,
		onCompositionEnd,
		...rest
	} = props;
	const combobox = useComboboxContext("Combobox");
	const text = use(ComboboxTextContext);
	const generatedId = useId();
	const element = useRef<HTMLInputElement | null>(null);
	const settings = { showOnChange, showOnClick, showOnKeyPress, autoSelect };

	const setElement = useFn((node: HTMLInputElement) => {
		element.current = node;
		combobox.registerInput(node, settings);
		return () => {
			element.current = null;
			combobox.registerInput(null, settings);
		};
	});

	useForwardRefs(element, [ref]);

	useLayoutEffect(() => {
		if (element.current) combobox.registerInput(element.current, settings);
	}, [combobox, showOnChange, showOnClick, showOnKeyPress, autoSelect]);

	// The caller's capture handler runs first, so it can use a key before Enter picks an option.
	const handleKeyDownCapture = (event: KeyboardEvent<HTMLInputElement>) => {
		onKeyDownCapture?.(event);
		combobox.handleInputKeyDownCapture(event.nativeEvent);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		onKeyDown?.(event);
		combobox.handleInputKeyDown(event.nativeEvent);
	};

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		onChange?.(event);
		combobox.inputChanged(event.currentTarget.value, (event.nativeEvent as InputEvent).isComposing === true);
	};

	const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
		onCompositionEnd?.(event);
		combobox.inputChanged(event.currentTarget.value, false);
	};

	const handleMouseDown = (event: MouseEvent<HTMLInputElement>) => {
		onMouseDown?.(event);
		if (!event.defaultPrevented) combobox.handleInputMouseDown(event.nativeEvent);
	};

	return (
		<input
			role="combobox"
			aria-autocomplete="list"
			autoComplete="off"
			{...rest}
			{...(text.value !== undefined ? { value: text.value } : { defaultValue: text.defaultValue })}
			ref={setElement}
			id={id ?? generatedId}
			onKeyDownCapture={handleKeyDownCapture}
			onKeyDown={handleKeyDown}
			onChange={handleChange}
			onCompositionEnd={handleCompositionEnd}
			onMouseDown={handleMouseDown}
		/>
	);
});
// #endregion input

// #region popover
type ComboboxPopover_ClassNames = "np-ComboboxPositioner" | "np-Combobox";

type ComboboxPopover_CssVars = {
	"--np-ComboboxPositioner-anchor": string;
	"--np-ComboboxPositioner-gutter": string;
	"--np-ComboboxPositioner-overflow-padding": string;
	"--np-ComboboxPositioner-position-area": string;
	"--np-ComboboxPositioner-position-try-fallbacks": string;
};

export type ComboboxPopoverProps = ComponentPropsWithRef<"div"> & {
	/**
	 * Accepted so Ariakit call sites keep working. The popover top layer already lifts the list above
	 * everything, so no React portal is created.
	 */
	portal?: boolean;
	/**
	 * Accepted and ignored, like `portal`.
	 */
	portalElement?: unknown;
	/**
	 * Space between the input and the list, in pixels.
	 * @default 0
	 */
	gutter?: number;
	/**
	 * Make the list as wide as the input, with CSS `anchor-size()`.
	 * @default false
	 */
	sameWidth?: boolean;
	/**
	 * Least space between the list and the viewport edges, in pixels, on the axis where the browser
	 * shifts it. Like Ariakit's `overflowPadding`.
	 * @default 8
	 */
	overflowPadding?: number;
	/**
	 * Remove the content from the DOM while closed. With `false`, it stays mounted and hidden, like Ariakit.
	 * @default false
	 */
	unmountOnHide?: boolean;
};

/**
 * The popup next to the input. It is the `role="listbox"`, or a `role="dialog"` when it contains a
 * `ComboboxList`. It shows in the browser top layer and CSS anchor positioning
 * places it, so it follows the input when the page scrolls.
 *
 * `className`, `style`, and the other div props go to the content element. A wrapper element
 * (`np-ComboboxPositioner`) holds the position and the gap.
 */
export const ComboboxPopover = memo(function ComboboxPopover(props: ComboboxPopoverProps) {
	const {
		ref,
		id,
		className,
		children,
		portal: _portal,
		portalElement: _portalElement,
		gutter = 0,
		sameWidth = false,
		overflowPadding = 8,
		unmountOnHide = false,
		onPointerMove,
		onPointerLeave,
		onMouseDown,
		...rest
	} = props;
	const combobox = useComboboxContext("ComboboxPopover");
	// Only this component renders when the list opens or closes, or when a ComboboxList comes or goes.
	const { open, placement, list } = useSyncExternalStore(
		combobox.subscribe,
		combobox.getSnapshot,
		combobox.getSnapshot,
	);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		combobox.setPositioner(node);
		return () => combobox.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		combobox.setContent(node);
		return () => {
			content.current = null;
			combobox.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		onPointerMove?.(event);
		combobox.handlePointerMove(event.nativeEvent);
	};

	const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
		onPointerLeave?.(event);
		combobox.handlePointerLeave(event.nativeEvent);
	};

	const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		onMouseDown?.(event);
		combobox.handleListMouseDown(event.nativeEvent);
	};

	if (!open && unmountOnHide) return null;

	const side = placement_side(placement);
	const align = placement_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			// A closed list that stays mounted is hidden, like Ariakit, so queries and screen readers skip it.
			hidden={!open}
			className={"np-ComboboxPositioner" satisfies ComboboxPopover_ClassNames}
			data-side={side}
			data-align={align}
			data-same-width={sameWidth ? "" : undefined}
			style={
				{
					"--np-ComboboxPositioner-anchor": combobox.anchorName,
					"--np-ComboboxPositioner-gutter": `${gutter}px`,
					"--np-ComboboxPositioner-overflow-padding": `${overflowPadding}px`,
					"--np-ComboboxPositioner-position-area": placement_position_area(placement),
					"--np-ComboboxPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
				} satisfies ComboboxPopover_CssVars as CSSProperties
			}
		>
			<div
				role={list ? "dialog" : "listbox"}
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				className={cx("np-Combobox" satisfies ComboboxPopover_ClassNames, className)}
				data-side={side}
				data-align={align}
				data-open={open ? "" : undefined}
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onMouseDown={handleMouseDown}
			>
				<ComboboxInPopoverContext value={true}>{children}</ComboboxInPopoverContext>
			</div>
		</div>
	);
});
// #endregion popover

// #region list
type ComboboxList_ClassNames = "np-ComboboxList";

export type ComboboxListProps = ComponentPropsWithRef<"div">;

/**
 * The `role="listbox"`. Inside a `ComboboxPopover` it lets the popup hold other content too. Without a
 * popover, it is an inline list: keep the provider's `open` true, and the keys and the pointer work
 * the same way.
 */
export const ComboboxList = memo(function ComboboxList(props: ComboboxListProps) {
	const { ref, id, className, onPointerMove, onPointerLeave, onMouseDown, ...rest } = props;
	const combobox = useComboboxContext("ComboboxList");
	const generatedId = useId();
	const element = useRef<HTMLDivElement | null>(null);
	const inPopover = use(ComboboxInPopoverContext);

	const setElement = useFn((node: HTMLDivElement) => {
		element.current = node;
		combobox.registerList(node);
		return () => {
			element.current = null;
			combobox.registerList(null);
		};
	});

	useForwardRefs(element, [ref]);

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		onPointerMove?.(event);
		if (!inPopover) combobox.handlePointerMove(event.nativeEvent);
	};

	const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
		onPointerLeave?.(event);
		if (!inPopover) combobox.handlePointerLeave(event.nativeEvent);
	};

	const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		onMouseDown?.(event);
		if (!inPopover) combobox.handleListMouseDown(event.nativeEvent);
	};

	return (
		<div
			role="listbox"
			{...rest}
			ref={setElement}
			id={id ?? generatedId}
			className={cx("np-ComboboxList" satisfies ComboboxList_ClassNames, className)}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
			onMouseDown={handleMouseDown}
		/>
	);
});
// #endregion list

// #region item
type ItemClickRule = boolean | ((event: MouseEvent<HTMLElement>) => boolean);

export type ComboboxItemProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the option props merged in. A function gets them as its
	 * argument. Without it, the option is a `div`.
	 */
	render?: RenderProp;
	/**
	 * The text this option writes into the input on click (with `setValueOnClick`).
	 */
	value?: string;
	/**
	 * A disabled option keeps `aria-disabled="true"`, ignores clicks, and is skipped by the keys.
	 */
	disabled?: boolean;
	/**
	 * Write `value` into the input on click or Enter. A function gets the click event.
	 * @default true
	 */
	setValueOnClick?: ItemClickRule;
	/**
	 * Close the list after a click or Enter. A function gets the click event.
	 * @default true when the option has a value
	 */
	hideOnClick?: ItemClickRule;
};

const ITEM_EVENT_NAMES = new Set(["onClick", "onClickCapture"]);

/**
 * One `role="option"`. Hover and the keys only mark it (`data-active-item`), so they do not render it.
 * Enter picks the active option by calling `click()` on it.
 */
export const ComboboxItem = memo(function ComboboxItem(props: ComboboxItemProps) {
	const { ref, render, value, disabled = false, setValueOnClick = true, hideOnClick, id, children, ...rest } = props;
	const combobox = useComboboxContext("ComboboxItem");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);
	const generatedId = useId();

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (name === "onClickCapture") {
			// Like Ariakit's Focusable: a disabled option stops the click before any onClick runs.
			if (!disabled) return;
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.defaultPrevented) return;
		const click = event as MouseEvent<HTMLElement>;
		const setText = typeof setValueOnClick === "function" ? setValueOnClick(click) : setValueOnClick;
		const hideRule = hideOnClick ?? value !== undefined;
		const hide = typeof hideRule === "function" ? hideRule(click) : hideRule;
		combobox.pick({ value, setValue: setText, hide });
	});

	const merged = merge_render_props({
		props: {
			role: "option",
			...rest,
			id: id ?? generatedId,
			tabIndex: -1,
			"aria-disabled": disabled || undefined,
			children,
		},
		render,
		internalNames: ITEM_EVENT_NAMES,
		internal: handleEvent,
	});

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		return () => {
			element.current = null;
			combobox.unregisterItem(node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	return render_element({ render, merged, ref: setRef, defaultTag: "div" });
});
// #endregion item

// #region group
export type ComboboxGroupProps = LayerGroupProps;

/**
 * A `role="group"` of options. A `ComboboxGroupLabel` inside it names it.
 */
export const ComboboxGroup = LayerGroup;
// #endregion group

// #region group label
export type ComboboxGroupLabelProps = LayerGroupLabelProps;

/**
 * The visible label of a `ComboboxGroup`. It is hidden from assistive technology, because the group
 * already takes its text as its name, like Ariakit.
 */
export const ComboboxGroupLabel = LayerGroupLabel;
// #endregion group label

// #region cancel
export type ComboboxCancelProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the button props merged in. A function gets them as its
	 * argument. Without it, the button is a `button type="button"`.
	 */
	render?: RenderProp;
};

const CANCEL_EVENT_NAMES = new Set(["onClick", "onMouseDown"]);

/**
 * A button that clears the input, keeps the list open, and keeps focus in the input, like Ariakit's
 * `ComboboxCancel`. It is out of the Tab order and its `aria-controls` names the input, so a click on
 * it does not count as outside.
 */
export const ComboboxCancel = memo(function ComboboxCancel(props: ComboboxCancelProps) {
	const { ref, render, children, ...rest } = props;
	const combobox = useComboboxContext("ComboboxCancel");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		// A press must not move focus out of the input.
		if (name === "onMouseDown") {
			event.preventDefault();
			return;
		}
		combobox.clear();
	});

	const merged = merge_render_props({
		props: {
			"aria-label": "Clear input",
			tabIndex: -1,
			...(render ? {} : { type: "button" }),
			...rest,
			children,
		},
		render,
		internalNames: CANCEL_EVENT_NAMES,
		internal: handleEvent,
	});

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		combobox.registerCancel(node, true);
		return () => {
			element.current = null;
			combobox.registerCancel(node, false);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	return render_element({ render, merged, ref: setRef, defaultTag: "button" });
});
// #endregion cancel
