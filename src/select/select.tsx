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
import { LayerGroup, LayerGroupLabel, type LayerGroupLabelProps, type LayerGroupProps } from "../layer/group.tsx";
import { createSelect, type SelectAnchorRect, type SelectController, type SelectValue } from "./select-controller.ts";
import "./select.css";

// #region context
// The value is one stable controller, so reading it never renders a consumer again.
const SelectContext = createContext<SelectController | null>(null);

function useSelectContext(owner: string) {
	const select = use(SelectContext);
	if (!select) throw new Error(`${owner} must be used within SelectProvider`);
	return select;
}
// #endregion context

// #region provider
export type { SelectAnchorRect, SelectValue };

export type SelectProviderProps<V extends SelectValue = SelectValue> = {
	children?: ReactNode;
	/**
	 * The chosen value. An array makes a multi-value select. Omit it for an uncontrolled select.
	 */
	value?: V;
	/**
	 * The first value of an uncontrolled select.
	 * @default ""
	 */
	defaultValue?: V;
	/**
	 * Called with the new value when the user picks an option. Method syntax, so a caller can type the
	 * value it expects (a string, or a string array). `this: void` says it is safe to call unbound.
	 */
	setValue?(this: void, value: V): void;
	/**
	 * Controlled open state. `true` forces it open, `false` forces it closed. Omit it for uncontrolled.
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
 * Owns one select. Put one `Select` (the trigger) and one `SelectPopover` inside it, and optionally a
 * `SelectLabel`. The select never picks an option by itself: with no value, no option is chosen.
 *
 * @example
 * ```tsx
 * <SelectProvider value={mode} setValue={setMode}>
 *   <SelectLabel>Mode</SelectLabel>
 *   <Select>{mode}</Select>
 *   <SelectPopover gutter={4}>
 *     <SelectItem value="agent">Agent</SelectItem>
 *     <SelectItem value="ask">Ask</SelectItem>
 *   </SelectPopover>
 * </SelectProvider>
 * ```
 */
export const SelectProvider = memo(function SelectProvider(props: SelectProviderProps) {
	const { children, value, defaultValue = "", setValue, open, setOpen, placement = "bottom-start" } = props;
	const options = { placement, value, setValue, open, setOpen };
	const [select] = useState(() => createSelect(options, defaultValue));

	useLayoutEffect(() => {
		select.configure(options);
	});

	useLayoutEffect(() => () => select.destroy(), [select]);

	return <SelectContext value={select}>{children}</SelectContext>;
});
// #endregion provider

// #region label
export type SelectLabelProps = ComponentPropsWithRef<"div">;

/**
 * The visible label of the select. It names the trigger (when the trigger has no `aria-label`) and the
 * listbox, and a click on it focuses the trigger, like Ariakit's `SelectLabel`.
 */
export const SelectLabel = memo(function SelectLabel(props: SelectLabelProps) {
	const { ref, id, onClick, ...rest } = props;
	const select = useSelectContext("SelectLabel");
	const generatedId = useId();
	const element = useRef<HTMLDivElement | null>(null);

	const setElement = useFn((node: HTMLDivElement) => {
		element.current = node;
		select.registerLabel(node);
		return () => {
			element.current = null;
			select.registerLabel(null);
		};
	});

	useForwardRefs(element, [ref]);

	const handleClick = (event: MouseEvent<HTMLDivElement>) => {
		onClick?.(event);
		if (event.defaultPrevented) return;
		select.focusTrigger();
	};

	return <div {...rest} ref={setElement} id={id ?? generatedId} onClick={handleClick} />;
});
// #endregion label

// #region trigger
export type SelectProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the trigger props merged in. A function gets them as its
	 * argument. Without it, the trigger is a `button type="button"` around `children`.
	 */
	render?: RenderProp;
	/**
	 * A disabled trigger never opens. It goes to the rendered element, so a button gets `disabled`.
	 */
	disabled?: boolean;
	/**
	 * Letters and digits typed on the closed, focused trigger pick the next matching option, like a
	 * native select and like Ariakit. Turn it off when a value change starts expensive work.
	 * @default true
	 */
	typeahead?: boolean;
};

const TRIGGER_EVENT_NAMES = new Set(["onClick", "onKeyDown"]);

/**
 * The trigger, a `role="combobox"` that is not editable (the WAI-ARIA select-only combobox). It gets
 * `aria-haspopup`, `aria-expanded`, and `aria-controls`, like Ariakit. Opening and closing do not render
 * it again. A click, Enter, or Space toggles the list. The arrow key toward the list opens it.
 */
export const Select = memo(function Select(props: SelectProps) {
	const { ref, id, render, typeahead = true, children, ...rest } = props;
	const select = useSelectContext("Select");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);
	const generatedId = useId();

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		const target = event.currentTarget;
		if (target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
		if (name === "onClick") {
			// A click from Enter or Space has no detail.
			select.toggle((event as MouseEvent<HTMLElement>).detail === 0);
			return;
		}
		select.handleTriggerKeyDown((event as KeyboardEvent<HTMLElement>).nativeEvent, typeahead);
	});

	const merged = merge_render_props(
		// Like Ariakit, add the button type only to the default button.
		{
			id: id ?? generatedId,
			role: "combobox",
			"aria-autocomplete": "none",
			...(render ? {} : { type: "button" }),
			...rest,
			children,
		},
		render,
		TRIGGER_EVENT_NAMES,
		handleEvent,
	);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		select.registerTrigger(node, null);

		return () => {
			element.current = null;
			select.registerTrigger(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	// Safari does not focus a button on click. The tabindex makes it take focus, so focus restore and the
	// outside rules see the trigger as the focused element, like Ariakit.
	useFocusableTabIndex(element, !merged.disabled, merged.tabIndex !== undefined);

	return render_element(render, merged, setRef, "button");
});
// #endregion trigger

// #region popover
type SelectPopover_ClassNames = "np-SelectPositioner" | "np-Select";

type SelectPopover_CssVars = {
	"--np-SelectPositioner-anchor": string;
	"--np-SelectPositioner-gutter": string;
	"--np-SelectPositioner-overflow-padding": string;
	"--np-SelectPositioner-position-area": string;
	"--np-SelectPositioner-position-try-fallbacks": string;
};

export type SelectPopoverProps = ComponentPropsWithRef<"div"> & {
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
	 * Space between the trigger and the list, in pixels.
	 * @default 0
	 */
	gutter?: number;
	/**
	 * Make the list as wide as its trigger, with CSS `anchor-size()`.
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
	 * Remove the content from the DOM while closed. With `false`, it stays mounted and hidden, like
	 * Ariakit, and typeahead on the closed trigger can find the options.
	 * @default false
	 */
	unmountOnHide?: boolean;
	/**
	 * Move focus into the list when it opens. With `false`, focus stays on the trigger, and the arrow
	 * keys on the trigger move into the list.
	 * @default true
	 */
	autoFocusOnShow?: boolean;
	/**
	 * A virtual anchor in viewport pixels, for a list with no trigger, such as a picker at the text
	 * caret. The list shows next to this rectangle instead of the trigger.
	 */
	anchorRect?: SelectAnchorRect | null;
};

/**
 * The popup. Without a `SelectSearch` inside, it is the `role="listbox"` and keeps DOM focus. With one,
 * it is a `role="dialog"` around the search input and a `SelectList`. It shows in the browser top
 * layer and CSS anchor positioning places it, so opening it does no JavaScript layout work.
 *
 * `className`, `style`, and the other div props go to the content element. A wrapper element
 * (`np-SelectPositioner`) holds the position and the gap.
 */
export const SelectPopover = memo(function SelectPopover(props: SelectPopoverProps) {
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
		autoFocusOnShow = true,
		anchorRect = null,
		onKeyDown,
		onKeyUp,
		onPointerMove,
		onPointerLeave,
		onMouseDown,
		...rest
	} = props;
	const select = useSelectContext("SelectPopover");
	// Only this component renders when the list opens or closes, or when a search input comes or goes.
	const { open, placement, search } = useSyncExternalStore(select.subscribe, select.getSnapshot, select.getSnapshot);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		select.setPositioner(node);
		return () => select.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		select.setContent(node);
		return () => {
			content.current = null;
			select.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	useLayoutEffect(() => {
		select.configurePopover({ autoFocusOnShow, anchorRect });
	}, [select, autoFocusOnShow, anchorRect]);

	// React runs these after the handlers inside the popup. A control that already used a key called
	// preventDefault, and the select leaves the key alone.
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		select.handleContentKeyDown(event.nativeEvent);
		select.handlePopupKeyDown(event.nativeEvent);
	};

	const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyUp?.(event);
		select.handleContentKeyUp(event.nativeEvent);
	};

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		onPointerMove?.(event);
		select.handlePointerMove(event.nativeEvent);
	};

	const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
		onPointerLeave?.(event);
		select.handlePointerLeave(event.nativeEvent);
	};

	const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		onMouseDown?.(event);
		select.handleMouseDown(event.nativeEvent);
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
			className={"np-SelectPositioner" satisfies SelectPopover_ClassNames}
			data-side={side}
			data-align={align}
			data-same-width={sameWidth ? "" : undefined}
			style={
				{
					"--np-SelectPositioner-anchor": select.anchorName,
					"--np-SelectPositioner-gutter": `${gutter}px`,
					"--np-SelectPositioner-overflow-padding": `${overflowPadding}px`,
					"--np-SelectPositioner-position-area": placement_position_area(placement),
					"--np-SelectPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
				} satisfies SelectPopover_CssVars as CSSProperties
			}
		>
			<div
				role={search ? "dialog" : "listbox"}
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				// Focus stays on the listbox while the keys move the active option (virtual focus, like Ariakit).
				tabIndex={-1}
				className={cx("np-Select" satisfies SelectPopover_ClassNames, className)}
				data-side={side}
				data-align={align}
				data-open={open ? "" : undefined}
				onKeyDown={handleKeyDown}
				onKeyUp={handleKeyUp}
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onMouseDown={handleMouseDown}
			>
				{children}
			</div>
		</div>
	);
});
// #endregion popover

// #region search
export type SelectSearchProps = ComponentPropsWithRef<"input"> & {
	/**
	 * After each text change, make the first option of the (filtered) list active, like Ariakit's
	 * `autoSelect`. Any navigation key turns it off until the next change.
	 * @default false
	 */
	autoSelect?: boolean;
};

/**
 * A search input inside the select popup (`role="combobox"`, `aria-autocomplete="list"`). DOM focus
 * moves here when the list opens and stays here: the arrow keys move the active option, and Enter
 * picks it. The caller filters the options from the input value. An uncontrolled input is cleared
 * when the list closes.
 */
export const SelectSearch = memo(function SelectSearch(props: SelectSearchProps) {
	const { ref, autoSelect = false, onKeyDown, onChange, onCompositionEnd, ...rest } = props;
	const select = useSelectContext("SelectSearch");
	const element = useRef<HTMLInputElement | null>(null);
	const controlled = rest.value !== undefined;

	const setElement = useFn((node: HTMLInputElement) => {
		element.current = node;
		select.registerSearch(node, { autoSelect, controlled });
		return () => {
			element.current = null;
			select.registerSearch(null, { autoSelect, controlled });
		};
	});

	useForwardRefs(element, [ref]);

	useLayoutEffect(() => {
		if (element.current) select.registerSearch(element.current, { autoSelect, controlled });
	}, [select, autoSelect, controlled]);

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		onKeyDown?.(event);
		select.handleSearchKeyDown(event.nativeEvent);
	};

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		onChange?.(event);
		select.searchChanged((event.nativeEvent as InputEvent).isComposing === true);
	};

	const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
		onCompositionEnd?.(event);
		select.searchChanged(false);
	};

	return (
		<input
			role="combobox"
			aria-autocomplete="list"
			aria-haspopup="listbox"
			autoComplete="off"
			{...rest}
			ref={setElement}
			onKeyDown={handleKeyDown}
			onChange={handleChange}
			onCompositionEnd={handleCompositionEnd}
		/>
	);
});
// #endregion search

// #region list
export type SelectListProps = ComponentPropsWithRef<"div">;

/**
 * The `role="listbox"` of a select that has a `SelectSearch`. Without a search input, the popup itself
 * is the listbox and this part is not needed.
 */
export const SelectList = memo(function SelectList(props: SelectListProps) {
	const { ref, id, ...rest } = props;
	const select = useSelectContext("SelectList");
	const generatedId = useId();
	const element = useRef<HTMLDivElement | null>(null);

	const setElement = useFn((node: HTMLDivElement) => {
		element.current = node;
		select.registerList(node);
		return () => {
			element.current = null;
			select.registerList(null);
		};
	});

	useForwardRefs(element, [ref]);

	return <div role="listbox" {...rest} ref={setElement} id={id ?? generatedId} />;
});
// #endregion list

// #region item
type ItemClickRule = boolean | ((event: MouseEvent<HTMLElement>) => boolean);

export type SelectItemProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the option props merged in. A function gets them as its
	 * argument. Without it, the option is a `div`.
	 */
	render?: RenderProp;
	/**
	 * The value this option picks.
	 */
	value: string;
	/**
	 * A disabled option keeps `aria-disabled="true"`, ignores clicks, and is skipped by the keys and by
	 * typeahead.
	 */
	disabled?: boolean;
	/**
	 * Pick this option's value on click, Enter, or Space. A function gets the click event, so a button
	 * inside the option can say no.
	 * @default true
	 */
	setValueOnClick?: ItemClickRule;
	/**
	 * Close the list after a click, Enter, or Space. A function gets the click event.
	 * @default true, or false for a multi-value select
	 */
	hideOnClick?: ItemClickRule;
};

const ITEM_EVENT_NAMES = new Set(["onClick", "onClickCapture"]);

/**
 * One `role="option"`. The controller writes `aria-selected` and `data-active-item`, so a key, a hover,
 * or a value change does not render it. Enter and Space pick the active option by calling `click()` on
 * it, so `event.target` is the option itself.
 *
 * `SelectItem.useActive(value)` says whether the option with `value` is the active option.
 */
const SelectItem = Object.assign(
	memo(function SelectItem(props: SelectItemProps) {
		const { ref, render, value, disabled = false, setValueOnClick = true, hideOnClick, id, children, ...rest } = props;
		const select = useSelectContext("SelectItem");
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
			const pick = typeof setValueOnClick === "function" ? setValueOnClick(click) : setValueOnClick;
			const hideRule = hideOnClick ?? !select.isMultiple();
			const hide = typeof hideRule === "function" ? hideRule(click) : hideRule;
			if (pick) select.pick(value);
			if (hide) select.request(false, "select");
		});

		const merged = merge_render_props(
			{
				role: "option",
				...rest,
				id: id ?? generatedId,
				tabIndex: -1,
				"aria-disabled": disabled || undefined,
				children,
			},
			render,
			ITEM_EVENT_NAMES,
			handleEvent,
		);

		const setRef = useFn((node: HTMLElement) => {
			element.current = node;
			select.registerItem(node, value);
			return () => {
				element.current = null;
				select.unregisterItem(node);
			};
		});

		useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

		// The ref callback runs only when the node attaches. A new value on the same node registers again.
		useLayoutEffect(() => {
			if (element.current) select.registerItem(element.current, value);
		}, [select, value]);

		return render_element(render, merged, setRef, "div");
	}),
	{
		/**
		 * Whether the option with `value` is the active option. It is the one subscription a caller may
		 * add inside an option, for example to keep a row's action buttons out of the Tab order unless the
		 * row is active. It renders again only when its answer changes. The select's own parts never use it.
		 */
		useActive: function useActive(value: string) {
			const select = useSelectContext("SelectItem.useActive");
			const isActive = () => select.getActiveValue() === value;
			return useSyncExternalStore(select.subscribeActive, isActive, isActive);
		},
	},
);

export { SelectItem };
// #endregion item

// #region group
export type SelectGroupProps = LayerGroupProps;

/**
 * A `role="group"` of options. A `SelectGroupLabel` inside it names it.
 */
export const SelectGroup = LayerGroup;
// #endregion group

// #region group label
export type SelectGroupLabelProps = LayerGroupLabelProps;

/**
 * The visible label of a `SelectGroup`. It is hidden from assistive technology, because the group
 * already takes its text as its name, like Ariakit.
 */
export const SelectGroupLabel = LayerGroupLabel;
// #endregion group label
