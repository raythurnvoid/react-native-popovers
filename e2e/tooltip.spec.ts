import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=tooltip--${id}&viewMode=story`);
	await expect(page.locator("#storybook-root").getByRole("button").first()).toBeVisible();
}

function tip(page: Page) {
	return page.getByRole("tooltip");
}

function button(page: Page, name: string | RegExp) {
	return page.getByRole("button", { name, exact: typeof name === "string" });
}

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("Element has no box");
	return value;
}

/**
 * Check that no tooltip is open right now. A retrying toHaveCount(0) would also pass when a
 * wrongly opened tooltip closes again later.
 */
async function expectNoTip(page: Page) {
	expect(await tip(page).count()).toBe(0);
}

async function focusByKeyboard(page: Page, before: string, key = "Tab") {
	await button(page, before).focus();
	await page.keyboard.press(key);
}

/**
 * Find the content edge the arrow sits on, its rotation, and its center point.
 */
async function arrowOf(content: Locator) {
	const contentBox = await box(content);
	const arrow = content.locator(".np-TooltipArrow");
	const arrowBox = await box(arrow);
	const x = arrowBox.x + arrowBox.width / 2;
	const y = arrowBox.y + arrowBox.height / 2;
	const rotate = await arrow.locator("svg").evaluate((node) => getComputedStyle(node).rotate);
	const edge =
		y > contentBox.y + contentBox.height
			? "below"
			: y < contentBox.y
				? "above"
				: x > contentBox.x + contentBox.width
					? "right"
					: x < contentBox.x
						? "left"
						: "inside";
	return { edge, rotate, x, y, box: arrowBox, content: contentBox };
}

// The arrow path points up. Each edge turns it to point away from the content.
const ARROW_ROTATE = { above: "0deg", below: "180deg", right: "90deg", left: "-90deg" };

function center(value: { x: number; y: number; width: number; height: number }) {
	return { x: value.x + value.width / 2, y: value.y + value.height / 2 };
}

/**
 * Where the arrow center should be: at the anchor center, but at least 4px padding plus half the
 * 16px arrow away from the tooltip corners.
 */
function aim(anchor: number, start: number, size: number) {
	return Math.min(Math.max(anchor, start + 4 + 8), start + size - 4 - 8);
}

// #region open and close
test("content stays unmounted until the tooltip opens", async ({ page }) => {
	await openStory(page, "hover-delay");
	await expect(page.locator(".np-TooltipPositioner")).toHaveCount(0);
	await expect(button(page, "Save")).not.toHaveAttribute("aria-describedby");
});

test("hover waits for the delay, then shows in the top layer", async ({ page }) => {
	await openStory(page, "hover-delay");
	await button(page, "Save").hover();
	await page.waitForTimeout(300);
	await expectNoTip(page);
	await expect(tip(page)).toBeVisible({ timeout: 700 });
	await expect(tip(page)).toHaveText("Save the file");
	await expect(page.locator(".np-TooltipPositioner")).toHaveJSProperty("popover", "manual");
	expect(await page.locator(".np-TooltipPositioner").evaluate((node) => node.matches(":popover-open"))).toBe(true);
	await expect(tip(page)).toHaveAttribute("tabindex", "-1");
	await expect(tip(page)).toHaveAttribute("data-open", "");
	await expect(tip(page)).toHaveAttribute("data-enter", "");
});

test("hide is immediate when the pointer leaves", async ({ page }) => {
	await openStory(page, "hover-delay");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await page.mouse.move(5, 5);
	await expect(tip(page)).toHaveCount(0, { timeout: 100 });
});

test("more pointer moves do not restart the delay", async ({ page }) => {
	await openStory(page, "hover-delay");
	const save = await box(button(page, "Save"));
	const started = Date.now();
	for (let step = 0; step < 8; step++) {
		await page.mouse.move(save.x + 4 + step, save.y + save.height / 2);
		await page.waitForTimeout(50);
	}
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	expect(Date.now() - started).toBeLessThan(800);
});

test("a parent render does not restart the delay", async ({ page }) => {
	await openStory(page, "rerender");
	const started = Date.now();
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	expect(Date.now() - started).toBeLessThan(800);
});

test("leave, pointerdown, scroll, and a key press cancel a pending show", async ({ page }) => {
	await openStory(page, "hover-delay");
	const save = button(page, "Save");

	await save.hover();
	await page.mouse.move(5, 5);
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await save.hover();
	await page.mouse.down();
	await page.waitForTimeout(700);
	await expectNoTip(page);
	await page.mouse.up();

	await page.mouse.move(5, 5);
	await save.hover();
	await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await page.mouse.move(5, 5);
	await save.hover();
	await page.keyboard.press("Shift");
	await page.waitForTimeout(700);
	await expectNoTip(page);
});

test("a press on the open trigger keeps the tooltip open", async ({ page }) => {
	await openStory(page, "hover-delay");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await button(page, "Save").click();
	await page.waitForTimeout(100);
	await expect(tip(page)).toBeVisible();
});

test("StrictMode hover opens one tooltip", async ({ page }) => {
	await openStory(page, "strict-hover");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await expect(page.locator(".np-TooltipPositioner")).toHaveCount(1);
	await page.mouse.move(5, 5);
	await expect(tip(page)).toHaveCount(0);
});
// #endregion open and close

// #region input types
test("a touch hold or tap never opens the tooltip", async ({ browser, browserName }) => {
	test.skip(browserName !== "chromium", "Touch input goes through CDP, which only Chromium has");
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await openStory(page, "hover-delay");
	// A finger that rests and moves on the anchor sends touch pointer moves. Those must not open it either.
	const save = await box(button(page, "Save"));
	const x = save.x + save.width / 2;
	const y = save.y + save.height / 2;
	const cdp = await context.newCDPSession(page);
	await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 3, y }] });
	await page.waitForTimeout(800);
	await expectNoTip(page);
	await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

	await button(page, "Save").tap();
	await page.waitForTimeout(800);
	await expectNoTip(page);
	await context.close();
});

test("a pen hover opens the tooltip", async ({ page, browserName }) => {
	test.skip(browserName !== "chromium", "Pen input goes through CDP, which only Chromium has");
	await openStory(page, "hover-delay");
	const save = await box(button(page, "Save"));
	const cdp = await page.context().newCDPSession(page);
	for (const offset of [0, 2]) {
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: save.x + save.width / 2 + offset,
			y: save.y + save.height / 2,
			pointerType: "pen",
		});
	}
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
});

test("keyboard focus opens at once, blur closes", async ({ page }) => {
	await openStory(page, "focus-open");
	await focusByKeyboard(page, "Before");
	await expect(button(page, "Save")).toBeFocused();
	await expect(tip(page)).toBeVisible({ timeout: 150 });

	await page.keyboard.press("Tab");
	await expect(tip(page)).toHaveCount(0);
});

test("a mouse press focuses without opening and does not block the next Tab", async ({ page }) => {
	await openStory(page, "focus-open");
	await button(page, "Save").click();
	await page.mouse.move(5, 5);
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Name")).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(button(page, "Save")).toBeFocused();
	await expect(tip(page)).toBeVisible({ timeout: 150 });
});

test("a key after a mouse focus opens the tooltip, a modifier does not", async ({ page }) => {
	await openStory(page, "focus-open");
	await button(page, "Save").click();
	await page.mouse.move(5, 5);
	await page.keyboard.press("Shift");
	await page.waitForTimeout(100);
	await expectNoTip(page);
	await page.keyboard.press("ArrowDown");
	await expect(tip(page)).toBeVisible({ timeout: 150 });
});
// #endregion input types

// #region escape
test("Escape closes, and the pointer stays blocked until it leaves and comes back", async ({ page }) => {
	await openStory(page, "hover-delay");
	const save = await box(button(page, "Save"));
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await page.keyboard.press("Escape");
	await expect(tip(page)).toHaveCount(0);

	await page.mouse.move(save.x + 3, save.y + 3);
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await page.mouse.move(5, 5);
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
});

test("Escape on keyboard focus stays closed until a new focus", async ({ page }) => {
	await openStory(page, "focus-open");
	await focusByKeyboard(page, "Before");
	await expect(tip(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tip(page)).toHaveCount(0);
	await page.keyboard.press("ArrowDown");
	await page.waitForTimeout(100);
	await expectNoTip(page);

	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Tab");
	await expect(tip(page)).toBeVisible({ timeout: 150 });
});

test("Escape closes only the tooltip inside a modal dialog", async ({ page }) => {
	await openStory(page, "in-dialog");
	await button(page, "Open dialog").click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });

	await page.keyboard.press("Escape");
	await expect(tip(page)).toHaveCount(0);
	await expect(dialog).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("Escape after a mouse focus: the next key does not reopen", async ({ page }) => {
	await openStory(page, "hover-delay");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await button(page, "Save").click();
	await page.keyboard.press("Escape");
	await expect(tip(page)).toHaveCount(0);
	await page.keyboard.press("ArrowDown");
	await page.waitForTimeout(100);
	await expectNoTip(page);
});

test("Escape with focus in the tooltip moves focus back to the anchor", async ({ page }) => {
	await openStory(page, "hoverable");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await tip(page).click();
	await expect(tip(page)).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(tip(page)).toHaveCount(0);
	await expect(button(page, "Save")).toBeFocused();
	await page.waitForTimeout(100);
	await expectNoTip(page);
});
// #endregion escape

// #region groups
test("one tooltip at a time, and moving to the next one skips the delay", async ({ page }) => {
	await openStory(page, "two-tips");
	await button(page, "Save").hover();
	await expect(tip(page)).toHaveText("Save the file", { timeout: 1000 });
	await button(page, "Share").hover();
	await expect(tip(page)).toHaveText("Share the file", { timeout: 150 });
	await expect(tip(page)).toHaveCount(1);
});

test("one tooltip with two anchors moves to the anchor under the pointer", async ({ page }) => {
	await openStory(page, "shared-anchors");
	await button(page, "First").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await button(page, "Second").hover();
	await page.waitForTimeout(100);
	const second = await box(button(page, "Second"));
	const content = await box(tip(page));
	expect(content.x + content.width / 2).toBeCloseTo(second.x + second.width / 2, 0);
});

test("a tooltip mounted open joins the group, so the next one asks it to close", async ({ page }) => {
	await openStory(page, "controlled-open");
	await button(page, "Share").hover();
	await expect(tip(page).filter({ hasText: "Share the file" })).toBeVisible({ timeout: 1000 });
	await expect(page.getByTestId("requests")).toHaveText("closed");
});

test("focus that leaves through a link in the tooltip counts as a blur", async ({ page, browserName }) => {
	await openStory(page, "interactive-content");
	await button(page, "Save").focus();
	await page.keyboard.press("ArrowDown");
	await expect(tip(page)).toBeVisible();
	// WebKit's Tab skips links by default, and Playwright has no Option+Tab there. Focus the link directly.
	// The Tab under test is the next one, which leaves the tooltip.
	if (browserName === "webkit") await page.getByRole("link", { name: "Docs" }).focus();
	else await page.keyboard.press("Tab");
	await expect(page.getByRole("link", { name: "Docs" })).toBeFocused();
	await expect(tip(page)).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(button(page, "After")).toBeFocused();
	await expect(tip(page)).toHaveCount(0);

	// A later hover tooltip must close on pointer leave, which a stale keyboard flag would stop.
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await page.mouse.move(5, 5);
	await expect(tip(page)).toHaveCount(0, { timeout: 200 });
});

test("the warm window skips the delay after a close, then expires", async ({ page }) => {
	await openStory(page, "two-tips");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	await button(page, "Plain").hover();
	await expect(tip(page)).toHaveCount(0);
	await button(page, "Share").hover();
	await expect(tip(page)).toHaveText("Share the file", { timeout: 150 });

	// The window is Ariakit's 300ms skipTimeout, not the 500ms show delay.
	await button(page, "Plain").hover();
	await page.waitForTimeout(400);
	await button(page, "Save").hover();
	await page.waitForTimeout(250);
	await expectNoTip(page);
	await expect(tip(page)).toBeVisible({ timeout: 700 });
});

test("a blur close does not start the warm window", async ({ page }) => {
	await openStory(page, "two-tips");
	await button(page, "Share").focus();
	await page.keyboard.press("Shift+Tab");
	await expect(tip(page)).toHaveText("Save the file");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await expect(button(page, "Plain")).toBeFocused();
	await expect(tip(page)).toHaveCount(0);

	await button(page, "Save").hover();
	await page.waitForTimeout(250);
	await expectNoTip(page);
});

test("a blur close blocks the resting pointer but not the next focus", async ({ page }) => {
	await openStory(page, "focus-open");
	await focusByKeyboard(page, "Before");
	await expect(tip(page)).toBeVisible();
	const save = await box(button(page, "Save"));
	await page.mouse.move(save.x + 4, save.y + 4);
	await page.keyboard.press("Tab");
	await expect(tip(page)).toHaveCount(0);

	await page.mouse.move(save.x + 6, save.y + 5);
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await page.keyboard.press("Shift+Tab");
	await expect(tip(page)).toBeVisible({ timeout: 150 });
});
// #endregion groups

// #region controlled
test("controlled false never opens, but setOpen still runs", async ({ page }) => {
	await openStory(page, "controlled-closed");
	await button(page, "Save").hover();
	await page.waitForTimeout(800);
	await expectNoTip(page);
	await expect(page.getByTestId("requests")).toHaveText("open");
});

test("controlled true stays open through outside clicks and Escape", async ({ page }) => {
	await openStory(page, "controlled-open");
	await expect(tip(page)).toBeVisible();
	await button(page, "Other").click();
	await expect(tip(page)).toBeVisible();
	// The press and the focus move are two close requests, and each one calls setOpen.
	await expect(page.getByTestId("requests")).toHaveText(/^closed(,closed)*$/);
	const before = (await page.getByTestId("requests").textContent())!.split(",").length;
	await page.keyboard.press("Escape");
	await expect(tip(page)).toBeVisible();
	await expect(page.getByTestId("requests")).toHaveText([...Array(before + 1)].map(() => "closed").join(","));
});

test("a controlled parent that follows setOpen closes and reopens", async ({ page }) => {
	await openStory(page, "controlled-dismiss");
	await expect(tip(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("state")).toHaveText("closed");
	await expect(tip(page)).toHaveCount(0);
	await button(page, "Reopen").click();
	await expect(tip(page)).toBeVisible();
});

test("switching between controlled and uncontrolled", async ({ page }) => {
	await openStory(page, "controlled-switch");
	await expect(tip(page)).toBeVisible();
	await page.getByLabel("Mode").selectOption("closed");
	await expect(tip(page)).toHaveCount(0);
	await page.getByLabel("Mode").selectOption("uncontrolled");
	await expect(tip(page)).toHaveCount(0);
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
});

test("a controlled close blocks the resting pointer until it leaves", async ({ page }) => {
	await openStory(page, "controlled-switch");
	const save = await box(button(page, "Save"));
	await page.mouse.move(save.x + 4, save.y + 4);
	await page.getByLabel("Mode").selectOption("closed");
	await expect(tip(page)).toHaveCount(0);
	await page.getByLabel("Mode").selectOption("uncontrolled");

	await page.mouse.move(save.x + 6, save.y + 5);
	await page.waitForTimeout(700);
	await expectNoTip(page);

	await page.mouse.move(5, 5);
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
});

test("StrictMode controlled open shows one tooltip", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await expect(tip(page)).toBeVisible();
	await expect(page.locator(".np-TooltipPositioner")).toHaveCount(1);
});
// #endregion controlled

// #region accessibility
test("an open tooltip leaves the anchor's own aria-describedby as it is", async ({ page }) => {
	// Like Ariakit. Many anchors already carry the tooltip text as their name or description, so
	// adding the tooltip id would make screen readers read the same text twice.
	await openStory(page, "described");
	await expect(tip(page)).toBeVisible();
	await expect(button(page, "Save")).toHaveAttribute("aria-describedby", "hint-a");
	await button(page, "Swap hint").click();
	await expect(button(page, "Save")).toHaveAttribute("aria-describedby", "hint-b");
});

test("a custom id goes to the content", async ({ page }) => {
	await openStory(page, "custom-id");
	await button(page, "Save").focus();
	await page.keyboard.press("ArrowDown");
	await expect(tip(page)).toHaveAttribute("id", "save-tip");
	await expect(button(page, "Save")).not.toHaveAttribute("aria-describedby");
});

test("a disabled anchor never opens", async ({ page }) => {
	await openStory(page, "disabled");
	await expect(button(page, "Delete")).toBeDisabled();
	await expect(button(page, "Delete")).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByText("Archived")).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByText("Archived")).not.toHaveAttribute("tabindex");
	await button(page, "Delete").hover({ force: true });
	await page.waitForTimeout(700);
	await page.getByText("Archived").hover();
	await page.waitForTimeout(700);
	await expectNoTip(page);
});

test("a disabled anchor is not a tab stop, even with a tabIndex prop", async ({ page }) => {
	await openStory(page, "disabled");
	// Like Ariakit: a tabIndex prop is dropped, and a link, which cannot be disabled, gets -1.
	await expect(page.getByText("Due", { exact: true })).not.toHaveAttribute("tabindex");
	await expect(page.getByRole("link", { name: "Docs" })).toHaveAttribute("tabindex", "-1");
	await expect(page.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-disabled", "true");
	await focusByKeyboard(page, "Before");
	await expect(button(page, "After")).toBeFocused();
	await page.getByText("Due", { exact: true }).hover();
	await page.waitForTimeout(700);
	await expectNoTip(page);
});

test("the added tabIndex follows disabled and focusable changes", async ({ page }) => {
	await openStory(page, "toggle-disabled");
	const label = page.getByText("Label");
	await expect(label).toHaveAttribute("tabindex", "0");
	await button(page, "Disable").click();
	await expect(label).not.toHaveAttribute("tabindex");
	await button(page, "Enable").click();
	await expect(label).toHaveAttribute("tabindex", "0");
	await button(page, "Not focusable").click();
	await expect(label).not.toHaveAttribute("tabindex");
	await button(page, "Focusable").click();
	await expect(label).toHaveAttribute("tabindex", "0");
});

test("focusable false: hover shows, Tab skips, focus does not show", async ({ page }) => {
	await openStory(page, "not-focusable");
	await expect(page.getByTestId("hit-area")).not.toHaveAttribute("tabindex");
	await page.getByTestId("hit-area").hover();
	await expect(tip(page)).toHaveText("Drag to move", { timeout: 1000 });
	await page.mouse.move(5, 5);

	await focusByKeyboard(page, "Before");
	await expect(button(page, "Pinned")).toBeFocused();
	await page.waitForTimeout(100);
	await expectNoTip(page);
});
// #endregion accessibility

// #region render
test("render forms: default div, merged element, and function", async ({ page }) => {
	await openStory(page, "render-forms");
	const wrapper = page.getByText("Default div");
	await expect(wrapper).toHaveAttribute("tabindex", "0");
	await expect(wrapper).toHaveJSProperty("tagName", "DIV");

	const element = button(page, "Element");
	await expect(element).toHaveClass("from-anchor from-element");
	await expect(element).toHaveCSS("padding-top", "4px");
	await expect(element).toHaveCSS("margin-top", "2px");
	await element.click();
	expect(await page.evaluate(() => [document.body.dataset.clicked, document.body.dataset.clickedElement])).toEqual([
		"anchor",
		"yes",
	]);

	await page.mouse.move(5, 5);
	await button(page, "Function").hover();
	await expect(tip(page)).toHaveText("Props passed to the function", { timeout: 1000 });
});

test("the anchor-name is added next to the anchor's own name and removed on close", async ({ page }) => {
	await openStory(page, "render-forms");
	const element = button(page, "Element");
	const anchorName = () => element.evaluate((node) => node.style.getPropertyValue("anchor-name"));
	expect(await anchorName()).toBe("--mine");
	await element.hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	expect(await anchorName()).toMatch(/^--mine, --np-tooltip-\d+$/);
	await page.mouse.move(5, 5);
	await expect(tip(page)).toHaveCount(0);
	expect(await anchorName()).toBe("--mine");
});

test("a new ref prop receives the node", async ({ page }) => {
	await openStory(page, "ref-swap");
	const refs = () => page.evaluate(() => [document.body.dataset.anchorRef, document.body.dataset.tooltipRef]);
	await expect(tip(page)).toBeVisible();
	expect(await refs()).toEqual(["a", "a"]);
	await button(page, "Swap ref").click();
	await expect.poll(refs).toEqual(["b", "b"]);
	await button(page, "Swap ref").click();
	await expect.poll(refs).toEqual(["a", "a"]);
});

test("unmountOnHide false keeps the content hidden in the DOM", async ({ page }) => {
	await openStory(page, "keep-mounted");
	const content = page.locator(".np-Tooltip");
	await expect(content).toHaveCount(1);
	await expect(content).toBeHidden();
	await button(page, "Save").hover();
	await expect(content).toBeVisible({ timeout: 1000 });
	await page.mouse.move(5, 5);
	await expect(content).toBeHidden();
	await expect(content).toHaveCount(1);
});

test("portal is ignored and the top layer escapes a clipping parent", async ({ page }) => {
	await openStory(page, "portal-ignored");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	const content = await box(tip(page));
	const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=tooltip]") !== null, {
		x: content.x + content.width / 2,
		y: content.y + content.height - 4,
	});
	expect(hit).toBe(true);
});
// #endregion render

// #region geometry
test("every placement sits on its side with the gutter and arrow gap", async ({ page }) => {
	await openStory(page, "placements");
	await page.getByLabel("Show all").check();
	const gap = 8 + 16 / 2;

	for (const placement of [
		"top",
		"bottom",
		"left",
		"right",
		"top-start",
		"top-end",
		"bottom-start",
		"bottom-end",
		"left-start",
		"left-end",
		"right-start",
		"right-end",
	]) {
		const anchor = await box(button(page, placement));
		const content = await box(page.getByRole("tooltip").filter({ hasText: new RegExp(`^${placement}$`) }));
		const [side, align = "center"] = placement.split("-");

		if (side === "top") expect(anchor.y - (content.y + content.height), placement).toBeCloseTo(gap, 0);
		if (side === "bottom") expect(content.y - (anchor.y + anchor.height), placement).toBeCloseTo(gap, 0);
		if (side === "left") expect(anchor.x - (content.x + content.width), placement).toBeCloseTo(gap, 0);
		if (side === "right") expect(content.x - (anchor.x + anchor.width), placement).toBeCloseTo(gap, 0);

		const vertical = side === "top" || side === "bottom";
		const [anchorStart, anchorSize, contentStart, contentSize] = vertical
			? [anchor.x, anchor.width, content.x, content.width]
			: [anchor.y, anchor.height, content.y, content.height];
		if (align === "start") expect(contentStart, placement).toBeCloseTo(anchorStart, 0);
		if (align === "end") expect(contentStart + contentSize, placement).toBeCloseTo(anchorStart + anchorSize, 0);
		if (align === "center")
			expect(contentStart + contentSize / 2, placement).toBeCloseTo(anchorStart + anchorSize / 2, 0);

		const content_side = await page
			.getByRole("tooltip")
			.filter({ hasText: new RegExp(`^${placement}$`) })
			.getAttribute("data-side");
		expect(content_side).toBe(side);

		const arrow = await arrowOf(page.getByRole("tooltip").filter({ hasText: new RegExp(`^${placement}$`) }));
		const edge = ({ top: "below", bottom: "above", left: "right", right: "left" } as const)[side as "top"];
		expect(arrow.edge, placement).toBe(edge);
		expect(arrow.rotate, placement).toBe(ARROW_ROTATE[edge]);
		if (vertical) expect(arrow.x, placement).toBeCloseTo(aim(center(anchor).x, content.x, content.width), 0);
		else expect(arrow.y, placement).toBeCloseTo(aim(center(anchor).y, content.y, content.height), 0);
	}
});

test("tooltips near the viewport edges flip and slide into view", async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await openStory(page, "flips");
	const viewport = page.viewportSize()!;

	// The RTL tooltips have their own test below.
	for (const content of await page.getByRole("tooltip").filter({ hasNotText: /^RTL/ }).all()) {
		const value = await box(content);
		const label = (await content.textContent()) ?? "";
		expect(value.x, label).toBeGreaterThanOrEqual(0);
		expect(value.y, label).toBeGreaterThanOrEqual(0);
		expect(value.x + value.width, label).toBeLessThanOrEqual(viewport.width);
		expect(value.y + value.height, label).toBeLessThanOrEqual(viewport.height);
	}

	const topLeft = await box(button(page, "Top left"));
	const topLeftTip = await box(page.getByRole("tooltip").filter({ hasText: "Flipped below" }));
	expect(topLeftTip.y).toBeGreaterThan(topLeft.y + topLeft.height);

	const topRight = await box(button(page, "Top right"));
	const topRightTip = await box(page.getByRole("tooltip").filter({ hasText: "Flipped to the left" }));
	expect(topRightTip.x + topRightTip.width).toBeLessThan(topRight.x);

	// data-side stays the requested side after a flip.
	await expect(page.getByRole("tooltip").filter({ hasText: "Flipped below" })).toHaveAttribute("data-side", "top");
});

test("RTL tooltips near the viewport edges flip into view", async ({ page, browserName }) => {
	test.skip(
		browserName === "firefox",
		"Firefox places RTL self-* position areas on the wrong side (README browser notes)",
	);
	await page.setViewportSize({ width: 800, height: 600 });
	await openStory(page, "flips");
	const viewport = page.viewportSize()!;

	for (const content of await page.getByRole("tooltip").filter({ hasText: /^RTL/ }).all()) {
		const value = await box(content);
		const label = (await content.textContent()) ?? "";
		expect(value.x, label).toBeGreaterThanOrEqual(0);
		expect(value.y, label).toBeGreaterThanOrEqual(0);
		expect(value.x + value.width, label).toBeLessThanOrEqual(viewport.width);
		expect(value.y + value.height, label).toBeLessThanOrEqual(viewport.height);
	}

	// The RTL top-start tooltip flipped inline, so it starts at the anchor's physical left edge.
	const rtlAnchor = await box(button(page, "RTL start"));
	const rtlTip = await box(page.getByRole("tooltip").filter({ hasText: "RTL start flipped" }));
	expect(rtlTip.x).toBeCloseTo(rtlAnchor.x, 0);
	expect(rtlTip.y + rtlTip.height).toBeLessThan(rtlAnchor.y);
});

test("after a flip or a slide, the arrow faces the anchor and points at its center", async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await openStory(page, "flips");
	// The README documents this limit: without anchored container queries the arrow stays on the requested side.
	test.skip(
		!(await page.evaluate(() => CSS.supports("container-type", "anchored"))),
		"The arrow follows a flip only with anchored container queries",
	);
	const cases = [
		{ label: "Top left", text: "Flipped below", edge: "above" },
		{ label: "Top right", text: "Flipped to the left", edge: "right" },
		{ label: "Bottom left", text: /^Flipped above$/, edge: "below" },
		{ label: "Bottom right", text: "Flipped above, end", edge: "below" },
		{ label: "RTL left edge", text: "RTL flipped", edge: "left" },
		{ label: "RTL start", text: "RTL start flipped", edge: "below" },
	] as const;

	for (const item of cases) {
		const anchor = center(await box(button(page, item.label)));
		const arrow = await arrowOf(page.getByRole("tooltip").filter({ hasText: item.text }));
		expect(arrow.edge, item.label).toBe(item.edge);
		expect(arrow.rotate, item.label).toBe(ARROW_ROTATE[item.edge]);
		if (item.edge === "left" || item.edge === "right") {
			expect(arrow.y, item.label).toBeCloseTo(aim(anchor.y, arrow.content.y, arrow.content.height), 0);
		} else {
			expect(arrow.x, item.label).toBeCloseTo(aim(anchor.x, arrow.content.x, arrow.content.width), 0);
		}
	}
});

test("RTL maps left and start to the inline direction, and the arrow follows", async ({ page, browserName }) => {
	test.skip(
		browserName === "firefox",
		"Firefox places RTL self-* position areas on the wrong side (README browser notes)",
	);
	await openStory(page, "rtl");
	const anchor = await box(button(page, "left"));
	const content = page.getByRole("tooltip").filter({ hasText: /^left$/ });
	const contentBox = await box(content);
	expect(contentBox.x).toBeGreaterThan(anchor.x + anchor.width);

	const arrow = await box(content.locator(".np-TooltipArrow"));
	// The arrow starts at the padding edge, so it covers the 1px border.
	expect(arrow.x + arrow.width).toBeCloseTo(contentBox.x + 1, 0);
	expect(await content.locator(".np-TooltipArrow svg").evaluate((node) => getComputedStyle(node).rotate)).toBe(
		"-90deg",
	);

	const startAnchor = await box(button(page, "top-start"));
	const startContent = await box(page.getByRole("tooltip").filter({ hasText: /^top-start$/ }));
	expect(startContent.x + startContent.width).toBeCloseTo(startAnchor.x + startAnchor.width, 0);
});

test("the arrow takes the tooltip colors, draws outside the content, and is not clipped", async ({ page }) => {
	await openStory(page, "arrows");
	const content = page.getByRole("tooltip").filter({ hasText: "Size 16" });
	const arrow = page.getByTestId("arrow-16");
	const colors = await content.evaluate((node) => {
		const style = getComputedStyle(node);
		return { fill: style.backgroundColor, stroke: style.borderTopColor };
	});
	await expect(arrow).toHaveCSS("fill", colors.fill);
	await expect(arrow).toHaveCSS("stroke", colors.stroke);
	await expect(arrow).toHaveCSS("stroke-width", `${3 * 2 * (30 / 16)}px`);

	const contentBox = await box(content);
	const arrowBox = await box(arrow);
	expect(arrowBox.width).toBe(16);
	expect(arrowBox.y + arrowBox.height).toBeCloseTo(contentBox.y + 3, 0);
	// The arrow ignores the pointer. Turn that off to hit-test its painted shape just outside the content.
	// A clipping positioner would make this point miss.
	await arrow.evaluate((node) => {
		node.style.pointerEvents = "auto";
	});
	const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".np-TooltipArrow") !== null, {
		x: arrowBox.x + arrowBox.width / 2,
		y: contentBox.y - 1,
	});
	expect(hit).toBe(true);

	await expect(page.getByTestId("arrow-light")).toHaveCSS("fill", "rgb(255, 244, 244)");
});

test("the arrow points at the anchor center and stays inside the tooltip box", async ({ page }) => {
	await openStory(page, "arrow-aim");
	const small = await arrowOf(page.getByRole("tooltip").filter({ hasText: "small anchor" }));
	expect(small.edge).toBe("above");
	expect(Math.abs(small.x - center(await box(button(page, "S"))).x)).toBeLessThan(1);

	// The wide anchor's center is past the short tooltip. The arrow stops 4px inside its end.
	const wide = await arrowOf(page.getByRole("tooltip").filter({ hasText: "Short" }));
	expect(wide.edge).toBe("below");
	expect(wide.box.x + wide.box.width).toBeCloseTo(wide.content.x + wide.content.width - 4, 0);
	expect(wide.x).toBeLessThan(center(await box(button(page, "Wide anchor"))).x);

	const side = await arrowOf(page.getByRole("tooltip").filter({ hasText: "A tall tooltip" }));
	expect(side.edge).toBe("left");
	expect(side.y).toBeCloseTo(aim(center(await box(button(page, "Side"))).y, side.content.y, side.content.height), 0);
});

test("one tooltip with two anchors points its arrow at the current anchor", async ({ page }) => {
	await openStory(page, "shared-anchors");
	await button(page, "First").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	expect(Math.abs((await arrowOf(tip(page))).x - center(await box(button(page, "First"))).x)).toBeLessThan(1);

	await button(page, "Second").hover();
	await expect
		.poll(async () => Math.abs((await arrowOf(tip(page))).x - center(await box(button(page, "Second"))).x))
		.toBeLessThan(1);
});

test("a ring box-shadow gives the arrow its stroke", async ({ page }) => {
	await openStory(page, "arrow-ring");
	const arrow = page.getByTestId("arrow-ring");
	await expect(arrow).toHaveAttribute("data-ring", "");
	await expect(arrow).toHaveCSS("stroke", "rgb(59, 130, 246)");
	await expect(arrow).toHaveCSS("stroke-width", `${2 * 2 * (30 / 16)}px`);
	await expect(arrow.locator(".np-TooltipArrow-underlay")).toBeHidden();
});

test("a transform on the content keeps the arrow centered on the requested side", async ({ page, browserName }) => {
	test.skip(
		browserName === "webkit",
		"WebKit still reads anchor() through a transformed parent (README browser notes)",
	);
	await openStory(page, "arrow-fallback");
	const arrow = await arrowOf(tip(page));
	expect(arrow.edge).toBe("below");
	expect(arrow.rotate).toBe("180deg");
	expect(Math.abs(arrow.x - center(arrow.content).x)).toBeLessThan(1);
});
// #endregion geometry

// #region pointer
test("the pointer can cross the gap into the tooltip and click its text", async ({ page }) => {
	await openStory(page, "hoverable");
	await button(page, "Save").hover();
	await expect(tip(page)).toBeVisible({ timeout: 1000 });
	const anchor = await box(button(page, "Save"));
	const content = await box(tip(page));
	await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
	await page.mouse.move(content.x + 20, content.y + content.height / 2, { steps: 12 });
	await page.waitForTimeout(100);
	await expect(tip(page)).toBeVisible();

	await tip(page).click();
	await page.waitForTimeout(100);
	await expect(tip(page)).toBeVisible();

	await page.mouse.click(5, 5);
	await expect(tip(page)).toHaveCount(0);
});

test("interactive={false} lets the pointer pass through, so leaving the anchor closes the tooltip", async ({
	page,
}) => {
	await openStory(page, "not-interactive");
	await button(page, "Row 1").hover();
	await expect(tip(page)).toBeVisible({ timeout: 500 });
	const anchor = await box(button(page, "Row 1"));
	const content = await box(tip(page));

	// The gap between the anchor and the tooltip belongs to the page, not to a gap strip.
	const gapHit = await page.evaluate(
		({ x, y }) => document.elementFromPoint(x, y)?.closest(".np-TooltipPositioner") !== null,
		{ x: content.x + content.width / 2, y: (anchor.y + anchor.height + content.y) / 2 },
	);
	expect(gapHit, "the gap strip caught the pointer").toBe(false);

	await page.mouse.move(content.x + content.width / 2, content.y + content.height / 2, { steps: 12 });
	await expect(tip(page)).toHaveCount(0);
});

test("showOnHover can skip hover while the anchor is in some state", async ({ page }) => {
	await openStory(page, "show-on-hover");
	await button(page, "Menu").hover();
	await expect(tip(page)).toBeVisible({ timeout: 500 });

	// The story's callback skips hover while aria-expanded is true, like a menu button with its menu open.
	await button(page, "Menu").click();
	await expect(button(page, "Menu")).toHaveAttribute("aria-expanded", "true");
	await page.mouse.move(5, 5);
	await expect(tip(page)).toHaveCount(0);
	await button(page, "Menu").hover();
	await page.waitForTimeout(300);
	await expectNoTip(page);

	await button(page, "Menu").click();
	await expect(button(page, "Menu")).toHaveAttribute("aria-expanded", "false");
	await page.mouse.move(5, 5);
	await button(page, "Menu").hover();
	await expect(tip(page)).toBeVisible({ timeout: 500 });
});

test("scrolling keeps the tooltip open and hides it while the anchor is out of view", async ({ page, browserName }) => {
	test.skip(
		browserName === "firefox",
		"Firefox does not apply position-visibility to a top-layer popover (README browser notes)",
	);
	await openStory(page, "scroll-container");
	// Use keyboard focus. A scroll under a resting pointer is a pointer leave, which closes a hover tooltip.
	await focusByKeyboard(page, "Item 2", "Shift+Tab");
	await expect(tip(page)).toHaveText("Item 1");
	await page.getByTestId("scroller").evaluate((node) => {
		node.scrollTop = 400;
	});
	await page.waitForTimeout(100);
	await expect(page.locator(".np-Tooltip")).toHaveCount(1);
	const content = await box(page.locator(".np-Tooltip"));
	const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".np-Tooltip") !== null, {
		x: content.x + content.width / 2,
		y: content.y + content.height / 2,
	});
	expect(hit).toBe(false);
});

test("many rows: only the open anchor gets an anchor-name", async ({ page }) => {
	await openStory(page, "many-rows");
	await expect(page.getByRole("button", { name: /^Row / })).toHaveCount(1000);
	await button(page, "Row 5").hover();
	await expect(tip(page)).toHaveText("Row 5", { timeout: 1000 });
	const named = await page.evaluate(
		() =>
			[...document.querySelectorAll<HTMLElement>(".story-rows-item")].filter((node) =>
				node.style.getPropertyValue("anchor-name"),
			).length,
	);
	expect(named).toBe(1);
});
// #endregion pointer
