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

## Not vendored

Fluent UI `usePositioning` (read at commit around 2026-07-28) writes `position-area`, `position-try-fallbacks`, and a comma-separated `anchor-name`. That part matches this layer. Its `usePlacementObserver` still measures on scroll so it can set `data-placement`. Do not copy that loop. The Fluent repo is too large to keep as a submodule.

Microsoft's web-component menu uses one shared `--menu-trigger` and `@position-try`. JS measures only when `anchor-name` is missing. We do not need that fallback.

Base UI, React Aria, Zag, Ark, Reka, Bits UI, and Primer were checked. They still measure or call Floating UI. They are not references for positioning.
