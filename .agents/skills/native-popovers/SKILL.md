---
name: native-popovers
description: Native tooltip, popover, menu, hovercard, select, and combobox layer that uses the Popover API and CSS Anchor Positioning. Use when changing any of them (including submenus, the context menu, the search select, and inline row actions), their Storybook stories, or their Playwright tests.
---

# native-popovers

## Decision

This package replaces Ariakit for floating UI, one piece at a time. The tooltip is the foundation. The click popover, the menu, the hovercard, the select, and the combobox are built the same way.

Use only the Popover API and CSS Anchor Positioning. Do not add a Floating UI fallback. Do not measure rectangles to place the tooltip or the popover.

The public API is the small set of Ariakit props that t3-chat already passes through `MyTooltip`, `MyPopover`, `MyMenu`, `MyContextMenu`, `MyHoverCard`, `MySelect`, `MySearchSelect`, and `MyCombobox`. It is not a full `@ariakit/react` clone.

## Placement

Copy the logical map in `src/layer/placement.ts`. Every layer in this package shares it. It follows Astryx:

- block sides use `self-block-start` or `self-block-end`
- inline sides use `self-inline-start` or `self-inline-end`
- start alignment spans the opposite edge so the start edges meet

Fallbacks are `flip-block, flip-inline, flip-block flip-inline`. Centered placements also add span slides. The slides use logical `self-*` keywords, like the base area, so RTL works.

Keep `width: max-content` on the positioner, like Ariakit's wrapper. With an auto width, a start or end tooltip near an edge wraps into the small space left instead of flipping.

Put the gutter on both edges of the flipping axis. A single-edge margin loses the gap when `position-try` flips.

Append `anchor-name`. Do not replace a name that is already on the trigger.

Set `inset: auto` so the user agent popover inset does not fight the anchor.

Call `showPopover({ source })`, except in the combobox (see its section). Keep `popover="manual"`. A manual popover does not close on Escape, so the layer stack in `src/layer/layer-stack.ts` handles it. Only the top layer gets the press, and it calls `preventDefault()` so a dialog under it stays open.

Do not set `place-self`. `position-area` already centers.

`position-visibility: anchors-visible` hides the tooltip while its anchor is scrolled out of view. Do not set it on the popover: the popover can hold focus, and hiding it would hide the focused element.

## Arrow

`TooltipArrow` and `HovercardArrow` render the shared `LayerArrow` (`src/layer/arrow.tsx`, CSS in `arrow.css`). It is `position: fixed` inside the top-layer positioner. That is the only way `anchor()` can read the trigger from inside the layer; an absolute element cannot. The positioner has the class `np-ArrowHost` and sets `--np-Arrow-anchor` (the trigger's anchor name) and `--np-Arrow-box` (its own anchor name). The arrow uses `anchor()` on the trigger to point at its center, and on the positioner box to stay 4px inside the corners.

The `np-ArrowHost` positioner has `container-type: anchored`. The `@container anchored(fallback: ...)` blocks in `arrow.css` move the arrow when the browser flips. They must list the fallback values from `placement_position_try_fallbacks` that land on the other side. Change both together.

Every `anchor()` has a fallback value. A transform, filter, or paint containment on the content turns off `anchor()` for the arrow, and the fallbacks then center it on the requested side.

The arrow reads the content colors on each open. With no border, it reads a ring box-shadow like Ariakit and sets `data-ring`.

## Tooltip controller

The components are one module, `src/tooltip/tooltip.tsx`, with a region per component (`context`, `provider`, `anchor`, `tooltip`, `arrow`). `tooltip.css` uses the same labels. Add new tooltip code to the matching region. Keep plain, React-free logic (controller, placement, layer stack) in its own file. The popover, the menu, the hovercard, the select, and the combobox follow the same shape: one component module per widget, and no index barrel.

`src/tooltip/tooltip-controller.ts` holds the state. It is a plain object made once per `TooltipProvider`, with `configure()` on each render. Only `Tooltip` and `TooltipArrow` subscribe. The anchor must not render on hover or focus. Keep that true when you add props, because it is the reason this layer is fast in long lists.

Render only from the `useSyncExternalStore` snapshot (`{ open, placement }`, a new object on each change). Add a field there when a component needs new state. Never read the controller's mutable state during render: the React Compiler caches work on the stable controller object, so the read can go stale. Event handlers that read refs go through `useFn`, like the anchor's single `handleInternal`, because the compiler cannot tell that merged props are only called as handlers.

The anchor gets its `anchor-name` only while open, written straight to the DOM. Do not add the tooltip id to the anchor's `aria-describedby`: like Ariakit, the tooltip leaves it alone, because many anchors already carry the tooltip text as their name or description.

`Tooltip`'s `interactive={false}` sets `data-interactive="false"` on the positioner, and one CSS rule turns off pointer events on the gap strips and the content. `TooltipAnchor`'s `showOnHover` is checked in the `onPointerMove` branch of `handleInternal`, like Ariakit's mouse-move check.

`Tooltip` renders a positioner (`np-TooltipPositioner`, the popover) and the content (`np-Tooltip`). The positioner owns placement and the gap. The content gets the user props.

The components keep one stable ref callback each, so a render does not reset hover state or the `anchor-name`. Caller refs go through `useForwardRefs` in `src/react-utils.ts`, which moves the node to a new ref after each render.

One tooltip is open at a time. Opening one asks the previous one to close.

If any tooltip is open, or one closed less than `skipTimeout` ago (300ms, like Ariakit), the next show delay is `0`. The window is not `timeout`: with a 2000ms row delay that would open every row at once. A blur close does not start that window.

Escape sets two blocks. Pointer movement cannot reopen until pointer leave. Focus cannot reopen until blur and a new focus.

Blur and a parent-forced close block the pointer until leave. They do not block the next focus.

Touch never opens. Check `pointerType` on enter and on move: a resting finger sends touch pointer moves. Pen is treated like a mouse.

Keyboard focus means `:focus-visible`. After a mouse focus, the first non-modifier key opens the tip, as in Ariakit.

Outside `pointerdown`, `contextmenu`, and `focusin` close it. When it closes with focus inside the content, focus goes back to the anchor without opening it again.

A pending show timer must survive a rerender. Pointer move must not restart it. A pending hide must be cancelled if the pointer comes back.

StrictMode detaches and attaches refs. `setPositioner(null)` syncs in a microtask, so a ref swap does not hide and show the tooltip. The e2e test "StrictMode hover opens one tooltip" checks that `beforetoggle` fires only open and closed.

## Popover

`src/popover/popover.tsx` has the regions `context`, `provider`, `disclosure`, `popover`, and `dismiss`. `popover.css` uses the same labels. `src/popover/popover-controller.ts` has the tooltip controller's shape: `configure`, `request`, `applyOpen`, and `sync`, with the same controlled contract.

Only `Popover` subscribes. The controller writes the trigger's `aria-expanded` and `aria-controls` straight to the DOM, so the trigger never renders on open or close. Keep that when you add props.

StrictMode detaches and attaches refs. `setPositioner(null)` syncs in a microtask, like the tooltip and the menu, so a ref swap does not hide and show the popover. The e2e test "StrictMode controlled open and close through setOpen" checks that `beforetoggle` fires only open and closed.

The shared render merge (`merge_render_props` and `render_element`) and the Safari tabIndex hook (`useFocusableTabIndex`) are in `src/react-utils.ts`. Focus helpers are in `src/layer/focus.ts`.

Outside rules follow Ariakit's `useHideOnInteractOutside`. "Inside" means the trigger or the positioner. A nested popover or a tooltip inside is a DOM child of the positioner, even though it shows in the top layer. A click closes only when the recorded press also started outside. A right click or a focus move outside closes too. An outside click or right click sets the close reason `"outside"`, and then focus is not restored. While an ancestor of the positioner has `inert` (an Ariakit modal above it), `covered()` turns off the outside rules and Escape, and CSS hides the positioner. `covered()` also needs a visible anchor: an app region turned off with `hidden` and `inert` hides the anchor, and that is not a modal, so the outside rules and Escape still work there (story `InertContainer`). Ariakit gets the same result from its DOM snapshot: nodes added after the popover opened do not count as outside. The native popover does not sit next to the modal portal, so it cannot copy that rule.

Focus restore runs in `applyOpen(false)`, before the popover hides. It skips an `"outside"` close and a close where focus already sits on a focusable element outside the popover. Focus on show runs in a microtask after `showPopover`, and it leaves focus alone when it is already inside the content.

`overflowPadding` (default 8, like Ariakit) is a margin on the positioner across the side it opens on: both edges for a centered popover, the far edge for start and end. The browser keeps the margin box inside the viewport when it shifts a centered popover, and a flip fallback mirrors the margins. Do not measure the viewport for it.

Escape: the layer stack hands the press back when the target is inside the content. The content's React `onKeyDown` then closes the popover and calls `preventDefault()`, unless a control inside already did. This runs before an Ariakit dialog's own `onKeyDown`, so the dialog sees a handled press. Nested popovers work the same way, inner first.

There is no "close the layers inside" step. When the parent hides, a tooltip inside closes on the pointerleave that every browser sends, and a nested popover closes on the focus that moves back to the parent's trigger. The e2e test "a parent close also closes a tooltip open inside it" checks the tooltip case in all three browsers.

## Menu

`src/menu/menu.tsx` has the regions `context`, `provider`, `button`, `menu`, `item`, `checkbox item`, `radio item`, `group`, `group label`, and `context menu trigger`. `menu.css` has the regions `menu`, `item`, and `context menu trigger`, one per owner, like `tooltip.css`. `src/menu/menu-controller.ts` makes one controller per menu level, with the regions `items`, `submenus`, `show`, `keys`, and `pointer`. A `MenuProvider` inside a `Menu` makes a submenu level, and the submenu gets the parent controller. The grace polygon is in `menu-grace.ts`. The typeahead rule (`src/layer/typeahead.ts`) and the list core (`src/layer/list.ts`: items, the active item, the key steps, the page step) are shared with the select and the combobox. Each pure helper has unit tests next to it.

Only `Menu` subscribes. The controller writes the button's `aria-expanded` and `aria-controls`, the content's `aria-activedescendant`, and the item's `data-active-item` straight to the DOM. The button and the items never render on open, close, hover, or a key.

Focus is virtual, like Ariakit: DOM focus stays on `role="menu"`, and every key goes to that level's `handleKeyDown`. A text field inside a menu keeps focus and its own keys; only Escape still closes the menu from it. `levelTextField` finds the field only inside this level, so an editor root around the whole menu and a checkbox input do not count. A submenu that closes moves focus to its parent only when focus was inside it, so a text field in the parent keeps focus. Tab closes the root after the browser moves focus, unless focus stayed in the menu. The outside check alone misses it, because Chromium and WebKit can Tab into a button inside the context trigger row, and that row counts as inside. Enter clicks the active item on keydown, and Space on keyup. `handleMouseDown` prevents focus moves inside the level, except in text fields. Handlers filter by level with `target.closest('[role="menu"]') === content`, because a submenu is a DOM and React child of its parent menu.

Levels:

- One open submenu per level. Opening one closes the other with the reason `"sibling"`.
- Closing a level closes its submenus first, deepest first, with the reason `"parent"`. A manual popover does not close its manual children by itself, so this step is required.
- A scroll or a click on the level outside its items closes its open submenu. A scroll also stops a pending hover open.
- Escape and ArrowLeft (ArrowRight in RTL) close one level. Focus goes to the parent with the submenu's item active (`parent.focusItem`). RTL comes from the computed `direction` at key time. A submenu whose `MenuProvider` stops rendering while open closes the same way (`destroy`).
- A root button's open keys follow the logical side too: a `right-start` menu opens with ArrowLeft in RTL.
- Outside listeners (`src/layer/outside.ts`, shared with the popover) run on the root level only. `contains()` covers every level, because submenus stay DOM children of the root.

Hover and the grace area:

- A mouse or pen move sets the active item. Touch is skipped: check `pointerType`. The move handler compares client coordinates, because WebKit sends synthetic moves with the same point.
- Hover on a submenu item starts a 150 ms timer. Later moves on it do not restart the timer. Setting another active item in the level closes the open submenu.
- When the pointer leaves the item of an open submenu, `menu_grace_area` builds the Radix polygon from the last point on that item and the submenu's box. For 300 ms, a move inside the polygon toward the submenu's side does not change the active item and does not start a hover timer. The side comes from the rects, because CSS fallbacks can flip the submenu. Leaving the level forgets the last point, so a pointer that comes back never starts a grace area.

Context menu:

- `openAt(trigger, at)` anchors to a 0×0 `position: fixed` span (`np-MenuPoint`) in `body`, so a transformed row cannot move it. A second `openAt` moves the anchor name without hiding the menu. A key open (`at` null) anchors to the focused element inside the trigger.
- Chromium sends a `contextmenu` event with `button` -1 after Shift+F10 and the ContextMenu key. The trigger treats it as a key open. The menu content prevents it, so the browser menu does not open on top of ours.
- A provider with a `ContextMenuTrigger` closes on window blur.
- `writeAria` names the menu from the element that opened it: the trigger when it has an id, else the button. Ariakit does the same through its disclosure element.

StrictMode detaches and attaches refs. `setPositioner(null)` and `registerButton(null)` sync in a microtask, so a ref swap does not hide and show the menu.

Test timing with `page.clock` and `pauseClock` in `e2e/menu.spec.ts`: install the clock before `openStory`, and step past each boundary (149 and 151 ms, 300 ms, 500 ms).

## Hovercard

`src/hovercard/hovercard.tsx` has the regions `context`, `provider`, `anchor`, `disclosure`, `hovercard`, and `arrow`. `hovercard.css` has `hovercard`. `src/hovercard/hovercard-controller.ts` has the popover controller's shape, plus the tooltip's hover timers.

- Open reasons are `"hover"` and `"disclosure"`. Only a disclosure open writes `aria-expanded="true"` and moves focus into the card (`focusIn`), like Ariakit.
- The show timer starts on the first anchor pointer move. A press, a scroll, or a key cancels it. The hide timer starts when the pointer leaves the anchor or the card for somewhere that is not inside (`inside` covers the anchor, the disclosure, and the positioner with its gap strips).
- Escape while hovered sets `pointerBlocked`, so the resting pointer cannot reopen the card. `anchorPointerEnter` clears it.
- `restoreFocus` runs before hide: to the disclosure, else the anchor, only when focus is inside and the close reason is not `"outside"` or `"focus"`.
- Only `Hovercard` and `HovercardArrow` subscribe.

## Select

`src/select/select.tsx` has the regions `context`, `provider`, `label`, `trigger`, `popover`, `search`, `list`, `item` (with the attached `SelectItem.useActive`), `group`, and `group label`. `select.css` has `popover`, `item`, and `virtual anchor`. `src/select/select-controller.ts` makes one controller per provider, with the regions `items`, `show`, `value`, `keys`, and `pointer`.

- Two modes. Without `SelectSearch`, the content is the listbox and holds DOM focus and `aria-activedescendant`. With it (`registerSearch`), the content is a dialog, the search input holds focus and `aria-activedescendant`, and `SelectList` is the listbox. The snapshot has `search`, so `SelectPopover` can switch the role.
- The controller writes `aria-selected` in `registerItem` and after each pick, so a value change renders no option. `registerItem` also runs in a layout effect when an option's value changes on the same node.
- Key handlers filter by target. The content handler runs only when `event.target === content`, so Enter and Space on a button inside an option run the button. The search handler runs on the input. The trigger handler runs only on the trigger.
- The content keys do not loop. The search keys loop through the input (`list_step(..., "through-owner")`), and Home and End go to the caret unless an option is active.
- Enter and Space with no active option close the list. Enter in the search input always calls `preventDefault()`, so it never submits a form.
- The closed trigger's typeahead reads the mounted options through `list_items`, which works while the positioner is `hidden`. With `unmountOnHide`, there are no options to read, so the closed typeahead does nothing.
- A closed but mounted positioner gets `hidden`. The controller removes it before `showPopover` and adds it after hide.
- `inside` also counts `outside_controls([content.id, list.id])`: an element whose `aria-controls` names the list is inside.
- A pointer anchor for `anchorRect` is a 0×0 `position: fixed` span (`np-SelectPoint`) in `body`, like the context menu.
- `SelectItem.useActive` (attached to `SelectItem`, so the module exports only components for Fast Refresh) subscribes to `subscribeActive`, which fires only when the active value changes. It is the one caller-facing subscription. No library part may call it. Only `SelectPopover` subscribes to the main snapshot.
- A MutationObserver on the list (`watchList`) runs `autoSelect` after the caller filters, clears an active option that left the DOM, and writes `aria-selected` on new options. `registerList`, `registerSearch`, and `setContent` call `watchList` again, because a caller can swap the list for a "No results" message and back.
- With no trigger, `applyOpen(true)` records the focused element, and `restoreFocus` gives focus back to it. `destroy` keeps the close reason only when the close was requested in the same task (`closeRequestedNow`, cleared by a zero timer), so an unmount right after Escape still restores focus, and a much later unmount after a refused close does not.

## Combobox

`src/combobox/combobox.tsx` has the regions `context`, `provider`, `label`, `input`, `popover`, `list`, `item`, `group`, `group label`, and `cancel`. `combobox.css` has `popover` and `item`. `src/combobox/combobox-controller.ts` (regions `items`, `show`, `keys`, `pointer`) shares the list core and the MutationObserver pattern with the select.

- `sync()` calls `showPopover()` without `source`. With `source`, the popup would come right after the input in the Tab order, and Tab would go into it instead of to the next element (a filter button).
- DOM focus always stays in the input. Enter with an active option is handled in the input's capture phase: `preventDefault()` and `click()` on the option. Enter while open always calls `preventDefault()`.
- The arrow keys loop through the input. On a closed input they open the list when `showOnKeyPress` is on.
- `showOnClick` opens on the press (main button, no Ctrl or Cmd), before the release.
- `ComboboxInPopoverContext` tells a `ComboboxList` whether it sits in a popover. An inline list with no popover keeps the combobox open.
- `handleListMouseDown` prevents focus moves out of the input, except from a `summary` inside the popup, so a details element there still toggles.
- `inside` counts `outside_controls` for the content, the list, and the input, so `ComboboxCancel` (its `aria-controls` names the input) is inside.
- Only `ComboboxPopover` subscribes.

## Out of scope

Do not implement `store`, a `virtualFocus` prop (menus, selects, and comboboxes always use virtual focus), `getAnchorRect`, `updatePosition`, `setValueOnMove`, `moveOnKeyDown`, or virtual refs. Do not measure the arrow position in JavaScript; keep it in CSS.

Do not copy Fluent's scroll measurement observer. Do not vendor the Fluent repo.

`portal` is accepted and ignored. The popover also accepts and ignores `portalElement`. The top layer is the hoist. `variant` stays in the app, not here.

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

Playwright starts Storybook on `http://127.0.0.1:6116`, and `e2e/warm-up.ts` loads one story of each file first. Without it, the first test of each worker can time out while Vite compiles after a source change, and a break proof then fails for the wrong reason. The iframe URL looks like `/iframe.html?id=tooltip--hover-delay&viewMode=story`.

When a behavior check is supposed to prove a close or a cancel, break that line on purpose once and watch that assertion fail. Then put it back.

The Storybook watcher on Windows can miss a `sed -i` write, and then Playwright runs the old module. A break proof then stays green for the wrong reason, and a later edit can leave the page throwing on stale imports. After a scripted edit, `touch` the file and check the served module (`curl http://127.0.0.1:6116/src/...`) before you trust a run.

A "stays closed" check must not use a retrying `toHaveCount(0)`: it also passes when a wrong tooltip opens and closes again later. Use `expectNoTip` in the spec, which counts once.

The library CSS is in `@layer native_popovers`. An app that orders its layers must list `native_popovers` after its reset layers and before its component layers. A reset listed after it wins, and Tailwind preflight's `margin: 0` then removes the gutter.

## References

Read `references/README.md` before copying behavior from a submodule. Import nothing from `references/` into `src/`.
