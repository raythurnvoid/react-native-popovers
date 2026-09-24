# native-popovers

Read [README.md](README.md) and [.agents/skills/native-popovers/SKILL.md](.agents/skills/native-popovers/SKILL.md) before changing the tooltip or the popover.

## Rules

- Use `pnpm`. Run Node through Vite Plus: `vp env exec ...`.
- Lint with `vp env exec pnpm lint` (TypeScript 6, oxlint, oxfmt check) and format with `vp env exec pnpm format`. Do not add Prettier or ESLint.
- The code must stay safe for the React Compiler. Components render only from the `useSyncExternalStore` snapshot, never from mutable controller state.
- Do not add `@floating-ui/dom` or any measurement loop. Positioning is CSS Anchor Positioning only.
- Keep the public names `TooltipProvider`, `TooltipAnchor`, `Tooltip`, and `TooltipArrow` in `src/tooltip/tooltip.tsx`, and `PopoverProvider`, `PopoverDisclosure`, `Popover`, and `PopoverDismiss` in `src/popover/popover.tsx`, split in regions. Do not add an index barrel; `package.json` exports each module path.
- Do not add Ariakit store props. The supported props are listed in the README.
- Storybook and Playwright use port `6116`. Do not use `5173` or `6006`.
- Playwright must use its own Chromium. Do not drive the user's signed-in browser.
- The arrow is placed in CSS only: `anchor()` points it at the anchor, and anchored container queries move it after a flip. Do not measure it in JavaScript.
- Only `Tooltip` and `TooltipArrow` may subscribe to the tooltip controller, and only `Popover` to the popover controller. The anchor and the disclosure must not render on hover, focus, open, or close.
- Keep library CSS in `@layer native_popovers` with `:where()` selectors.
- Reference checkouts live under `references/`. Do not import them into `src/`.
- Use tab indentation in `.ts`, `.tsx`, and `.css` files.
