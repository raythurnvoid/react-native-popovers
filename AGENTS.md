# native-layer

Read [README.md](README.md) and [.agents/skills/native-layer/SKILL.md](.agents/skills/native-layer/SKILL.md) before changing the tooltip.

## Rules

- Use `pnpm`. Run Node through Vite Plus: `vp env exec ...`.
- Do not add `@floating-ui/dom` or any measurement loop. Positioning is CSS Anchor Positioning only.
- Keep the public names `TooltipProvider`, `TooltipAnchor`, `Tooltip`, and `TooltipArrow`.
- Do not add Ariakit store props. The supported props are listed in the README.
- Storybook and Playwright use port `6116`. Do not use `5173` or `6006`.
- Playwright must use its own Chromium. Do not drive the user's signed-in browser.
- The arrow uses the requested side. Do not slide it along the edge.
- Reference checkouts live under `references/`. Do not import them into `src/`.
- Use tab indentation in `.ts`, `.tsx`, and `.css` files.
