# native-popovers

Read [README.md](README.md) and [.agents/skills/native-popovers/SKILL.md](.agents/skills/native-popovers/SKILL.md) before changing the tooltip, the popover, the menu, the hovercard, the select, or the combobox.

## Rules

- Use `pnpm`. Run Node through Vite Plus: `vp env exec ...`.
- Lint with `vp env exec pnpm lint` (TypeScript 6, oxlint, oxfmt check) and format with `vp env exec pnpm format`. Do not add Prettier or ESLint.
- The code must stay safe for the React Compiler. Components render only from the `useSyncExternalStore` snapshot, never from mutable controller state.
- Do not add `@floating-ui/dom` or any measurement loop. Positioning is CSS Anchor Positioning only.
- Keep these public names, each module split in regions. Do not add an index barrel; `package.json` exports each module path.
  - `src/tooltip/tooltip.tsx`: `TooltipProvider`, `TooltipAnchor`, `Tooltip`, `TooltipArrow`.
  - `src/popover/popover.tsx`: `PopoverProvider`, `PopoverDisclosure`, `Popover`, `PopoverDismiss`.
  - `src/menu/menu.tsx`: `MenuProvider`, `MenuButton`, `Menu`, `MenuItem`, `MenuItemCheckbox`, `MenuItemRadio`, `MenuGroup`, `MenuGroupLabel`, `ContextMenuTrigger`.
  - `src/hovercard/hovercard.tsx`: `HovercardProvider`, `HovercardAnchor`, `HovercardDisclosure`, `Hovercard`, `HovercardArrow`.
  - `src/select/select.tsx`: `SelectProvider`, `SelectLabel`, `Select`, `SelectPopover`, `SelectSearch`, `SelectList`, `SelectItem` (with the attached `SelectItem.useActive`), `SelectGroup`, `SelectGroupLabel`.
  - `src/combobox/combobox.tsx`: `ComboboxProvider`, `ComboboxLabel`, `Combobox`, `ComboboxPopover`, `ComboboxList`, `ComboboxItem`, `ComboboxGroup`, `ComboboxGroupLabel`, `ComboboxCancel`.
- Do not add Ariakit store props. The supported props are listed in the README.
- Storybook and Playwright use port `6116`. Do not use `5173` or `6006`.
- Playwright must use its own Chromium. Do not drive the user's signed-in browser.
- The arrow is placed in CSS only: `anchor()` points it at the anchor, and anchored container queries move it after a flip. Do not measure it in JavaScript.
- Only `Tooltip` and `TooltipArrow` may subscribe to the tooltip controller, only `Popover` to the popover controller, only `Menu` to the menu controller, only `Hovercard` and `HovercardArrow` to the hovercard controller, only `SelectPopover` to the select controller, and only `ComboboxPopover` to the combobox controller. Anchors, disclosures, triggers, inputs, lists, and items must not render on hover, focus, a key, open, or close. The controllers write their ARIA and `data-active-item` attributes on the DOM instead.
- One exception: `SelectItem.useActive(value)` lets a caller's row render when that row becomes active or stops being active (for tab order of inline row actions). No library part calls it.
- Keep library CSS in `@layer native_popovers` with `:where()` selectors.
- Reference checkouts live under `references/`. Do not import them into `src/`.
- Use tab indentation in `.ts`, `.tsx`, and `.css` files.
