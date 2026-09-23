# native-layer

A small React layer for floating UI. It uses the Popover API and CSS Anchor Positioning. It does not use Floating UI.

The first piece is a tooltip. Menus, popovers, and context menus come later, on the same layer.

## Why this exists

The Files sidebar in t3-chat mounts an Ariakit menu and several Ariakit tooltips on every visible row. Scrolling that list is not fluid. The cost is the per-row store and positioning work, not a Convex refetch.

A shared menu for the whole tree was considered and rejected. The goal is to replace the floating implementation under the existing `MyTooltip`, `MyMenu`, `MyPopover`, and `MyContextMenu` components. Call sites should keep the JSX they already have.

SybTooltipV3 in syb-ui already tries native anchors. If the browser, the anchor, or the props are not a simple centered case, it falls back to `@floating-ui/dom`. That fallback is unfinished native wiring. It is not an old-browser requirement. This library does not copy that fallback.

## Native only

We already depend on CSS Anchor Positioning in the product. Old browsers that lack these APIs are out of scope. Do not add a Floating UI path here.

Practical floor:

- `showPopover({ source })` for the implicit anchor: Chrome and Edge 133+, Safari 26+, Firefox 147+.
- CSS Anchor Positioning, including `position-area`: Chrome and Edge 125+, Safari 26+, Firefox 147+.

Popover itself is older. The anchor APIs are the real floor.

What we give up: older Safari and Firefox, Floating UI `shift` and `limitShift`, and an arrow that slides along the edge. The arrow in v1 sits on the requested side. It does not follow a flip.

## What we checked

No current headless React kit was ready to adopt for menus on Anchor + Popover.

- Base UI still positions with Floating UI. A draft that dropped the positioner was closed and never merged.
- React Aria measures rectangles.
- Ariakit has no `position-area`. Menus use `getAnchorRect`.
- Zag, Ark, Reka, and Bits UI use Floating UI.
- Primer sets `position-try-fallbacks` and still measures with `getBoundingClientRect`.
- Fluent's `usePositioning` writes `position-area` and `position-try-fallbacks`. Its placement observer still measures on scroll. Do not copy that loop. Fluent UI is large, so it is not a submodule. The useful file was read, not vendored.
- css-anchor-kit is a style builder plus a flat tooltip, popover, and menu. No submenu. Its tooltip behavior is the closest small reference: `popover=manual`, hover delay, focus opens immediately, Escape is handled in script because a manual popover does not close itself.
- Astryx is the submenu behavior reference for later work. It uses `popover=manual`, `showPopover({ source })`, one focus scope per level, and both-edge margins so a flip keeps the gap. It is styled, not headless. It has no submenu arrow.

## What to copy

Placement strings stay the Ariakit names: `top`, `bottom`, `left`, `right`, plus `-start` and `-end`.

The CSS map is the Astryx one, with logical keywords so RTL keeps working:

- `top` is `self-block-start`
- `bottom` is `self-block-end`
- `left` is `self-inline-start`
- `right` is `self-inline-end`
- start alignment on a block side spans toward the inline end, so the start edges meet

Fallbacks are `flip-block`, `flip-inline`, and `flip-block flip-inline`. A centered placement also adds span slides, because a plain flip stays centered and can still clip.

Use a unique `anchor-name`. If the trigger already has one, append. Do not replace the list.

Reset `inset` and `margin`, then set the gutter on both edges of the axis that can flip. A single-edge margin lands on the wrong side after a flip and the gap disappears.

Use `popover="manual"`. Open with `showPopover({ source })`. The popover top layer is the hoist. There is no React portal and no measurement loop.

## Public API

The names match the Ariakit pieces that `MyTooltip` already renders:

- `TooltipProvider` — `placement`, `timeout`, `open`, `setOpen`, `children`
- `TooltipAnchor` — `render` or `children`, `tabIndex`, `focusable`, `disabled`
- `Tooltip` — `children`, `gutter`, `unmountOnHide`, `portal`
- `TooltipArrow`

`timeout` is the hover show delay in milliseconds. The default is `500`, same as Ariakit's hovercard. Hide is immediate. `placement` defaults to `top`. `gutter` defaults to `8`. `unmountOnHide` defaults to `true`, so the content is not in the DOM until the tooltip is open.

`open={true}` forces it open. `open={false}` forces it closed. Omit `open` for uncontrolled. `setOpen` still runs when the tooltip wants to change, even if the parent keeps `open` as it is.

`portal` is accepted so existing call sites can keep passing it. It does not create a React portal.

`variant` stays in the app. It is only a class name.

Do not add these in v1: `store`, `virtualFocus`, `getAnchorRect`, `updatePosition`, `showTimeout`, `hideTimeout`, `skipTimeout`, `shift`, `flip`, `sameWidth`.

## Behavior

These match the interaction checks in SybTooltipV3. They do not copy tests that assert `autoUpdate`, `computePosition`, a virtual ref, a hoisted container, or arrow box-shadow variables.

- Content is unmounted until open.
- Hover waits for `timeout`. Leaving, pressing, or scrolling during the wait cancels it.
- A rerender during the wait does not restart the timer.
- Touch does not open. A pen does.
- Focus opens immediately. Blur closes.
- Escape closes. Pointer movement does not reopen until the pointer leaves and comes back.
- Blur and a controlled close do the same pointer block.
- After Escape, keyboard focus does not reopen until blur and a new focus.
- Moving to another tooltip opens it immediately, and the first one closes.
- After a close, the next show skips the delay for one `timeout` window. Then the delay returns.
- A controlled parent can refuse an open or a close. `setOpen` still runs. The DOM follows the `open` prop.
- `aria-describedby` keeps existing ids and adds the tooltip id while it is open.
- StrictMode hover and a controlled Escape still work.

While any tooltip is open, the next one uses no delay. On close, that warm window lasts for `timeout` milliseconds. Opening one tooltip closes the others.

## Tests

Storybook runs on port `6116`. The app uses `5173`. syb-ui Storybook uses `6006`.

```sh
vp env exec pnpm exec playwright test
```

Playwright starts Storybook. It uses its own Chromium. Do not use the signed-in Edge profile.

Unit tests cover the placement map:

```sh
vp env exec pnpm test
vp env exec pnpm check
```

## Later, in t3-chat

This repo is a submodule at `packages/native-layer`. The root pnpm workspace excludes it, same as `packages/council`. CI does not clone it. Do not import it from the app until a publish or a CI checkout exists. Importing it now would break `pnpm install --frozen-lockfile` on CI.

When that is ready, `MyTooltip` can render `TooltipProvider`, `TooltipAnchor`, `Tooltip`, and `TooltipArrow` from this package. The `My*` components and the call sites stay. Menus are a later pass. A context menu should use a real 1px element at the pointer, not `getAnchorRect`.

## Reference submodules

See [references/README.md](references/README.md).
