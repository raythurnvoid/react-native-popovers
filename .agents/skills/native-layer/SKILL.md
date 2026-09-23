---
name: native-layer
description: Native tooltip layer that uses Popover and CSS Anchor Positioning. Use when changing the tooltip, its Storybook stories, its Playwright tests, or the later menu work on the same layer.
---

# native-layer

## Decision

This package replaces Ariakit for floating UI, one piece at a time. The tooltip is the foundation. Menus, popovers, and context menus are later.

Use only the Popover API and CSS Anchor Positioning. Do not add a Floating UI fallback. Do not measure rectangles to place the tooltip.

The public API is the small set of Ariakit props that t3-chat already passes through `MyTooltip`. It is not a full `@ariakit/react` clone.

## Placement

Copy the logical map in `src/tooltip/placement.ts`. It follows Astryx:

- block sides use `self-block-start` or `self-block-end`
- inline sides use `self-inline-start` or `self-inline-end`
- start alignment spans the opposite edge so the start edges meet

Fallbacks are `flip-block, flip-inline, flip-block flip-inline`. Centered placements also add span slides.

Put the gutter on both edges of the flipping axis. A single-edge margin loses the gap when `position-try` flips.

Append `anchor-name`. Do not replace a name that is already on the trigger.

Set `inset: auto` so the user agent popover inset does not fight the anchor.

Call `showPopover({ source })`. Keep `popover="manual"`. A manual popover does not close on Escape, so the tooltip listens for Escape itself.

`place-self: anchor-center` is only for centered alignment.

## Session

One tooltip is open at a time. Claiming the session closes the others.

If any tooltip is open, or one closed inside the current `timeout` window, the next show delay is `0`.

Escape sets two blocks. Pointer movement cannot reopen until pointer leave. Focus cannot reopen until blur and a new focus.

Blur and a parent-forced close block the pointer until leave. They do not block the next focus.

Touch never opens. Pen is treated like a mouse.

A pending show timer must survive a rerender. Pointer move must not restart it. A pending hide must be cancelled if the pointer comes back.

## Out of scope

Do not implement `store`, `virtualFocus`, `getAnchorRect`, `updatePosition`, virtual refs, or a sliding arrow.

Do not copy Fluent's scroll measurement observer. Do not vendor the Fluent repo.

`portal` is accepted and ignored. The top layer is the hoist. `variant` stays in the app, not here.

Do not import this package from t3-chat app code until CI clones the submodule or the package is published. The workspace exclude is intentional.

## Checks

From this repo:

```sh
vp env exec pnpm check
vp env exec pnpm test
vp env exec pnpm exec playwright test
```

Playwright starts Storybook on `http://127.0.0.1:6116`. The iframe URL looks like `/iframe.html?id=tooltip--hover-delay&viewMode=story`.

When a behavior check is supposed to prove a close or a cancel, break that line on purpose once and watch that assertion fail. Then put it back.

## References

Read `references/README.md` before copying behavior from a submodule. Import nothing from `references/` into `src/`.
