# native-popovers

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

The arrow also needs anchored container queries (`container-type: anchored`) to follow a flip. Chrome and Edge support them. Where they are missing, the arrow stays on the requested side after a flip. See "Browser notes" for the other known gaps.

What we give up: older Safari and Firefox, and Floating UI `shift` and `limitShift`. The browser shifts a centered tooltip into the viewport by itself.

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

Fallbacks are `flip-block`, `flip-inline`, and `flip-block flip-inline`. A centered placement also adds span slides with the same logical `self-*` keywords, so they also work in RTL.

The positioner has `width: max-content`, like Ariakit's popover wrapper. With an auto width, a start or end placement near an edge would wrap its text into the small space left, instead of flipping.

Use a unique `anchor-name`. If the trigger already has one, append. Do not replace the list.

Reset `inset` and `margin`, then set the gutter on both edges of the axis that can flip. A single-edge margin lands on the wrong side after a flip and the gap disappears.

Use `popover="manual"`. Open with `showPopover({ source })`. The popover top layer is the hoist. There is no React portal and no measurement loop.

## How it works

The code follows SybTooltipV3's shape. `TooltipProvider` creates one plain controller (`src/tooltip/tooltip-controller.ts`) and puts it in context. The controller holds the open state, the timers, and the pointer and focus flags. Hover and focus change it without a React render.

- Only `Tooltip` (and `TooltipArrow` inside it) subscribes with `useSyncExternalStore`. The anchor and its parent never render during hover. This is the part that makes a long list of rows cheap.
- `getSnapshot` returns a new `{ open, placement }` object on each change, and the components render only from it. Do not read the controller's mutable state during render: the React Compiler caches work on the stable controller object, so such a read can go stale.
- The anchor gets its `anchor-name` only while its tooltip is open. Idle anchors have no anchor styles at all.
- `aria-describedby` is written to the anchor directly, not through React props.
- All tooltips in one document share a small group: the open one and the warm window.
- Escape goes through a small layer stack (`src/layer/layer-stack.ts`). It is the base for menus later.

All four components live in `src/tooltip/tooltip.tsx`, one region each, with their CSS in `tooltip.css` under the same region labels. Import them from `native-popovers/tooltip`. The placement type and list are in `native-popovers/tooltip/placement`. There is no index barrel.

`Tooltip` renders two elements:

- `np-TooltipPositioner` is the `popover="manual"` element. It owns `position-anchor`, `position-area`, the fallbacks, and the gap margins.
- `np-Tooltip` is the content, with `role="tooltip"`. Your `className`, `style`, `id`, and other div props go here.

## Public API

The names match the Ariakit pieces that `MyTooltip` already renders:

- `TooltipProvider` — `placement`, `timeout`, `open`, `setOpen`, `children`
- `TooltipAnchor` — `render` (an element or a function), `children`, `focusable`, `disabled`, and any HTML props such as `tabIndex`, `className`, or handlers
- `Tooltip` — `children`, `gutter`, `unmountOnHide`, `portal`, and any div props for the content
- `TooltipArrow` — `size`, `borderWidth`, and any div props

`timeout` is the hover show delay in milliseconds. The default is `500`, same as Ariakit's hovercard. Hide is immediate. `placement` defaults to `top`. `gutter` defaults to `8`. `unmountOnHide` defaults to `true`, so the content is not in the DOM until the tooltip is open. `TooltipArrow` `size` defaults to `16`, and it adds half its size to the gap, like Ariakit.

`TooltipAnchor` merges props like Ariakit. Without `render`, it is a `div` around `children`. With a `render` element, the element's own values win, class names and styles join, and every handler runs. The tooltip's own handler runs last and skips when an earlier one called `preventDefault()`. A function `render` gets the merged props and must spread them.

`focusable={false}` keeps the anchor out of the Tab order and stops focus from showing the tip. Hover still shows it. `disabled` never shows the tip, sets `aria-disabled`, and sets the native `disabled` on elements that have it. An element that cannot take focus gets `tabIndex={0}`, and loses it again when `disabled` or `focusable={false}` is set later.

Every `ref` prop may change between renders, including an inline callback ref. The new ref gets the node and the old one is cleared (`useForwardRefs` in `src/react-utils.ts`).

`open={true}` forces it open. `open={false}` forces it closed. Omit `open` for uncontrolled. `setOpen` still runs when the tooltip wants to change, even if the parent keeps `open` as it is.

`portal` is accepted so existing call sites can keep passing it. It does not create a React portal.

`variant` stays in the app. It is only a class name.

Do not add these in v1: `store`, `virtualFocus`, `getAnchorRect`, `updatePosition`, `showTimeout`, `hideTimeout`, `skipTimeout`, `shift`, `flip`, `sameWidth`.

## Styling

All library CSS is in `@layer native_popovers` and uses `:where()`, so any app rule wins. An app that orders its layers must put `native_popovers` first, for example `@layer native_popovers, external, theme, ...;`. Otherwise the unlisted layer lands last and beats the app layers.

The library ships layout only. Give the content its look through `className`. `TooltipArrow` reads the content's computed `background-color` and border on each open and uses them for its fill and stroke. When the content has no border, it reads a Tailwind-style ring from `box-shadow` (zero offset, zero blur, a spread), like Ariakit, and sets `data-ring` on the arrow.

Useful hooks:

- `data-side` and `data-align` on the positioner and the content hold the requested placement.
- `data-open` is on the content while open. `data-enter` is added one frame later, for an enter transition.
- `--np-TooltipPositioner-gutter` and `--np-TooltipPositioner-arrow-size` set the gap.

The arrow points at the anchor's center, with no JavaScript measuring:

- It is `position: fixed`, so `anchor()` can read both the anchor and the tooltip box (the positioner has its own `anchor-name`).
- It stays 4px away from the tooltip corners, like Ariakit's `arrowPadding`. A wide anchor gets the arrow at the near end of the tooltip.
- The positioner has `container-type: anchored`. `@container anchored(fallback: ...)` rules move and rotate the arrow when the browser flips the tooltip. These rules match the values from `tooltip_position_try_fallbacks`, so keep both in sync.

`data-side` keeps the requested side after a flip. Only the arrow follows the flip.

Limit: a `transform`, `filter`, or `contain: paint` (or `content`) on the content makes the content the arrow's containing block. Then `anchor()` cannot reach the anchor, and the arrow sits centered on the requested side. Put such styles on an inner element instead.

The positioner fills the gap between the anchor and the tooltip with two invisible strips. A pointer that crosses the gap stays over the tooltip, so it does not close on the way. This replaces Ariakit's safe triangle for a small gap.

## Behavior

Ariakit is the behavior reference. These are checked in `e2e/tooltip.spec.ts`:

- Content is unmounted until open.
- Hover waits for `timeout`. It starts on the first pointer move over the anchor. Later moves and rerenders do not restart it.
- Leaving, pressing, scrolling, or pressing a key during the wait cancels it.
- Hide is immediate when the pointer leaves, unless it goes into the tooltip.
- Touch never opens, even a finger that rests and moves on the anchor. A pen does.
- Keyboard focus (`:focus-visible`) opens immediately. A mouse press focuses the trigger and does not open the tip, and the next Tab still works.
- After a mouse focus, the first non-modifier key opens the tip, as in Ariakit.
- Blur closes. Keyboard focus keeps the tip open when the pointer leaves.
- Escape closes. The pointer cannot reopen it until it leaves and comes back. Focus cannot reopen it until blur and a new focus. This also holds after a mouse focus.
- Several `TooltipAnchor`s can share one `Tooltip`. An open tooltip moves to the anchor under the pointer.
- Focus that leaves through a link inside the tooltip closes it like a blur.
- Escape closes only the top layer. Inside a modal `<dialog>`, the first Escape closes the tooltip and the second closes the dialog.
- If focus is inside the tooltip when it closes, focus goes back to the anchor.
- Blur and a controlled close block the resting pointer, not the next focus.
- A click on the tooltip text keeps it open. A click on the trigger keeps it open. A press, right click, or focus outside closes it.
- Scrolling does not close it. While the anchor is scrolled out of view, `position-visibility: anchors-visible` hides it.
- One tooltip is open at a time. Moving to another one opens it at once.
- After a close, the next show skips the delay for one `timeout` window. A blur close does not start that window.
- A controlled parent can refuse an open or a close. `setOpen` still runs for each request. The DOM follows the `open` prop.
- `aria-describedby` keeps the anchor's own ids and adds the tooltip id while it is open, also after the anchor's own ids change.
- StrictMode hover and a StrictMode controlled open work.

## Differences from Ariakit

- `aria-describedby` is set on the anchor while open. Ariakit does not set it.
- `unmountOnHide` defaults to `true`. Ariakit defaults to `false`.
- Escape is handled in the window capture phase and marked with `preventDefault()`. A handler inside the page cannot cancel it first. In exchange, Ariakit dialogs and native dialogs under the tooltip see a handled press and stay open.
- The gap strips replace the safe triangle.
- No `store`, and no `showTimeout`/`hideTimeout`/`skipTimeout` (the warm window is `timeout`).
- No `arrowPadding` prop. The padding is the `--np-TooltipArrow-padding` CSS variable (4px).

## Browser notes

Checked with Playwright's Chromium 153, WebKit 26.6, and Firefox 155. Chromium passes everything. The e2e tests skip these known gaps, each with a one-line reason:

- WebKit and Firefox have no anchored container queries. The arrow stays on the requested side after a flip.
- Firefox places RTL `self-*` position areas on the wrong side. In RTL, a tooltip can land on the opposite side or off screen. LTR is fine.
- Firefox does not apply `position-visibility: anchors-visible` to a top-layer popover. The tooltip stays visible while its anchor is scrolled out of view.
- WebKit still reads `anchor()` through a transformed content box. The arrow then points at the anchor instead of falling back to the center.
- WebKit's Tab skips links by default, like Safari. The link test focuses the link directly there.

Safari does not focus a button, checkbox, or radio on click unless it has an explicit `tabIndex`. Like Ariakit's `Focusable`, the anchor sets `tabIndex={0}` on those elements in Safari. Without it, a click would not focus the anchor, so the next key press could not open the tip.

## Performance

`src/tooltip/tooltip-perf.stories.tsx` renders 1000 rows with the same JSX for this library and for Ariakit. Production build, headless Chromium, median of 5 runs, 3 tooltips per row (like a Files sidebar row):

|                                                       | native | Ariakit, t3-chat props | Ariakit, `unmountOnHide` |
| ----------------------------------------------------- | ------ | ---------------------- | ------------------------ |
| mount 1000 rows                                       | 81 ms  | 3756 ms                | 206 ms                   |
| unmount 1000 rows                                     | 16 ms  | 426 ms                 | 119 ms                   |
| JS heap after mount                                   | 26 MB  | 507 MB                 | 106 MB                   |
| script while scrolling under the pointer (240 frames) | 36 ms  | 726 ms                 | 595 ms                   |
| hover to visible                                      | 5.0 ms | 37.8 ms                | 12.2 ms                  |

A plain scroll with the pointer outside the list costs the same in all three: rows that are already mounted do no work. The win is in mounting and unmounting rows, which a virtualized list does all the time while it scrolls, and in pointer events while rows move under the pointer.

## Tests

Storybook runs on port `6116`. The app uses `5173`. syb-ui Storybook uses `6006`.

```sh
vp env exec pnpm exec playwright test
vp env exec pnpm exec playwright test --project=chromium
```

Playwright starts Storybook. The first command runs Playwright's own Chromium, WebKit, and Firefox. The second runs Chromium only. Do not use the signed-in Edge profile. Touch and pen checks use CDP input, so they run in Chromium only.

Every story in `src/tooltip/tooltip.stories.tsx` is a manual check too. `ManyRows` mounts 1000 anchors for a performance check.

Unit tests cover the placement map:

```sh
vp env exec pnpm test
```

Lint runs TypeScript 6, oxlint (type-aware, with the React Compiler rules), and the oxfmt check, like the t3-chat app. `format` rewrites the files:

```sh
vp env exec pnpm lint
vp env exec pnpm format
```

The format scripts list the project paths on purpose. The Ariakit checkout under `references/` has its own oxfmt config, so formatting `.` would walk into it.

Storybook compiles the code with the React Compiler (`.storybook/main.ts`), like the t3-chat app. So the e2e tests run the same compiled code the app will run.

## Later, in t3-chat

This repo is a t3-chat submodule. The root pnpm workspace excludes it, same as `packages/council`. CI does not clone it. Do not import it from the app until a publish or a CI checkout exists. Importing it now would break `pnpm install --frozen-lockfile` on CI.

When that is ready, `MyTooltip` can render `TooltipProvider`, `TooltipAnchor`, `Tooltip`, and `TooltipArrow` from this package. The `My*` components and the call sites stay. Menus are a later pass. A context menu should use a real 1px element at the pointer, not `getAnchorRect`.

Changes the app needs in that pass (`packages/app/src/components/my-tooltip.css` and `app.css`):

- Remove `contain: content` from `.MyTooltipContent`. It turns off `anchor()` for the arrow (see the limit under Styling).
- Remove `pointer-events: none` from `.MyTooltipContent`. With it, the pointer passes through the tooltip, so it cannot be hovered or its text selected, and it closes when the pointer crosses into it.
- Drop the `.MyTooltipArrow` square rotated with `transform`, and let `TooltipArrow` draw the arrow. Style its colors through the content background and border.
- Add `native_popovers` first in the app's `@layer` order in `app.css`. The app's CSS layer order plugin reads that list, and an unlisted layer lands last and beats the app layers.
- Add `packages/native-popovers/src` to the React Compiler `sources` in `packages/app/vite.config.ts`, so the app compiles it the same way Storybook does here.
- The package has `react` as a peer dependency, so the app's React is used.
- Keep `build.cssMinify: false` (or `"esbuild"`) in `packages/app/vite.config.ts`. lightningcss 1.33, Vite's default CSS minifier, cannot parse `@container anchored(...)` and fails the build ([lightningcss#1176](https://github.com/parcel-bundler/lightningcss/issues/1176)). Do not switch the app to `css.transformer: "lightningcss"` until that is fixed. The Storybook config here uses `"esbuild"` for the same reason.

## Reference submodules

See [references/README.md](references/README.md).
