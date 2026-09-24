---
name: native-popovers
description: Native tooltip layer that uses Popover and CSS Anchor Positioning. Use when changing the tooltip, its Storybook stories, its Playwright tests, or the later menu work on the same layer.
---

# native-popovers

## Decision

This package replaces Ariakit for floating UI, one piece at a time. The tooltip is the foundation. Menus, popovers, and context menus are later.

Use only the Popover API and CSS Anchor Positioning. Do not add a Floating UI fallback. Do not measure rectangles to place the tooltip.

The public API is the small set of Ariakit props that t3-chat already passes through `MyTooltip`. It is not a full `@ariakit/react` clone.

## Placement

Copy the logical map in `src/tooltip/placement.ts`. It follows Astryx:

- block sides use `self-block-start` or `self-block-end`
- inline sides use `self-inline-start` or `self-inline-end`
- start alignment spans the opposite edge so the start edges meet

Fallbacks are `flip-block, flip-inline, flip-block flip-inline`. Centered placements also add span slides. The slides use logical `self-*` keywords, like the base area, so RTL works.

Keep `width: max-content` on the positioner, like Ariakit's wrapper. With an auto width, a start or end tooltip near an edge wraps into the small space left instead of flipping.

Put the gutter on both edges of the flipping axis. A single-edge margin loses the gap when `position-try` flips.

Append `anchor-name`. Do not replace a name that is already on the trigger.

Set `inset: auto` so the user agent popover inset does not fight the anchor.

Call `showPopover({ source })`. Keep `popover="manual"`. A manual popover does not close on Escape, so the layer stack in `src/layer/layer-stack.ts` handles it. Only the top layer gets the press, and it calls `preventDefault()` so a dialog under it stays open.

Do not set `place-self`. `position-area` already centers.

`position-visibility: anchors-visible` hides the tooltip while its anchor is scrolled out of view.

## Arrow

`TooltipArrow` is `position: fixed` inside the top-layer positioner. That is the only way `anchor()` can read the trigger from inside the tooltip; an absolute element cannot. It uses `anchor()` on the trigger (`--np-TooltipPositioner-anchor`) to point at its center, and on the positioner box (`--np-TooltipPositioner-box`) to stay 4px inside the corners.

The positioner has `container-type: anchored`. The `@container anchored(fallback: ...)` blocks in `tooltip.css` move the arrow when the browser flips. They must list the fallback values from `tooltip_position_try_fallbacks` that land on the other side. Change both together.

Every `anchor()` has a fallback value. A transform, filter, or paint containment on the content turns off `anchor()` for the arrow, and the fallbacks then center it on the requested side.

The arrow reads the content colors on each open. With no border, it reads a ring box-shadow like Ariakit and sets `data-ring`.

## Controller

The components are one module, `src/tooltip/tooltip.tsx`, with a region per component (`context`, `provider`, `anchor`, `tooltip`, `arrow`). `tooltip.css` uses the same labels. Add new tooltip code to the matching region. Keep plain, React-free logic (controller, placement, layer stack) in its own file. Later menus should follow the same shape: one component module per widget, and no index barrel.

`src/tooltip/tooltip-controller.ts` holds the state. It follows SybTooltipV3: a plain object made once per `TooltipProvider`, with `configure()` on each render. Only `Tooltip` and `TooltipArrow` subscribe. The anchor must not render on hover or focus. Keep that true when you add props, because it is the reason this layer is fast in long lists.

Render only from the `useSyncExternalStore` snapshot (`{ open, placement }`, a new object on each change). Add a field there when a component needs new state. Never read the controller's mutable state during render: the React Compiler caches work on the stable controller object, so the read can go stale. Event handlers that read refs go through `useFn`, like the anchor's single `handleInternal`, because the compiler cannot tell that merged props are only called as handlers.

The anchor gets its `anchor-name` only while open, written straight to the DOM. Do not add the tooltip id to the anchor's `aria-describedby`: like Ariakit, the tooltip leaves it alone, because many anchors already carry the tooltip text as their name or description.

`Tooltip`'s `interactive={false}` sets `data-interactive="false"` on the positioner, and one CSS rule turns off pointer events on the gap strips and the content. `TooltipAnchor`'s `showOnHover` is checked in the `onPointerMove` branch of `handleInternal`, like Ariakit's mouse-move check.

`Tooltip` renders a positioner (`np-TooltipPositioner`, the popover) and the content (`np-Tooltip`). The positioner owns placement and the gap. The content gets the user props.

The components keep one stable ref callback each, so a render does not reset hover state or the `anchor-name`. Caller refs go through `useForwardRefs` in `src/react-utils.ts`, which moves the node to a new ref after each render.

One tooltip is open at a time. Opening one asks the previous one to close.

If any tooltip is open, or one closed inside the current `timeout` window, the next show delay is `0`. A blur close does not start that window.

Escape sets two blocks. Pointer movement cannot reopen until pointer leave. Focus cannot reopen until blur and a new focus.

Blur and a parent-forced close block the pointer until leave. They do not block the next focus.

Touch never opens. Check `pointerType` on enter and on move: a resting finger sends touch pointer moves. Pen is treated like a mouse.

Keyboard focus means `:focus-visible`. After a mouse focus, the first non-modifier key opens the tip, as in Ariakit.

Outside `pointerdown`, `contextmenu`, and `focusin` close it. When it closes with focus inside the content, focus goes back to the anchor without opening it again.

A pending show timer must survive a rerender. Pointer move must not restart it. A pending hide must be cancelled if the pointer comes back.

## Out of scope

Do not implement `store`, `virtualFocus`, `getAnchorRect`, `updatePosition`, or virtual refs. Do not measure the arrow position in JavaScript; keep it in CSS.

Do not copy Fluent's scroll measurement observer. Do not vendor the Fluent repo.

`portal` is accepted and ignored. The top layer is the hoist. `variant` stays in the app, not here.

t3-chat uses this package as a git submodule and pnpm workspace package, not from npm. CI must clone the submodule before `pnpm install`.

## Checks

From this repo:

```sh
vp env exec pnpm lint
vp env exec pnpm test
vp env exec pnpm exec playwright test
```

`lint` runs TypeScript 6, oxlint (type-aware, React Compiler rules), and the oxfmt check. Fix formatting with `vp env exec pnpm format`. Keep the explicit path list in the format scripts: formatting `.` walks into `references/`.

Storybook runs the React Compiler, like the t3-chat app. Check compiled output when a render bug looks impossible: fetch `/src/tooltip/tooltip.tsx` from the Storybook server and read the `_c(...)` cache blocks.

`playwright test` runs Chromium, WebKit, and Firefox. Add `--project=chromium` for a quick run. A test that hits a known browser gap uses `test.skip(browserName === ..., reason)` and the gap goes in the README "Browser notes". Skip the test or split out the failing part; never loosen an assertion for one browser.

`storybook build` uses `cssMinify: "esbuild"`, because lightningcss cannot parse `@container anchored(...)` yet. Keep that until lightningcss ships it.

Playwright starts Storybook on `http://127.0.0.1:6116`. The iframe URL looks like `/iframe.html?id=tooltip--hover-delay&viewMode=story`.

When a behavior check is supposed to prove a close or a cancel, break that line on purpose once and watch that assertion fail. Then put it back.

A "stays closed" check must not use a retrying `toHaveCount(0)`: it also passes when a wrong tooltip opens and closes again later. Use `expectNoTip` in the spec, which counts once.

The library CSS is in `@layer native_popovers`. An app that orders its layers must list `native_popovers` first.

## References

Read `references/README.md` before copying behavior from a submodule. Import nothing from `references/` into `src/`.
