# Reference checkouts

These folders are git submodules. They are for reading. Do not import them from `src/`.

## ariakit

Required. The public tooltip props use Ariakit names so `MyTooltip` can switch later.

Look at `tooltip-store.ts`, `hovercard-store.ts`, `disclosure-store.ts`, `tooltip-provider.tsx`, and `tooltip.tsx` when a prop's meaning is unclear. `tooltip-anchor.tsx` and `hovercard-anchor.tsx` hold the hover and focus rules. `focusable.tsx` holds `tabIndex`, `focusable`, and `disabled`. The arrow SVG and its color reading come from `popover-arrow.tsx` and `popover-arrow-path.ts` (license headers kept in `src/tooltip/`).

Copy the prop names and the basic timing (`timeout` default 500, `gutter` default 8, hide delay 0). Do not copy the store, `virtualFocus`, `getAnchorRect`, or `updatePosition`.

## css-anchor-kit

Style builder and a flat tooltip, popover, and menu. No submenu and no typeahead.

Use it for the native tooltip shape: `popover=manual`, open delay, focus opens immediately, document Escape, `inset: auto`. Its safe area is a rectangle, not a cursor polygon. Its menu is not the submenu reference.

## astryx

Behavior reference for later menus and for the position map we already use.

`DropdownMenuSubMenu` uses `popover=manual`, `showPopover({ source })`, one list-focus and typeahead per level, and Escape that closes one level. Leaf items close the whole stack.

Copy `position-area` keywords and the both-edge margin comment. Do not copy StyleX. Astryx has no submenu arrow.

Its submenu has no safe triangle: it relies on a 200ms hide delay. Take the grace area from Radix instead.

## base-ui

Menu behavior reference (Base UI 1.8.0, shallow clone). It still positions with Floating UI, so do not copy placement code.

Read `packages/react/src/menu/` (`root/MenuRoot.tsx`, `submenu-trigger/MenuSubmenuTrigger.tsx`, `positioner/MenuPositioner.tsx`, `item/useMenuItemCommonProps.ts`) and `packages/react/src/floating-ui-react/safePolygon.ts`. `root/MenuRoot.test.tsx` has useful submenu cases.

What the menu copies: an open submenu closes when another item of the same level gets hovered, a closing level closes its children, and Escape closes one level. What it does not copy: `pointer-events: none` on the parent menu during the approach (a native submenu is a DOM child of its parent and would inherit it), and the 40ms idle close.

## radix-primitives

Menu behavior reference (shallow clone). `packages/react/menu/src/menu.tsx` is the core of the dropdown and context menus.

What the menu copies: the grace area. When the pointer leaves the trigger of an open submenu, a polygon from the exit point to the submenu corners lets it cross other items for 300ms while it moves toward the submenu (`menu.tsx`, `onPointerGraceIntentChange` and `isPointInPolygon`). The menu takes the side from the two rects instead of `data-side`, because a CSS fallback can flip the submenu. It does not copy the React-tree "inside" rule of `dismissable-layer`, which a native layer cannot use.

## Not vendored

Fluent UI `usePositioning` (read at commit around 2026-07-28) writes `position-area`, `position-try-fallbacks`, and a comma-separated `anchor-name`. That part matches this layer. Its `usePlacementObserver` still measures on scroll so it can set `data-placement`. Do not copy that loop. The Fluent repo is too large to keep as a submodule.

Microsoft's web-component menu uses one shared `--menu-trigger` and `@position-try`. JS measures only when `anchor-name` is missing. We do not need that fallback.

Base UI, React Aria, Zag, Ark, Reka, Bits UI, and Primer were checked. They still measure or call Floating UI. They are not references for positioning. Base UI and Radix are kept above as menu behavior references only.

React Aria (`adobe/react-spectrum`, read at `956ecbcb` on 2026-09-25) was read for `useSafelyMouseToSubmenu`, `useSubmenuTrigger`, and `useTypeSelect`. Its safe triangle also sets `pointer-events: none` on the parent menu, so it is not copied. The repo is too large to keep as a submodule.
