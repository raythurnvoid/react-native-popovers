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
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	type SyntheticEvent,
	type UIEvent,
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
import { createMenu, type MenuController } from "./menu-controller.ts";
import "./menu.css";

// #region context
// Both values are one stable controller, so reading them never renders a consumer again.
// MenuContext is the menu of the nearest MenuProvider. MenuLevelContext is the menu whose content
// holds the element: the level an item belongs to, and the parent of a nested MenuProvider.
const MenuContext = createContext<MenuController | null>(null);
const MenuLevelContext = createContext<MenuController | null>(null);

function useMenuContext(owner: string) {
	const menu = use(MenuContext);
	if (!menu) throw new Error(`${owner} must be used within MenuProvider`);
	return menu;
}

function useMenuLevel(owner: string) {
	const menu = use(MenuLevelContext);
	if (!menu) throw new Error(`${owner} must be used within Menu`);
	return menu;
}
// #endregion context

// #region provider
export type MenuProviderProps = {
	children?: ReactNode;
	/**
	 * Preferred side and alignment, with Ariakit names. The browser flips it when it does not fit.
	 * @default "bottom-start", or "right-start" for a submenu
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
 * Owns one menu. Put one `MenuButton` and one `Menu` inside it, or a `ContextMenuTrigger` and a `Menu`.
 * A `MenuProvider` inside a `Menu` is a submenu: its `MenuButton` renders an item of the parent menu.
 *
 * @example
 * ```tsx
 * <MenuProvider>
 *   <MenuButton>Actions</MenuButton>
 *   <Menu>
 *     <MenuItem onClick={copy}>Copy</MenuItem>
 *     <MenuProvider>
 *       <MenuButton render={<MenuItem />}>Share</MenuButton>
 *       <Menu gutter={8}>
 *         <MenuItem onClick={email}>Email</MenuItem>
 *       </Menu>
 *     </MenuProvider>
 *   </Menu>
 * </MenuProvider>
 * ```
 */
export const MenuProvider = memo(function MenuProvider(props: MenuProviderProps) {
	const parent = use(MenuLevelContext);
	// Ariakit's default: a submenu opens beside its item, a root menu below its button.
	const { children, placement = parent ? "right-start" : "bottom-start", open, setOpen } = props;
	const options = { placement, open, setOpen };
	const [menu] = useState(() => createMenu(options, parent));

	useLayoutEffect(() => {
		menu.configure(options);
	});

	useLayoutEffect(() => () => menu.destroy(), [menu]);

	return <MenuContext value={menu}>{children}</MenuContext>;
});
// #endregion provider

// #region button
export type MenuButtonProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the button props merged in. A function gets them as its
	 * argument. Without it, the button is a `button type="button"` around `children`. In a submenu,
	 * render a `MenuItem`.
	 */
	render?: RenderProp;
};

const BUTTON_EVENT_NAMES = new Set(["onClick", "onKeyDown"]);

/**
 * The keys that open a root menu from its button, and the item they make active. They follow the side
 * the menu opens on, like Ariakit. `left` and `right` are logical, so in RTL they swap.
 */
const BUTTON_OPEN_KEYS: Record<string, Partial<Record<string, "keyboard-first" | "keyboard-last">>> = {
	top: { ArrowDown: "keyboard-first", ArrowUp: "keyboard-last" },
	bottom: { ArrowDown: "keyboard-first", ArrowUp: "keyboard-last" },
	right: { ArrowRight: "keyboard-first" },
	left: { ArrowLeft: "keyboard-first" },
};

/**
 * The button that opens the menu. It gets `aria-haspopup="menu"`, `aria-expanded`, and
 * `aria-controls`, like Ariakit. Opening and closing do not render it again.
 *
 * A click toggles a root menu. A mouse click focuses the menu with no active item. Enter, Space, and
 * the arrow key toward the menu open it with the first item active (ArrowUp: the last). In a submenu,
 * a click opens it and never closes it, and the parent menu handles the keys.
 */
export const MenuButton = memo(function MenuButton(props: MenuButtonProps) {
	const { ref, id, render, children, ...rest } = props;
	const menu = useMenuContext("MenuButton");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);
	const generatedId = useId();

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;
		const target = event.currentTarget;
		if (target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;

		if (name === "onClick") {
			// A click from Enter or Space has no detail.
			const keyboard = (event as MouseEvent<HTMLElement>).detail === 0;
			if (menu.isSubmenu) {
				menu.openFromButton(keyboard ? "keyboard-first" : "hover");
				return;
			}
			if (menu.getSnapshot().open) menu.request(false, "toggle");
			else menu.openFromButton(keyboard ? "keyboard-first" : "pointer");
			return;
		}

		if (menu.isSubmenu) return;
		let side = placement_side(menu.getSnapshot().placement);
		// A `right` menu opens on the left in RTL, so the key toward it is ArrowLeft.
		if (getComputedStyle(target).direction === "rtl") {
			if (side === "right") side = "left";
			else if (side === "left") side = "right";
		}
		const reason = BUTTON_OPEN_KEYS[side]?.[(event as KeyboardEvent<HTMLElement>).key];
		if (!reason) return;
		event.preventDefault();
		menu.openFromButton(reason);
	});

	const merged = merge_render_props(
		// Like Ariakit, add the button type only to the default button. A wrapper can pass `id={undefined}`,
		// so fall back to the generated id: the menu takes its name from this id.
		{ id: id ?? generatedId, "aria-haspopup": "menu", ...(render ? {} : { type: "button" }), ...rest, children },
		render,
		BUTTON_EVENT_NAMES,
		handleEvent,
	);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		menu.registerButton(node, null);

		return () => {
			element.current = null;
			menu.registerButton(null, node);
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	// Safari does not focus a button on click. The tabindex makes it take focus, so focus restore and
	// the outside rules see the button as the focused element, like Ariakit. A submenu item keeps -1.
	useFocusableTabIndex(element, !menu.isSubmenu && !merged.disabled, merged.tabIndex !== undefined);

	return render_element(render, merged, setRef, "button");
});
// #endregion button

// #region menu
type Menu_ClassNames = "np-MenuPositioner" | "np-Menu";

type Menu_CssVars = {
	"--np-MenuPositioner-anchor": string;
	"--np-MenuPositioner-gutter": string;
	"--np-MenuPositioner-shift": string;
	"--np-MenuPositioner-overflow-padding": string;
	"--np-MenuPositioner-position-area": string;
	"--np-MenuPositioner-position-try-fallbacks": string;
};

export type MenuProps = ComponentPropsWithRef<"div"> & {
	/**
	 * Accepted so Ariakit call sites keep working. The popover top layer already lifts the menu above
	 * everything, so no React portal is created.
	 */
	portal?: boolean;
	/**
	 * Accepted and ignored, like `portal`.
	 */
	portalElement?: unknown;
	/**
	 * Space between the button and the menu, in pixels.
	 * @default 0
	 */
	gutter?: number;
	/**
	 * Moves the menu along its button, in pixels, away from the aligned edge (Ariakit's `shift`). A
	 * negative value moves a `right-start` submenu up. Centered placements ignore it.
	 * @default 0
	 */
	shift?: number;
	/**
	 * Least space between the menu and the viewport edges, in pixels, on the axis where the browser
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
 * The menu, a `role="menu"` list. It shows in the browser top layer and CSS anchor positioning places
 * it, so opening it does no JavaScript layout work. A submenu stays a DOM child of its parent menu.
 *
 * `className`, `style`, and the other div props go to the menu element. A wrapper element
 * (`np-MenuPositioner`) holds the position and the gap.
 */
export const Menu = memo(function Menu(props: MenuProps) {
	const {
		ref,
		id,
		className,
		children,
		portal: _portal,
		portalElement: _portalElement,
		gutter = 0,
		shift = 0,
		overflowPadding = 8,
		unmountOnHide = false,
		onKeyDown,
		onKeyUp,
		onPointerMove,
		onPointerLeave,
		onMouseDown,
		onContextMenu,
		onClick,
		onScrollCapture,
		...rest
	} = props;
	const menu = useMenuContext("Menu");
	// Only this component renders when the menu opens or closes.
	const { open, placement } = useSyncExternalStore(menu.subscribe, menu.getSnapshot, menu.getSnapshot);
	const generatedId = useId();
	const content = useRef<HTMLDivElement | null>(null);

	const setPositioner = useFn((node: HTMLDivElement) => {
		menu.setPositioner(node);
		return () => menu.setPositioner(null);
	});

	const setContent = useFn((node: HTMLDivElement) => {
		content.current = node;
		menu.setContent(node);
		return () => {
			content.current = null;
			menu.setContent(null);
		};
	});

	useForwardRefs(content, [ref]);

	// React runs these after the handlers inside the menu. A control that already used a key called
	// preventDefault, and the menu leaves the key alone.
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyDown?.(event);
		menu.handleKeyDown(event.nativeEvent);
	};

	const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
		onKeyUp?.(event);
		menu.handleKeyUp(event.nativeEvent);
	};

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		onPointerMove?.(event);
		menu.handlePointerMove(event.nativeEvent);
	};

	const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
		onPointerLeave?.(event);
		menu.handlePointerLeave(event.nativeEvent);
	};

	const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		onMouseDown?.(event);
		menu.handleMouseDown(event.nativeEvent);
	};

	const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
		onContextMenu?.(event);
		menu.handleContextMenu(event.nativeEvent);
	};

	const handleClick = (event: MouseEvent<HTMLDivElement>) => {
		onClick?.(event);
		menu.handleClick(event.nativeEvent);
	};

	const handleScrollCapture = (event: UIEvent<HTMLDivElement>) => {
		onScrollCapture?.(event);
		menu.handleScroll(event.nativeEvent);
	};

	if (!open && unmountOnHide) return null;

	const side = placement_side(placement);
	const align = placement_align(placement);

	return (
		<div
			ref={setPositioner}
			popover="manual"
			className={"np-MenuPositioner" satisfies Menu_ClassNames}
			data-side={side}
			data-align={align}
			style={
				{
					"--np-MenuPositioner-anchor": menu.anchorName,
					"--np-MenuPositioner-gutter": `${gutter}px`,
					"--np-MenuPositioner-shift": `${shift}px`,
					"--np-MenuPositioner-overflow-padding": `${overflowPadding}px`,
					"--np-MenuPositioner-position-area": placement_position_area(placement),
					"--np-MenuPositioner-position-try-fallbacks": placement_position_try_fallbacks(placement),
				} satisfies Menu_CssVars as CSSProperties
			}
		>
			<div
				role="menu"
				aria-orientation="vertical"
				{...rest}
				ref={setContent}
				id={id ?? generatedId}
				// Focus stays on the menu, and the active item is only marked (virtual focus, like Ariakit).
				tabIndex={-1}
				className={cx("np-Menu" satisfies Menu_ClassNames, className)}
				data-side={side}
				data-align={align}
				data-open={open ? "" : undefined}
				onKeyDown={handleKeyDown}
				onKeyUp={handleKeyUp}
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onMouseDown={handleMouseDown}
				onContextMenu={handleContextMenu}
				onClick={handleClick}
				onScrollCapture={handleScrollCapture}
			>
				<MenuLevelContext value={menu}>{children}</MenuLevelContext>
			</div>
		</div>
	);
});
// #endregion menu

// #region item
export type MenuItemProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the item props merged in. A function gets them as its
	 * argument. Without it, the item is a `div`.
	 */
	render?: RenderProp;
	/**
	 * A disabled item keeps `aria-disabled="true"`, ignores clicks, and is skipped by the keys and
	 * by typeahead.
	 */
	disabled?: boolean;
	/**
	 * Close every menu level after a click.
	 * @default true
	 */
	hideOnClick?: boolean;
};

const ITEM_EVENT_NAMES = new Set(["onClick", "onClickCapture"]);

/**
 * One command of the menu. A click, Enter, or Space (on keyup) runs `onClick` and closes the whole
 * menu, and focus goes back to the button.
 */
export const MenuItem = memo(function MenuItem(props: MenuItemProps) {
	const { ref, render, disabled = false, hideOnClick = true, id, children, ...rest } = props;
	const menu = useMenuLevel("MenuItem");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);
	const generatedId = useId();

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (name === "onClickCapture") {
			// Like Ariakit's Focusable: a disabled item stops the click before any onClick runs.
			if (!disabled) return;
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		// A submenu item opens its submenu instead. Its MenuButton handles the click.
		if (event.defaultPrevented || !hideOnClick || event.currentTarget.hasAttribute("aria-haspopup")) return;
		// A link opened in a new tab (Ctrl or Cmd) or downloaded (Alt) keeps the menu open, like Ariakit.
		const mouseEvent = event as MouseEvent<HTMLElement>;
		const modified = mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.altKey;
		if (modified && event.currentTarget.tagName === "A") return;
		menu.closeAll("select");
	});

	const merged = merge_render_props(
		{
			role: "menuitem",
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
		return () => {
			element.current = null;
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	return render_element(render, merged, setRef, "div");
});
// #endregion item

// #region checkbox item
export type MenuItemCheckboxProps = Omit<MenuItemProps, "hideOnClick"> & {
	/**
	 * Whether the item is checked. The caller changes it in `onClick`.
	 */
	checked: boolean;
	/**
	 * Close every menu level after a click.
	 * @default false
	 */
	hideOnClick?: boolean;
};

/**
 * A `role="menuitemcheckbox"` item. It stays open after a click by default, like Ariakit.
 */
export const MenuItemCheckbox = memo(function MenuItemCheckbox(props: MenuItemCheckboxProps) {
	const { checked, hideOnClick = false, ...rest } = props;

	return <MenuItem role="menuitemcheckbox" aria-checked={checked} hideOnClick={hideOnClick} {...rest} />;
});
// #endregion checkbox item

// #region group
// The group's label id setter, so a MenuGroupLabel can name its group.
const MenuGroupContext = createContext<((id: string | null) => void) | null>(null);

export type MenuGroupProps = ComponentPropsWithRef<"div">;

/**
 * A `role="group"` of items. A `MenuGroupLabel` inside it names it.
 */
export const MenuGroup = memo(function MenuGroup(props: MenuGroupProps) {
	const { children, ...rest } = props;
	const [labelId, setLabelId] = useState<string | null>(null);

	return (
		<div role="group" aria-labelledby={labelId ?? undefined} {...rest}>
			<MenuGroupContext value={setLabelId}>{children}</MenuGroupContext>
		</div>
	);
});
// #endregion group

// #region group label
export type MenuGroupLabelProps = ComponentPropsWithRef<"div">;

/**
 * The visible label of a `MenuGroup`. It is hidden from assistive technology, because the group
 * already takes its text as its name, like Ariakit.
 */
export const MenuGroupLabel = memo(function MenuGroupLabel(props: MenuGroupLabelProps) {
	const { id, ...rest } = props;
	const setGroupLabelId = use(MenuGroupContext);
	const generatedId = useId();
	const labelId = id ?? generatedId;

	useLayoutEffect(() => {
		if (!setGroupLabelId) return;
		setGroupLabelId(labelId);
		return () => setGroupLabelId(null);
	}, [setGroupLabelId, labelId]);

	return <div aria-hidden="true" {...rest} id={labelId} />;
});
// #endregion group label

// #region context menu trigger
export type ContextMenuTriggerProps = HTMLAttributes<HTMLElement> & {
	ref?: Ref<HTMLElement>;
	/**
	 * The element to render. An element gets the trigger props merged in. A function gets them as its
	 * argument. Without it, the trigger is a `div`.
	 */
	render?: RenderProp;
};

const CONTEXT_MENU_EVENT_NAMES = new Set(["onContextMenu", "onKeyDown"]);

/**
 * The element that opens the menu of its `MenuProvider` with a right click, the ContextMenu key, or
 * Shift+F10. A right click opens the menu at the pointer with no active item. A key opens it at the
 * focused element inside the trigger, with the first item active. Shift+right click keeps the
 * browser's own menu. The trigger gets no aria attributes, like Ariakit and React Aria.
 */
export const ContextMenuTrigger = memo(function ContextMenuTrigger(props: ContextMenuTriggerProps) {
	const { ref, render, children, ...rest } = props;
	const menu = useMenuContext("ContextMenuTrigger");
	const renderElement = isValidElement<Record<string, unknown>>(render) ? render : null;
	const element = useRef<HTMLElement | null>(null);

	const handleEvent = useFn((name: string, event: SyntheticEvent<HTMLElement>) => {
		if (event.defaultPrevented) return;

		if (name === "onContextMenu") {
			const mouseEvent = event as MouseEvent<HTMLElement>;
			if (mouseEvent.shiftKey) return;
			event.preventDefault();
			// Chromium also sends a contextmenu event for Shift+F10 and the ContextMenu key, with `button` -1.
			// Its position is not the pointer, so open it like the key does.
			const keyboard = mouseEvent.button === -1;
			menu.openAt(event.currentTarget, keyboard ? null : { x: mouseEvent.clientX, y: mouseEvent.clientY });
			return;
		}

		const keyEvent = event as KeyboardEvent<HTMLElement>;
		if (keyEvent.key !== "ContextMenu" && !(keyEvent.shiftKey && keyEvent.key === "F10")) return;
		event.preventDefault();
		menu.openAt(event.currentTarget, null);
	});

	const merged = merge_render_props({ ...rest, children }, render, CONTEXT_MENU_EVENT_NAMES, handleEvent);

	const setRef = useFn((node: HTMLElement) => {
		element.current = node;
		return () => {
			element.current = null;
		};
	});

	useForwardRefs(element, [ref, renderElement?.props.ref as Ref<HTMLElement> | undefined]);

	useLayoutEffect(() => menu.registerContextTrigger(), [menu]);

	return render_element(render, merged, setRef, "div");
});
// #endregion context menu trigger
