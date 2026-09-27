import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=hovercard--${id}&viewMode=story`);
	// Some stories render their widget only inside a closed dialog, so wait for any rendered child.
	await expect(page.locator("#storybook-root > *").first()).toBeAttached();
}

function button(page: Page, name: string | RegExp) {
	return page.getByRole("button", { name, exact: typeof name === "string" });
}

function card(page: Page, name: string) {
	return page.getByRole("dialog", { name, exact: true });
}

function anchor(page: Page, label: string) {
	return page.locator(".story-Hovercard-anchor", { hasText: label });
}

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("Element has no box");
	return value;
}

async function center(locator: Locator) {
	const value = await box(locator);
	return { x: value.x + value.width / 2, y: value.y + value.height / 2 };
}

/**
 * Stop the fake clock, so only `page.clock.runFor` moves time. Call `page.clock.install()` before
 * `openStory`. The pause jumps 1 s ahead, because the fake time keeps flowing until the pause lands.
 */
async function pauseClock(page: Page) {
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
}

/**
 * Record every popover show and hide in the page. `beforetoggle` fires once per change, so a close
 * followed by a reopen in one task still shows up.
 */
async function recordToggles(page: Page) {
	await page.evaluate(() => {
		const states: string[] = [];
		(window as unknown as { toggles: string[] }).toggles = states;
		document.addEventListener("beforetoggle", (event) => states.push((event as ToggleEvent).newState), true);
	});
}

async function toggles(page: Page) {
	return page.evaluate(() => (window as unknown as { toggles: string[] }).toggles);
}

/**
 * A spot on the page with nothing under it.
 */
const EMPTY = { x: 600, y: 600 };

async function hoverOpen(page: Page, label: string) {
	await page.mouse.move(EMPTY.x, EMPTY.y);
	const point = await center(anchor(page, label));
	await page.mouse.move(point.x, point.y, { steps: 3 });
	await expect(card(page, `${label} card`)).toBeVisible();
}

// #region hover
test("hover opens after the 500 ms default and a later move does not restart the timer", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "basic");
	await pauseClock(page);
	await page.mouse.move(EMPTY.x, EMPTY.y);
	const point = await center(anchor(page, "Ada"));
	await page.mouse.move(point.x, point.y, { steps: 2 });
	await page.clock.runFor(300);
	// A move 300 ms in must not start a new 500 ms wait.
	await page.mouse.move(point.x + 2, point.y);
	await page.clock.runFor(198);
	await expect(card(page, "Ada card")).toHaveCount(0);
	await page.clock.runFor(4);
	await expect(card(page, "Ada card")).toBeVisible();
});

test("leaving the anchor cancels a pending open", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "basic");
	await pauseClock(page);
	await page.mouse.move(EMPTY.x, EMPTY.y);
	const point = await center(anchor(page, "Ada"));
	await page.mouse.move(point.x, point.y, { steps: 2 });
	await page.clock.runFor(300);
	await page.mouse.move(EMPTY.x, EMPTY.y);
	await page.clock.runFor(600);
	await expect(card(page, "Ada card")).toHaveCount(0);
});

test("showTimeout 0 opens on the first move", async ({ page }) => {
	await openStory(page, "app-like");
	await hoverOpen(page, "1 online");
});

test("leaving closes after the 500 ms hide delay, and coming back cancels it", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "app-like");
	await pauseClock(page);
	await hoverOpen(page, "1 online");

	await page.mouse.move(EMPTY.x, EMPTY.y);
	await page.clock.runFor(499);
	await expect(card(page, "1 online card")).toBeVisible();
	await page.clock.runFor(2);
	await expect(card(page, "1 online card")).toHaveCount(0);

	await hoverOpen(page, "1 online");
	await page.mouse.move(EMPTY.x, EMPTY.y);
	await page.clock.runFor(300);
	const point = await center(anchor(page, "1 online"));
	await page.mouse.move(point.x, point.y, { steps: 2 });
	await page.clock.runFor(600);
	await expect(card(page, "1 online card")).toBeVisible();
});

test("the pointer can cross the gap into the card, and leaving the card closes it after the delay", async ({
	page,
}) => {
	await page.clock.install();
	await openStory(page, "app-like");
	await pauseClock(page);
	await hoverOpen(page, "1 online");
	const from = await center(anchor(page, "1 online"));
	const cardBox = await box(card(page, "1 online card"));
	// The gap is the 4 px gutter plus half the 30 px arrow.
	const anchorBox = await box(anchor(page, "1 online"));
	expect(Math.abs(cardBox.x - (anchorBox.x + anchorBox.width) - 19)).toBeLessThanOrEqual(0.5);

	// A straight move across the gap, many small steps, with time passing on the way.
	const to = { x: cardBox.x + 20, y: cardBox.y + 12 };
	for (let step = 1; step <= 10; step += 1) {
		await page.mouse.move(from.x + ((to.x - from.x) * step) / 10, from.y + ((to.y - from.y) * step) / 10);
		await page.clock.runFor(60);
	}
	await page.clock.runFor(1000);
	await expect(card(page, "1 online card")).toBeVisible();

	await page.mouse.move(EMPTY.x, EMPTY.y);
	await page.clock.runFor(499);
	await expect(card(page, "1 online card")).toBeVisible();
	await page.clock.runFor(2);
	await expect(card(page, "1 online card")).toHaveCount(0);
});

test("focus inside the card keeps it open after the pointer leaves", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "app-like");
	await pauseClock(page);
	await hoverOpen(page, "1 online");
	await button(page, "Disable").focus();
	await page.mouse.move(EMPTY.x, EMPTY.y);
	await page.clock.runFor(1000);
	await expect(card(page, "1 online card")).toBeVisible();
});

test("a touch never opens the card", async ({ browser, browserName }) => {
	test.skip(browserName !== "chromium", "Touch input goes through CDP, which only Chromium has");
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await openStory(page, "app-like");
	const { x, y } = await center(anchor(page, "1 online"));
	const cdp = await context.newCDPSession(page);
	await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	await page.waitForTimeout(300);
	await expect(card(page, "1 online card")).toHaveCount(0);
	await context.close();
});

test("Escape while hovered closes, and the resting pointer does not open it again until it leaves", async ({
	page,
}) => {
	await openStory(page, "app-like");
	await hoverOpen(page, "1 online");
	await page.keyboard.press("Escape");
	await expect(card(page, "1 online card")).toHaveCount(0);
	const point = await center(anchor(page, "1 online"));
	await page.mouse.move(point.x + 2, point.y + 1);
	await page.waitForTimeout(100);
	await expect(card(page, "1 online card")).toHaveCount(0);
	await hoverOpen(page, "1 online");
});
// #endregion hover

// #region keyboard
test("the anchor is not a tab stop; the disclosure is, and Enter opens the card with focus inside", async ({
	page,
}) => {
	await openStory(page, "app-like");
	const disclosure = button(page, "Show 1 online");
	await button(page, "Before").focus();
	await page.keyboard.press("Tab");
	await expect(disclosure).toBeFocused();
	await expect(disclosure).toHaveAttribute("aria-expanded", "false");
	await expect(disclosure).toHaveAttribute("aria-haspopup", "dialog");

	await page.keyboard.press("Enter");
	await expect(card(page, "1 online card")).toBeVisible();
	await expect(button(page, "Disable")).toBeFocused();
	await expect(disclosure).toHaveAttribute("aria-expanded", "true");
	await expect(disclosure).toHaveAttribute("aria-controls", (await card(page, "1 online card").getAttribute("id"))!);
});

test("a hover open leaves the disclosure collapsed and focus where it was", async ({ page }) => {
	await openStory(page, "app-like");
	await button(page, "Before").focus();
	await hoverOpen(page, "1 online");
	await expect(button(page, "Show 1 online")).toHaveAttribute("aria-expanded", "false");
	await expect(button(page, "Before")).toBeFocused();
});

test("Escape with focus inside closes the card and returns focus to the disclosure", async ({ page }) => {
	await openStory(page, "app-like");
	await button(page, "Show 1 online").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Disable")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(card(page, "1 online card")).toHaveCount(0);
	await expect(button(page, "Show 1 online")).toBeFocused();
});

test("a close from a button inside returns focus to the disclosure, not to the body", async ({ page }) => {
	await openStory(page, "controlled");
	await button(page, "Show Ada").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Done")).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(card(page, "Ada card")).toHaveCount(0);
	await expect(button(page, "Show Ada")).toBeFocused();
});

test("with nothing tabbable inside, the card itself takes focus", async ({ page }) => {
	await openStory(page, "no-tabbable");
	await button(page, "Show Info").click();
	await expect(card(page, "Info card")).toBeFocused();
});

test("Tab out of the card closes it", async ({ page }) => {
	await openStory(page, "app-like");
	await button(page, "Show 1 online").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Disable")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(card(page, "1 online card")).toHaveCount(0);
});

test("the disclosure toggles the card, and a click never closes and reopens it", async ({ page }) => {
	await openStory(page, "basic");
	await recordToggles(page);
	await button(page, "Show Ada").click();
	await expect(card(page, "Ada card")).toBeVisible();
	await button(page, "Show Ada").click();
	await expect(card(page, "Ada card")).toHaveCount(0);
	expect(await toggles(page)).toEqual(["open", "closed"]);
});
// #endregion keyboard

// #region outside
test("an outside click closes the card and does not move focus back", async ({ page, browserName }) => {
	await openStory(page, "app-like");
	await button(page, "Show 1 online").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Disable")).toBeFocused();
	await page.mouse.click(EMPTY.x, EMPTY.y);
	await expect(card(page, "1 online card")).toHaveCount(0);
	await expect(button(page, "Show 1 online")).not.toBeFocused();

	// The card opens to the right, over "After", so click the button on the other side.
	await button(page, "Show 1 online").focus();
	await page.keyboard.press("Enter");
	await button(page, "Before").click();
	await expect(card(page, "1 online card")).toHaveCount(0);
	await expect(button(page, "Show 1 online")).not.toBeFocused();
	// WebKit does not focus a button on click (README "Browser notes").
	if (browserName !== "webkit") await expect(button(page, "Before")).toBeFocused();

	// A press that keeps focus inside the card, like a toolbar button, must not move focus back either.
	await button(page, "Show 1 online").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Disable")).toBeFocused();
	await button(page, "No focus").click();
	await expect(card(page, "1 online card")).toHaveCount(0);
	await expect(button(page, "Show 1 online")).not.toBeFocused();
});

test("a right click outside closes the card", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Show Ada").click();
	await page.mouse.click(EMPTY.x, EMPTY.y, { button: "right" });
	await expect(card(page, "Ada card")).toHaveCount(0);
});
// #endregion outside

// #region controlled
test("a controlled parent can refuse a close, and setOpen still runs", async ({ page }) => {
	await openStory(page, "controlled");
	await page.getByRole("checkbox", { name: "Refuse close" }).check();
	await hoverOpen(page, "Ada");
	await page.keyboard.press("Escape");
	await page.waitForTimeout(100);
	await expect(card(page, "Ada card")).toBeVisible();
	await expect(page.getByTestId("requests")).toHaveText("open,closed");
});

test("StrictMode: one hover opens one card", async ({ page }) => {
	await openStory(page, "strict-hover");
	await recordToggles(page);
	await hoverOpen(page, "Ada");
	await page.waitForTimeout(100);
	expect(await toggles(page)).toEqual(["open"]);
});

test("StrictMode controlled open and close through setOpen", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await recordToggles(page);
	await button(page, "Show Ada").click();
	await expect(card(page, "Ada card")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(card(page, "Ada card")).toHaveCount(0);
	expect(await toggles(page)).toEqual(["open", "closed"]);
});
// #endregion controlled

// #region layers
test("a tooltip inside closes first on Escape, then the card", async ({ page }) => {
	await openStory(page, "tooltip-inside");
	await button(page, "Show Ada").focus();
	await page.keyboard.press("Enter");
	await expect(button(page, "Disable")).toBeFocused();
	// Focus arrived without the keyboard, so press a key to make the tooltip anchor keyboard-focused.
	await page.keyboard.press("Shift");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Shift+Tab");
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(card(page, "Ada card")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(card(page, "Ada card")).toHaveCount(0);
});

for (const story of ["in-dialog", "in-ariakit-dialog"]) {
	test(`inside a modal dialog (${story}), Escape closes the card first and the dialog stays`, async ({ page }) => {
		await openStory(page, story);
		await button(page, "Open dialog").click();
		const dialog = page.getByRole("dialog", { name: "Settings" });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Show Ada" }).click();
		await expect(card(page, "Ada card")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(card(page, "Ada card")).toHaveCount(0);
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
}
// #endregion layers

// #region placement
test("placement and gap match Ariakit's hovercard with its arrow", async ({ page }) => {
	await openStory(page, "ariakit-parity");
	for (const cell of await page.locator(".story-parity-cell").all()) {
		const placement = await cell.getAttribute("data-placement");
		const offsets: Record<string, { x: number; y: number; w: number }> = {};
		for (const kind of ["native", "ariakit"]) {
			const triggerBox = await box(cell.locator(`.story-parity-trigger[data-kind="${kind}"]`));
			const cardBox = await box(page.getByRole("dialog", { name: `${kind} ${placement}`, exact: true }));
			offsets[kind] = { x: cardBox.x - triggerBox.x, y: cardBox.y - triggerBox.y, w: cardBox.width };
		}
		expect(Math.abs(offsets.native!.x - offsets.ariakit!.x), `${placement} x`).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.y - offsets.ariakit!.y), `${placement} y`).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.w - offsets.ariakit!.w), `${placement} width`).toBeLessThanOrEqual(0.5);
	}
});

test("the card flips near a viewport edge", async ({ page }) => {
	await openStory(page, "flips");
	const anchorBox = await box(anchor(page, "Bottom edge"));
	const cardBox = await box(card(page, "Bottom edge card"));
	expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(anchorBox.y + 0.5);
});
// #endregion placement
