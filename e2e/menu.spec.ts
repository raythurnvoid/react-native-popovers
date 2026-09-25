import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=menu--${id}&viewMode=story`);
	await expect(page.locator("#storybook-root").getByRole("button").first()).toBeVisible();
}

function button(page: Page, name: string | RegExp) {
	return page.getByRole("button", { name, exact: typeof name === "string" });
}

function menu(page: Page, name: string) {
	return page.getByRole("menu", { name, exact: true });
}

function item(page: Page, name: string | RegExp) {
	return page.getByRole("menuitem", { name, exact: typeof name === "string" });
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
 * The text of the active item of the focused menu, or null. It reads `aria-activedescendant` of the
 * focused element, so it also proves that DOM focus is on a menu.
 */
async function active(page: Page) {
	return page.evaluate(() => {
		const focused = document.activeElement;
		if (focused?.getAttribute("role") !== "menu") return `focus on ${focused?.tagName}`;
		const id = focused.getAttribute("aria-activedescendant");
		const item = id ? document.getElementById(id) : null;
		if (id && !item?.hasAttribute("data-active-item")) return "data-active-item missing";
		return item?.textContent?.trim() ?? null;
	});
}

/**
 * Stop the fake clock, so only `page.clock.runFor` moves time. Call `page.clock.install()` before
 * `openStory`. Without the pause, real time also flows and a timing check passes or fails by luck.
 * The pause jumps 1 s ahead, because the fake time keeps flowing until the pause lands.
 */
async function pauseClock(page: Page) {
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
}

async function log(page: Page) {
	return (await page.getByTestId("log").textContent()) ?? "";
}

/**
 * Record every popover show and hide in the page. `beforetoggle` fires once per change and is not
 * merged like `toggle`, so a close followed by a reopen in one task still shows up.
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

// #region roles
test("button, menu, and items get the WAI-ARIA menu roles and states", async ({ page }) => {
	await openStory(page, "basic");
	const trigger = button(page, "Actions");
	await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
	await expect(trigger).toHaveAttribute("aria-expanded", "false");
	await expect(trigger).toHaveAttribute("type", "button");

	await trigger.click();
	const content = menu(page, "Actions");
	await expect(content).toBeVisible();
	await expect(trigger).toHaveAttribute("aria-expanded", "true");
	await expect(trigger).toHaveAttribute("aria-controls", (await content.getAttribute("id"))!);
	await expect(content).toHaveAttribute("aria-labelledby", (await trigger.getAttribute("id"))!);
	await expect(content).toHaveAttribute("aria-orientation", "vertical");
	await expect(content).toHaveAttribute("tabindex", "-1");

	const cut = item(page, "Cut");
	await expect(cut).toHaveAttribute("tabindex", "-1");
	await expect(cut).not.toHaveAttribute("aria-selected");
	await expect(item(page, "Paste into root folder")).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("menuitem")).toHaveCount(7);
});

test("aria-controls points at the menu only while it is mounted", async ({ page }) => {
	await openStory(page, "strict-controlled");
	const trigger = button(page, "Jobs");
	await expect(trigger).not.toHaveAttribute("aria-controls");
	await trigger.click();
	await expect(trigger).toHaveAttribute("aria-controls", (await menu(page, "Jobs").getAttribute("id"))!);
	await page.keyboard.press("Escape");
	await expect(menu(page, "Jobs")).toHaveCount(0);
	await expect(trigger).not.toHaveAttribute("aria-controls");
});

test("a group is named by its label; a label outside a group is only hidden text", async ({ page }) => {
	await openStory(page, "groups");
	await button(page, "Block").click();
	const group = page.getByRole("group", { name: "Edit" });
	await expect(group).toBeVisible();
	await expect(page.locator(".story-MenuLabel", { hasText: "Edit" })).toHaveAttribute("aria-hidden", "true");
	await expect(page.locator(".story-MenuLabel", { hasText: "Actions" })).toHaveAttribute("aria-hidden", "true");
	await expect(page.getByRole("group")).toHaveCount(2);
});
// #endregion roles

// #region open and close
test("a mouse click opens with focus on the menu and no active item", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await expect(menu(page, "Actions")).toBeFocused();
	expect(await active(page)).toBeNull();
});

for (const [key, expected] of [
	["Enter", "Upload file"],
	[" ", "Upload file"],
	["ArrowDown", "Upload file"],
	["ArrowUp", "Show archived items"],
] as const) {
	test(`${key === " " ? "Space" : key} on the button opens with "${expected}" active`, async ({ page }) => {
		await openStory(page, "basic");
		await button(page, "Actions").focus();
		await page.keyboard.press(key === " " ? "Space" : key);
		await expect(menu(page, "Actions")).toBeFocused();
		expect(await active(page)).toBe(expected);
	});
}

test("the button click never closes and reopens: one open, one close", async ({ page }) => {
	await openStory(page, "basic");
	await recordToggles(page);
	await button(page, "Actions").click();
	await expect(menu(page, "Actions")).toBeVisible();
	await button(page, "Actions").click();
	await expect(menu(page, "Actions")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
	await expect(button(page, "Actions")).toBeFocused();
});

test("Escape closes and moves focus back to the button", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await page.keyboard.press("Escape");
	await expect(menu(page, "Actions")).toBeHidden();
	await expect(button(page, "Actions")).toBeFocused();
	expect(await log(page)).toBe("open,closed");
});

test("an outside click closes, and the clicked element keeps focus", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await page.getByRole("textbox", { name: "Before input" }).click();
	await expect(menu(page, "Actions")).toBeHidden();
	await expect(page.getByRole("textbox", { name: "Before input" })).toBeFocused();
});

test("an outside click on a spot that cannot take focus closes without moving focus to the button", async ({
	page,
}) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await expect(menu(page, "Actions")).toBeFocused();
	const viewport = page.viewportSize()!;
	await page.mouse.click(10, viewport.height - 10);
	await expect(menu(page, "Actions")).toBeHidden();
	await expect(button(page, "Actions")).not.toBeFocused();
});

test("Tab closes, and focus lands after the button", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await page.keyboard.press("Tab");
	await expect(menu(page, "Actions")).toBeHidden();
	await expect(button(page, "After")).toBeFocused();
});

test("Shift+Tab goes to the button and keeps the menu open", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await page.keyboard.press("Shift+Tab");
	await expect(button(page, "Actions")).toBeFocused();
	await expect(menu(page, "Actions")).toBeVisible();

	// An arrow key on the button goes back into the open menu.
	await page.keyboard.press("ArrowDown");
	await expect(menu(page, "Actions")).toBeFocused();
	expect(await active(page)).toBe("Upload file");
});

test("Tab leaves a menu with a scroll area, which is not a Tab stop", async ({ page }) => {
	await openStory(page, "long-list");
	await button(page, "Colors").click();
	await page.keyboard.press("Tab");
	await expect(menu(page, "Colors")).toBeHidden();
	await expect(button(page, "After")).toBeFocused();
});

test("a disabled button never opens", async ({ page }) => {
	await openStory(page, "disabled-trigger");
	const trigger = button(page, "More actions");
	const point = await center(trigger);
	await page.mouse.click(point.x, point.y);
	await page.waitForTimeout(100);
	await expect(trigger).toHaveAttribute("aria-expanded", "false");
	expect(await page.getByRole("menu").count()).toBe(0);
});
// #endregion open and close

// #region keys
test("arrows, Home, End, and PageDown move the active item, skip disabled items, and do not loop", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	const steps: Array<[string, string]> = [
		["ArrowDown", "Upload file"],
		["ArrowDown", "Cut"],
		["ArrowDown", "Copy"],
		// "Paste into root folder" is disabled.
		["ArrowDown", "Éclair recipe"],
		["End", "Show archived items"],
		["ArrowDown", "Show archived items"],
		["Home", "Upload file"],
		["ArrowUp", "Upload file"],
		["PageDown", "Show archived items"],
		["PageUp", "Upload file"],
	];
	for (const [key, expected] of steps) {
		await page.keyboard.press(key);
		expect(await active(page), `after ${key}`).toBe(expected);
	}
});

test("typeahead: the same letter cycles and wraps, more letters narrow, accents match, disabled never matches", async ({
	page,
}) => {
	await page.clock.install();
	await openStory(page, "basic");
	await pauseClock(page);
	await button(page, "Actions").click();

	await page.keyboard.press("c");
	expect(await active(page)).toBe("Cut");
	await page.keyboard.press("c");
	expect(await active(page)).toBe("Copy");
	await page.keyboard.press("c");
	expect(await active(page)).toBe("Cut");

	// "p" only matches the disabled "Paste into root folder": the active item stays.
	await page.clock.runFor(501);
	await page.keyboard.press("p");
	expect(await active(page)).toBe("Cut");

	await page.clock.runFor(501);
	await page.keyboard.type("sh");
	expect(await active(page)).toBe("Show archived items");

	await page.clock.runFor(501);
	await page.keyboard.press("e");
	expect(await active(page)).toBe("Éclair recipe");
});

test("typeahead: the search resets after 500 ms", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "basic");
	await pauseClock(page);
	await button(page, "Actions").click();
	await page.keyboard.press("u");
	expect(await active(page)).toBe("Upload file");

	// Within 500 ms, "c" joins the search ("uc"), which matches nothing.
	await page.clock.runFor(499);
	await page.keyboard.press("c");
	expect(await active(page)).toBe("Upload file");

	await page.clock.runFor(501);
	await page.keyboard.press("c");
	expect(await active(page)).toBe("Cut");
});

test("Space inside a running search is a character, not a click", async ({ page }) => {
	await page.clock.install();
	await openStory(page, "basic");
	await pauseClock(page);
	await button(page, "Actions").click();
	await page.keyboard.type("show a");
	expect(await active(page)).toBe("Show archived items");
	await expect(menu(page, "Actions")).toBeVisible();
	expect(await log(page)).toBe("open");
});
test("keys in a long menu never scroll the page", async ({ page }) => {
	await openStory(page, "long-list");
	// A tall page, so a key default or a scrollIntoView that goes past the menu would move it.
	await page.evaluate(() => (document.body.style.minHeight = "3000px"));
	// The click scrolls the page to the centered button first.
	await button(page, "Colors").click();
	const scrollY = await page.evaluate(() => window.scrollY);
	expect(scrollY).toBeGreaterThan(0);
	for (const key of ["ArrowDown", "PageDown", "End", "PageUp", "ArrowUp", "Home", "Space"]) {
		await page.keyboard.press(key);
		expect(await page.evaluate(() => window.scrollY), key).toBe(scrollY);
	}
});
// #endregion keys

// #region items
for (const how of ["click", "Enter", "Space"] as const) {
	test(`${how} runs the item, closes, and focuses the button`, async ({ page }) => {
		await openStory(page, "basic");
		await button(page, "Actions").click();
		if (how === "click") {
			await item(page, "Cut").click();
		} else {
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press("ArrowDown");
			await page.keyboard.press(how);
		}
		await expect(menu(page, "Actions")).toBeHidden();
		await expect(button(page, "Actions")).toBeFocused();
		expect(await log(page)).toBe("open,Cut,closed");
	});
}

test("hideOnClick false runs the item and keeps the menu open", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await item(page, "Keep open").click();
	await expect(menu(page, "Actions")).toBeVisible();
	await expect(menu(page, "Actions")).toBeFocused();
	expect(await log(page)).toBe("open,Keep open");
});

test("a disabled item ignores clicks and hover", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	await item(page, "Paste into root folder").click({ force: true });
	await item(page, "Paste into root folder").dispatchEvent("click");
	await expect(menu(page, "Actions")).toBeVisible();
	expect(await log(page)).toBe("open");

	await item(page, "Paste into root folder").hover({ force: true });
	expect(await active(page)).toBeNull();
});

test("a checkbox item toggles aria-checked and stays open, by click and by Enter", async ({ page }) => {
	await openStory(page, "checkbox");
	await button(page, "More options").click();
	const checkbox = page.getByRole("menuitemcheckbox", { name: "Show archived items" });
	await expect(checkbox).toHaveAttribute("aria-checked", "false");
	await checkbox.click();
	await expect(checkbox).toHaveAttribute("aria-checked", "true");
	await expect(menu(page, "More options")).toBeVisible();

	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect(checkbox).toHaveAttribute("aria-checked", "false");
	await expect(menu(page, "More options")).toBeFocused();
});

test("a link item keeps role menuitem, even disabled, and a click follows it and closes", async ({ page }) => {
	await openStory(page, "link-item");
	await button(page, "Chat").click();
	await expect(item(page, "Open archived chat")).toHaveAttribute("aria-disabled", "true");
	await expect(item(page, "Open archived chat")).not.toHaveAttribute("disabled");
	await item(page, "Open chat").click();
	await expect(menu(page, "Chat")).toBeHidden();
	expect(new URL(page.url()).hash).toBe("#linked");
});

test("a modifier click on a link item keeps the menu open", async ({ page, browserName }) => {
	await openStory(page, "link-item");
	await button(page, "Chat").click();
	// Stop the navigation, so this checks only the menu.
	await page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault()));
	const modifier = browserName === "webkit" ? "Meta" : "Control";
	await item(page, "Open chat").click({ modifiers: [modifier] });
	await expect(menu(page, "Chat")).toBeVisible();
});
// #endregion items

// #region pointer
test("hover moves the active item; leaving the menu clears it", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Actions").click();
	const copy = await center(item(page, "Copy"));
	await page.mouse.move(copy.x, copy.y, { steps: 4 });
	expect(await active(page)).toBe("Copy");
	await page.mouse.move(copy.x, copy.y + 300, { steps: 4 });
	expect(await active(page)).toBeNull();
});

test("hover does not scroll the menu; a key does", async ({ page }) => {
	await openStory(page, "long-list");
	await button(page, "Colors").click();
	const scroller = page.locator(".story-scroll");
	const last = await box(item(page, "Color 5"));
	await page.mouse.move(last.x + 10, last.y + last.height - 2, { steps: 4 });
	expect(await scroller.evaluate((node) => node.scrollTop)).toBe(0);

	await page.keyboard.press("End");
	expect(await active(page)).toBe("Color 30");
	expect(await scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("a press on the menu padding keeps focus on the menu and the menu open", async ({ page }) => {
	await openStory(page, "long-list");
	await button(page, "Colors").click();
	// The left padding at mid height. A corner would be outside the rounded border.
	const content = await box(menu(page, "Colors"));
	await page.mouse.click(content.x + 2, content.y + content.height / 2);
	await expect(menu(page, "Colors")).toBeFocused();

	// The pointer on the padding cleared the active item, like Ariakit. The keys still work.
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Color 1");
});
test("a pressed item matches :active, so a pressed style shows", async ({ page }) => {
	// The menu prevents mousedown to keep focus on the menu. Some browsers then drop :active.
	await openStory(page, "basic");
	await button(page, "Actions").click();
	const point = await center(item(page, "Cut"));
	await page.mouse.move(point.x, point.y, { steps: 3 });
	await page.mouse.down();
	expect(await item(page, "Cut").evaluate((node) => node.matches(":active"))).toBe(true);
	await page.mouse.up();
});

test("a touch never hovers: a finger that rests on an item does not make it active or open its submenu", async ({
	browser,
	browserName,
}) => {
	test.skip(browserName !== "chromium", "Touch input goes through CDP, which only Chromium has");
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await openStory(page, "submenu");
	await button(page, "Block menu").tap();
	await expect(menu(page, "Block menu")).toBeFocused();

	// A finger that rests and moves on an item sends touch pointer moves.
	const { x, y } = await center(item(page, "Turn into ›"));
	const cdp = await context.newCDPSession(page);
	await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2, y }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 3, y }] });
	await page.waitForTimeout(400);
	expect(await active(page)).toBeNull();
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });

	// A tap is a click: it opens the submenu at once.
	await item(page, "Color ›").tap();
	await expect(menu(page, "Color ›")).toBeVisible();
	await context.close();
});
// #endregion pointer

// #region controlled
test("StrictMode controlled open and close through setOpen", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await recordToggles(page);
	await button(page, "Jobs").click();
	await expect(menu(page, "Jobs")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(menu(page, "Jobs")).toHaveCount(0);
	await expect(button(page, "Jobs")).toBeFocused();
	expect(await log(page)).toBe("open,closed");
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("StrictMode controlled open from the parent state", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await button(page, "Toggle from outside").click();
	await expect(menu(page, "Jobs")).toBeVisible();
	await expect(button(page, "Jobs")).toHaveAttribute("aria-expanded", "true");
	// The parent opened it, so setOpen never ran.
	expect(await log(page)).toBe("");
});
// #endregion controlled

// #region submenus
/**
 * Open the block menu with a click. Its button sits at the left, so the submenus open to the right.
 */
async function openBlockMenu(page: Page, story = "submenu") {
	await openStory(page, story);
	await button(page, "Block menu").click();
	await expect(menu(page, "Block menu")).toBeFocused();
}

async function pressAll(page: Page, keys: string[]) {
	for (const key of keys) await page.keyboard.press(key);
}

/**
 * Remember every item that ever gets `data-active-item`, so a test can prove an item was never active.
 */
async function recordActive(page: Page) {
	await page.evaluate(() => {
		const names: string[] = [];
		(window as unknown as { activated: string[] }).activated = names;
		new MutationObserver((records) => {
			for (const record of records) {
				const target = record.target as HTMLElement;
				if (target.hasAttribute("data-active-item")) names.push(target.textContent?.trim() ?? "");
			}
		}).observe(document.body, { attributes: true, attributeFilter: ["data-active-item"], subtree: true });
	});
}

async function activated(page: Page) {
	return page.evaluate(() => (window as unknown as { activated: string[] }).activated);
}

/**
 * Hover an item and let the 150 ms hover delay pass on the paused fake clock.
 */
async function hoverOpen(page: Page, name: string) {
	const point = await center(item(page, name));
	await page.mouse.move(point.x, point.y, { steps: 4 });
	await page.clock.runFor(151);
	await expect(menu(page, name)).toBeVisible();
}

test("ArrowRight and Enter open a submenu with its first item active; ArrowLeft closes it", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown"]);
	expect(await active(page)).toBe("Turn into ›");

	await page.keyboard.press("ArrowRight");
	await expect(menu(page, "Turn into ›")).toBeFocused();
	expect(await active(page)).toBe("Text");
	await expect(item(page, "Turn into ›")).toHaveAttribute("aria-expanded", "true");
	await expect(item(page, "Turn into ›")).toHaveAttribute("aria-haspopup", "menu");
	// The parent keeps its item active while the submenu is open.
	await expect(item(page, "Turn into ›")).toHaveAttribute("data-active-item", "");

	await page.keyboard.press("ArrowLeft");
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeFocused();
	expect(await active(page)).toBe("Turn into ›");

	await page.keyboard.press("Enter");
	await expect(menu(page, "Turn into ›")).toBeFocused();
	expect(await active(page)).toBe("Text");
});

test("Escape closes one level and returns focus to the parent item, then to the button", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "End", "ArrowRight"]);
	await expect(menu(page, "More ›")).toBeFocused();

	await page.keyboard.press("Escape");
	await expect(menu(page, "More ›")).toBeHidden();
	await expect(menu(page, "Color ›")).toBeFocused();
	expect(await active(page)).toBe("More ›");

	await page.keyboard.press("Escape");
	await expect(menu(page, "Color ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeFocused();
	expect(await active(page)).toBe("Color ›");

	await page.keyboard.press("Escape");
	await expect(menu(page, "Block menu")).toBeHidden();
	await expect(button(page, "Block menu")).toBeFocused();
});

test("a level has one open submenu: opening another closes the first", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowRight"]);
	await expect(menu(page, "Color ›")).toBeFocused();
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(item(page, "Turn into ›")).toHaveAttribute("aria-expanded", "false");
});

test("RTL: ArrowLeft opens a submenu, ArrowRight closes it", async ({ page }) => {
	await openBlockMenu(page, "submenu-rtl");
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown"]);

	// ArrowRight is the close key in RTL, so it does not open.
	await page.keyboard.press("ArrowRight");
	await expect(menu(page, "Turn into ›")).toBeHidden();

	await page.keyboard.press("ArrowLeft");
	await expect(menu(page, "Turn into ›")).toBeFocused();

	await page.keyboard.press("ArrowRight");
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeFocused();
});

test("RTL: a right-start menu and its submenu open on the left, with the same gutter and shift", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName === "firefox",
		"Firefox places RTL self-* position areas on the wrong side (README browser notes)",
	);
	await openBlockMenu(page, "submenu-rtl");
	const trigger = await box(button(page, "Block menu"));
	const root = await box(menu(page, "Block menu"));
	// right is the inline end, so in RTL the menu opens on the left of the button, top edges aligned.
	expect(Math.abs(root.x + root.width - trigger.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(root.y - trigger.y)).toBeLessThanOrEqual(0.5);

	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowLeft"]);
	const parent = await box(item(page, "Turn into ›"));
	const submenu = await box(menu(page, "Turn into ›"));
	expect(Math.abs(parent.x - (submenu.x + submenu.width) - 8)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(submenu.y - parent.y + 5)).toBeLessThanOrEqual(0.5);
});

test("a submenu opens beside its item with gutter 8 and shift -5", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]);
	const trigger = await box(item(page, "Turn into ›"));
	const submenu = await box(menu(page, "Turn into ›"));
	expect(Math.abs(submenu.x - (trigger.x + trigger.width) - 8)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(submenu.y - trigger.y + 5)).toBeLessThanOrEqual(0.5);
});

test("hover opens a submenu after 150 ms and leaves focus in the parent", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	const point = await center(item(page, "Turn into ›"));
	await page.mouse.move(point.x, point.y, { steps: 4 });
	await page.clock.runFor(149);
	await expect(menu(page, "Turn into ›")).toBeHidden();

	// More moves on the same item do not restart the delay.
	await page.mouse.move(point.x + 3, point.y, { steps: 2 });
	await page.clock.runFor(2);
	await expect(menu(page, "Turn into ›")).toBeVisible();
	await expect(menu(page, "Block menu")).toBeFocused();
	expect(await active(page)).toBe("Turn into ›");
});

test("after a hover open, ArrowRight moves focus into the submenu with its first item active", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Turn into ›");
	await page.keyboard.press("ArrowRight");
	await expect(menu(page, "Turn into ›")).toBeFocused();
	expect(await active(page)).toBe("Text");
});

test("hovering a submenu item moves focus into the submenu, so Enter runs that item", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Color ›");
	const trigger = await box(item(page, "Color ›"));
	// Straight right, across the gap, onto the first color.
	await page.mouse.move(trigger.x + trigger.width + 40, trigger.y + trigger.height / 2, { steps: 6 });
	await expect(menu(page, "Color ›")).toBeFocused();
	expect(await active(page)).toBe("Default");
	await page.keyboard.press("Enter");
	expect(await log(page)).toBe("Default");
	await expect(menu(page, "Color ›")).toBeVisible();
});

test("a diagonal move across other items toward the submenu keeps it open", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Color ›");
	await recordActive(page);

	const trigger = await box(item(page, "Color ›"));
	const submenu = await box(menu(page, "Color ›"));
	const start = { x: trigger.x + trigger.width - 10, y: trigger.y + trigger.height / 2 };
	const end = { x: submenu.x + 20, y: submenu.y + submenu.height - 20 };
	const steps = 20;

	// Prove the path really crosses another item of the parent menu.
	const crossed = await page.evaluate(
		({ start, end, steps }) => {
			const names = new Set<string>();
			for (let step = 1; step <= steps; step += 1) {
				const x = start.x + ((end.x - start.x) * step) / steps;
				const y = start.y + ((end.y - start.y) * step) / steps;
				const hit = document.elementFromPoint(x, y)?.closest('[role="menuitem"]');
				if (hit) names.add(hit.textContent?.trim() ?? "");
			}
			return [...names];
		},
		{ start, end, steps },
	);
	expect(crossed).toContain("Copy link");

	await page.mouse.move(start.x, start.y);
	await page.mouse.move(end.x, end.y, { steps });
	await expect(menu(page, "Color ›")).toBeVisible();
	expect(await activated(page)).not.toContain("Copy link");
	await expect(item(page, "Color ›")).toHaveAttribute("data-active-item", "");
	// The pointer landed on a color, so the submenu has focus.
	await expect(menu(page, "Color ›")).toBeFocused();
});

test("a flipped submenu: the grace area follows it up, and a crossed submenu item never opens", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page, "submenu-flipped");
	await pauseClock(page);
	await hoverOpen(page, "Color ›");
	await recordActive(page);

	const trigger = await box(item(page, "Color ›"));
	const submenu = await box(menu(page, "Color ›"));
	// Flipped up: the bottom edges line up, and the -5 shift mirrors to +5.
	expect(Math.abs(submenu.y + submenu.height - (trigger.y + trigger.height) - 5)).toBeLessThanOrEqual(0.5);

	const start = { x: trigger.x + trigger.width - 10, y: trigger.y + trigger.height / 2 };
	const end = { x: submenu.x + 20, y: submenu.y + 20 };
	const steps = 20;
	const crossed = await page.evaluate(
		({ start, end, steps }) => {
			const names = new Set<string>();
			for (let step = 1; step <= steps; step += 1) {
				const x = start.x + ((end.x - start.x) * step) / steps;
				const y = start.y + ((end.y - start.y) * step) / steps;
				const hit = document.elementFromPoint(x, y)?.closest('[role="menuitem"]');
				if (hit) names.add(hit.textContent?.trim() ?? "");
			}
			return [...names];
		},
		{ start, end, steps },
	);
	expect(crossed).toContain("Turn into ›");

	await page.mouse.move(start.x, start.y);
	await page.mouse.move(end.x, end.y, { steps });
	await page.clock.runFor(200);
	await expect(menu(page, "Color ›")).toBeVisible();
	await expect(menu(page, "Turn into ›")).toBeHidden();
	expect(await activated(page)).not.toContain("Turn into ›");
});

test("a straight move to another item closes the submenu", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Color ›");
	const next = await center(item(page, "Copy link"));
	await page.mouse.move(next.x, next.y, { steps: 4 });
	await expect(menu(page, "Color ›")).toBeHidden();
	expect(await active(page)).toBe("Copy link");
});

test("the grace area ends after 300 ms: the next move onto another item closes the submenu", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Color ›");
	const trigger = await box(item(page, "Color ›"));
	const copyLink = await box(item(page, "Copy link"));
	// Down and right, onto "Copy link" near its right edge, inside the grace area.
	const stop = { x: trigger.x + trigger.width - 4, y: copyLink.y + copyLink.height / 2 };
	await page.mouse.move(trigger.x + trigger.width - 12, trigger.y + trigger.height / 2);
	await page.mouse.move(stop.x, stop.y, { steps: 6 });
	await expect(menu(page, "Color ›")).toBeVisible();

	await page.clock.runFor(301);
	await page.mouse.move(stop.x + 1, stop.y);
	await expect(menu(page, "Color ›")).toBeHidden();
	expect(await active(page)).toBe("Copy link");
});

test("moving the pointer off every menu keeps the submenu open", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Turn into ›");
	const submenu = await box(menu(page, "Turn into ›"));
	await page.mouse.move(submenu.x + submenu.width + 200, submenu.y + 20, { steps: 6 });
	await expect(menu(page, "Turn into ›")).toBeVisible();
});

test("a click on a submenu item opens it at once; a second click keeps it open", async ({ page }) => {
	await openBlockMenu(page);
	await item(page, "Turn into ›").click();
	await expect(menu(page, "Turn into ›")).toBeVisible();
	await item(page, "Turn into ›").click();
	await expect(menu(page, "Turn into ›")).toBeVisible();
});

test("a click on an item deep inside runs it, closes every level, and focuses the button", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "End", "ArrowRight"]);
	await item(page, "Custom color").click();
	await expect(menu(page, "Block menu")).toBeHidden();
	await expect(menu(page, "Color ›")).toBeHidden();
	await expect(menu(page, "More ›")).toBeHidden();
	await expect(button(page, "Block menu")).toBeFocused();
	expect(await log(page)).toBe("Custom");
});

test("hideOnClick false in a submenu runs the item and keeps every level open", async ({ page }) => {
	await openBlockMenu(page);
	await item(page, "Color ›").click();
	await item(page, "Gray").click();
	await expect(menu(page, "Color ›")).toBeVisible();
	await expect(menu(page, "Block menu")).toBeVisible();
	expect(await log(page)).toBe("Gray");
});

test("an outside click closes every level and leaves focus on the clicked element", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]);
	await page.getByRole("textbox", { name: "Outside input" }).click();
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeHidden();
	await expect(page.getByRole("textbox", { name: "Outside input" })).toBeFocused();
});

test("a click on the parent padding closes only the submenu", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]);
	const parent = await box(menu(page, "Block menu"));
	await page.mouse.click(parent.x + 2, parent.y + parent.height / 2);
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeFocused();
});

test("a scroll of the parent menu closes its submenu", async ({ page }) => {
	await openBlockMenu(page);
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]);
	await expect(menu(page, "Turn into ›")).toBeFocused();
	await menu(page, "Block menu")
		.locator(":scope > .story-scroll")
		.evaluate((node) => node.scrollBy(0, 40));
	await expect(menu(page, "Turn into ›")).toBeHidden();
	await expect(menu(page, "Block menu")).toBeFocused();
});

test("scrolling inside a submenu, by wheel or by keys, keeps it open", async ({ page }) => {
	await page.clock.install();
	await openBlockMenu(page);
	await pauseClock(page);
	await hoverOpen(page, "Turn into ›");
	const trigger = await box(item(page, "Turn into ›"));
	const submenu = await box(menu(page, "Turn into ›"));
	// Straight right from the item into the submenu, so no other parent item gets hovered.
	await page.mouse.move(submenu.x + 30, trigger.y + trigger.height / 2, { steps: 6 });
	const scroller = menu(page, "Turn into ›").locator(":scope > .story-scroll");
	await page.mouse.wheel(0, 60);
	await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	await expect(menu(page, "Turn into ›")).toBeVisible();

	await page.keyboard.press("End");
	expect(await active(page)).toBe("To-do list");
	await page.keyboard.press("Home");
	await expect(menu(page, "Turn into ›")).toBeVisible();
	await expect(menu(page, "Turn into ›")).toBeFocused();
});
// #endregion submenus

// #region context menu
function row(page: Page, name: string) {
	return page.getByRole("treeitem", { name, exact: true });
}

async function openContextStory(page: Page) {
	await page.goto("/iframe.html?id=menu--context-menu&viewMode=story");
	await expect(row(page, "alpha")).toBeVisible();
}

/**
 * Send the contextmenu event Chromium sends to the focused element after Shift+F10 or the
 * ContextMenu key: `button` -1, at a position that is not the pointer. Firefox and WebKit send none
 * for a key in tests. Returns whether a handler prevented the browser's own menu.
 */
async function sendKeyContextMenu(page: Page) {
	return page.evaluate(() => {
		const event = new PointerEvent("contextmenu", {
			button: -1,
			clientX: 500,
			clientY: 500,
			bubbles: true,
			cancelable: true,
		});
		document.activeElement!.dispatchEvent(event);
		return event.defaultPrevented;
	});
}

/**
 * Record whether each contextmenu event kept the browser's own menu from opening.
 */
async function recordContextMenus(page: Page) {
	await page.evaluate(() => {
		const prevented: boolean[] = [];
		(window as unknown as { contextMenus: boolean[] }).contextMenus = prevented;
		window.addEventListener("contextmenu", (event) => prevented.push(event.defaultPrevented));
	});
}

async function contextMenus(page: Page) {
	return page.evaluate(() => (window as unknown as { contextMenus: boolean[] }).contextMenus);
}

test("a right click opens the menu at the pointer, focused, with no active item", async ({ page }) => {
	await openContextStory(page);
	const target = await box(row(page, "bravo"));
	const point = { x: target.x + 40, y: target.y + 10 };
	await page.mouse.click(point.x, point.y, { button: "right" });
	const content = menu(page, "Actions for bravo");
	await expect(content).toBeFocused();
	expect(await active(page)).toBeNull();
	const menuBox = await box(content);
	expect(Math.abs(menuBox.x - point.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - point.y)).toBeLessThanOrEqual(0.5);
	await expect(page.locator(".np-MenuPoint")).toHaveCount(1);

	await page.keyboard.press("Escape");
	await expect(content).toBeHidden();
	await expect(row(page, "bravo")).toBeFocused();
	await expect(page.locator(".np-MenuPoint")).toHaveCount(0);
});

test("a transformed row does not move the menu away from the pointer", async ({ page }) => {
	await openContextStory(page);
	const target = await box(row(page, "echo"));
	const point = { x: target.x + 60, y: target.y + 12 };
	await page.mouse.click(point.x, point.y, { button: "right" });
	const menuBox = await box(menu(page, "Actions for echo"));
	expect(Math.abs(menuBox.x - point.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - point.y)).toBeLessThanOrEqual(0.5);
});

test("near the right and bottom edges the menu flips and stays inside the viewport", async ({ page }) => {
	await openContextStory(page);
	const target = await box(row(page, "zulu"));
	const point = { x: target.x + target.width - 4, y: target.y + target.height - 4 };
	await page.mouse.click(point.x, point.y, { button: "right" });
	const menuBox = await box(menu(page, "Actions for zulu"));
	const viewport = page.viewportSize()!;
	expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
	expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
	// Flipped both ways, so its bottom-right corner sits at the pointer.
	expect(Math.abs(menuBox.x + menuBox.width - point.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y + menuBox.height - point.y)).toBeLessThanOrEqual(0.5);
});

for (const key of ["Shift+F10", "ContextMenu"]) {
	test(`${key} opens the menu at the focused row, with the first item active`, async ({ page }) => {
		await openContextStory(page);
		await row(page, "charlie").focus();
		await page.keyboard.press(key);
		await expect(menu(page, "Actions for charlie")).toBeFocused();
		expect(await active(page)).toBe("Rename");
		const target = await box(row(page, "charlie"));
		const menuBox = await box(menu(page, "Actions for charlie"));
		expect(Math.abs(menuBox.x - target.x)).toBeLessThanOrEqual(0.5);
		expect(Math.abs(menuBox.y - (target.y + target.height))).toBeLessThanOrEqual(0.5);
		await expect(page.locator(".np-MenuPoint")).toHaveCount(0);
	});
}

test("Shift+F10 on the ⋮ button inside the row opens the menu below that button", async ({ page }) => {
	await openContextStory(page);
	const more = row(page, "delta").getByRole("button", { name: "⋮" });
	await more.focus();
	await page.keyboard.press("Shift+F10");
	await expect(menu(page, "Actions for delta")).toBeFocused();
	const moreBox = await box(more);
	const menuBox = await box(menu(page, "Actions for delta"));
	expect(Math.abs(menuBox.x - moreBox.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - (moreBox.y + moreBox.height))).toBeLessThanOrEqual(0.5);
});

test("Shift+F10 inside a transformed container opens at the row", async ({ page, browserName }) => {
	test.skip(
		browserName === "firefox",
		"Firefox anchor positioning ignores transforms on the anchor's ancestors (mozilla/standards-positions#1302).",
	);
	await openContextStory(page);
	await row(page, "echo").focus();
	await page.keyboard.press("Shift+F10");
	const target = await box(row(page, "echo"));
	const menuBox = await box(menu(page, "Actions for echo"));
	expect(Math.abs(menuBox.x - target.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - (target.y + target.height))).toBeLessThanOrEqual(0.5);
});

for (const key of ["Shift+F10", "ContextMenu"]) {
	test(`${key} and the contextmenu event Chromium also sends open one menu at the row, and no browser menu`, async ({
		page,
	}) => {
		await openContextStory(page);
		await recordToggles(page);
		await recordContextMenus(page);
		await row(page, "charlie").focus();
		await page.keyboard.press(key);
		await expect(menu(page, "Actions for charlie")).toBeFocused();
		// Focus is on the menu now, so the event goes to the menu, not to the row.
		expect(await sendKeyContextMenu(page)).toBe(true);
		expect(await contextMenus(page)).not.toContain(false);
		expect(await active(page)).toBe("Rename");
		expect(await toggles(page)).toEqual(["open"]);
		const target = await box(row(page, "charlie"));
		const menuBox = await box(menu(page, "Actions for charlie"));
		expect(Math.abs(menuBox.x - target.x)).toBeLessThanOrEqual(0.5);
		expect(Math.abs(menuBox.y - (target.y + target.height))).toBeLessThanOrEqual(0.5);
	});
}

test("a contextmenu event from a key on the row opens the menu like the key", async ({ page }) => {
	await openContextStory(page);
	await row(page, "charlie").focus();
	expect(await sendKeyContextMenu(page)).toBe(true);
	await expect(menu(page, "Actions for charlie")).toBeFocused();
	expect(await active(page)).toBe("Rename");
	const target = await box(row(page, "charlie"));
	const menuBox = await box(menu(page, "Actions for charlie"));
	expect(Math.abs(menuBox.x - target.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - (target.y + target.height))).toBeLessThanOrEqual(0.5);
	await expect(page.locator(".np-MenuPoint")).toHaveCount(0);
});

test("a second right click on the same row moves the open menu without closing it", async ({ page }) => {
	await openContextStory(page);
	await recordToggles(page);
	const target = await box(row(page, "alpha"));
	await page.mouse.click(target.x + 120, target.y + 14, { button: "right" });
	await expect(menu(page, "Actions for alpha")).toBeFocused();
	// Left of and above the open menu, so the click lands on the row.
	await page.mouse.click(target.x + 20, target.y + 4, { button: "right" });
	const menuBox = await box(menu(page, "Actions for alpha"));
	expect(Math.abs(menuBox.x - (target.x + 20))).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - (target.y + 4))).toBeLessThanOrEqual(0.5);
	expect(await toggles(page)).toEqual(["open"]);
	await expect(page.locator(".np-MenuPoint")).toHaveCount(1);
});

test("a right click on another row closes the first menu and opens the second", async ({ page }) => {
	await openContextStory(page);
	await row(page, "alpha").click({ button: "right" });
	await expect(menu(page, "Actions for alpha")).toBeVisible();
	// The alpha menu covers the middle of the delta row.
	await row(page, "delta").click({ button: "right", position: { x: 10, y: 10 } });
	await expect(menu(page, "Actions for alpha")).toBeHidden();
	await expect(menu(page, "Actions for delta")).toBeFocused();
	expect(await log(page)).toBe("alpha open,alpha closed,delta open");
});

test("an item click runs it, closes, and focuses the row", async ({ page }) => {
	await openContextStory(page);
	await row(page, "bravo").click({ button: "right" });
	await item(page, "Copy").click();
	await expect(menu(page, "Actions for bravo")).toBeHidden();
	await expect(row(page, "bravo")).toBeFocused();
	expect(await log(page)).toBe("bravo open,Copy bravo,bravo closed");
});

test("an outside click closes and leaves focus on the clicked element", async ({ page }) => {
	await openContextStory(page);
	await row(page, "bravo").click({ button: "right" });
	await page.getByRole("textbox", { name: "Outside input" }).click();
	await expect(menu(page, "Actions for bravo")).toBeHidden();
	await expect(page.getByRole("textbox", { name: "Outside input" })).toBeFocused();
});

test("the window losing focus closes the menu", async ({ page }) => {
	await openContextStory(page);
	await row(page, "bravo").click({ button: "right" });
	await expect(menu(page, "Actions for bravo")).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event("blur")));
	await expect(menu(page, "Actions for bravo")).toBeHidden();
});

test("Shift+right click keeps the browser menu and does not open ours", async ({ page }) => {
	await openContextStory(page);
	const prevented = await row(page, "bravo").evaluate((node) => {
		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			shiftKey: true,
			clientX: 50,
			clientY: 50,
		});
		node.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(prevented).toBe(false);
	await expect(menu(page, "Actions for bravo")).toBeHidden();
});

test("the ⋮ button opens the same menu below itself; after a right click it anchors to the button again", async ({
	page,
}) => {
	await openContextStory(page);
	const more = row(page, "delta").getByRole("button", { name: "⋮" });
	await more.click();
	const moreBox = await box(more);
	let menuBox = await box(menu(page, "Actions for delta"));
	expect(Math.abs(menuBox.x - moreBox.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(menuBox.y - (moreBox.y + moreBox.height))).toBeLessThanOrEqual(0.5);
	await expect(more).toHaveAttribute("aria-expanded", "true");
	await page.keyboard.press("Escape");
	await expect(more).toBeFocused();

	const target = await box(row(page, "delta"));
	await page.mouse.click(target.x + 20, target.y + 10, { button: "right" });
	await page.keyboard.press("Escape");
	await more.click();
	menuBox = await box(menu(page, "Actions for delta"));
	expect(Math.abs(menuBox.x - moreBox.x)).toBeLessThanOrEqual(0.5);
	await expect(page.locator(".np-MenuPoint")).toHaveCount(0);
});

test("Tab from a context menu closes it", async ({ page }) => {
	await openContextStory(page);
	await row(page, "bravo").focus();
	await page.keyboard.press("Shift+F10");
	await expect(menu(page, "Actions for bravo")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(menu(page, "Actions for bravo")).toBeHidden();
});
// #endregion context menu

// #region placement
test("the placements and offsets the app uses match Ariakit within 0.5px, with the same width", async ({ page }) => {
	await openStory(page, "ariakit-parity");
	const cases = [
		["bottom-start", 0],
		["bottom-end", 0],
		["top-start", 6],
		["right-start", 0],
		["right-start", 8],
	] as const;
	for (const [placement, gutter] of cases) {
		const cell = page.locator(`.story-parity-cell[data-placement="${placement}-${gutter}"]`);
		const text = `${placement}, gutter ${gutter}`;
		const found: Record<string, { x: number; y: number; width: number }> = {};
		for (const kind of ["native", "ariakit"]) {
			const trigger = await box(cell.locator(`.story-parity-trigger[data-kind="${kind}"]`));
			const content = await box(page.locator(`.story-Menu[data-kind="${kind}"]`, { hasText: text }));
			found[kind] = { x: content.x - trigger.x, y: content.y - trigger.y, width: content.width };
		}
		expect(Math.abs(found.native!.x - found.ariakit!.x), text).toBeLessThanOrEqual(0.5);
		expect(Math.abs(found.native!.y - found.ariakit!.y), text).toBeLessThanOrEqual(0.5);
		expect(Math.abs(found.native!.width - found.ariakit!.width), text).toBeLessThanOrEqual(0.5);
	}
});

test("every placement opens on its side and aligns like its name", async ({ page }) => {
	await openStory(page, "placements");
	await page.getByRole("checkbox", { name: "Show all" }).check();
	for (const trigger of await page.locator(".story-grid > button").all()) {
		const placement = (await trigger.textContent())!;
		const [side, align = "center"] = placement.split("-");
		const t = await box(trigger);
		const c = await box(page.locator(".story-Menu", { hasText: new RegExp(`^${placement}$`) }));
		const vertical = side === "top" || side === "bottom";
		const sideGap = {
			top: t.y - (c.y + c.height),
			bottom: c.y - (t.y + t.height),
			left: t.x - (c.x + c.width),
			right: c.x - (t.x + t.width),
		}[side!]!;
		const [start, size, contentStart, contentSize] = vertical
			? [t.x, t.width, c.x, c.width]
			: [t.y, t.height, c.y, c.height];
		const alignGap = {
			start: contentStart - start,
			end: contentStart + contentSize - (start + size),
			center: contentStart + contentSize / 2 - (start + size / 2),
		}[align]!;
		expect(Math.abs(sideGap), `${placement} side`).toBeLessThanOrEqual(0.5);
		expect(Math.abs(alignGap), `${placement} align`).toBeLessThanOrEqual(0.5);
	}
});
// #endregion placement

// #region layers
test("Escape closes a tooltip on an item first, then the menu, and focus goes back to the button", async ({ page }) => {
	await openStory(page, "tooltip-on-item");
	await button(page, "⋮").click();
	const content = page.getByRole("menu");
	await expect(content).toBeFocused();
	await item(page, "Archive").hover();
	const tip = page.getByText("Moves the file to the archive");
	await expect(tip).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(tip).toBeHidden();
	await expect(content).toBeFocused();

	await page.keyboard.press("Escape");
	await expect(content).toBeHidden();
	await expect(button(page, "⋮")).toBeFocused();
});

test("an item click that opens a native modal dialog closes the menu first; the dialog returns focus to the button", async ({
	page,
}) => {
	await openStory(page, "item-opens-dialog");
	await button(page, "File").click();
	await item(page, "Rename…").click();
	const dialog = page.getByRole("dialog", { name: "Rename" });
	await expect(dialog).toBeVisible();
	await expect(page.getByRole("menu")).toBeHidden();
	await expect(page.getByRole("textbox", { name: "New name" })).toBeFocused();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(button(page, "File")).toBeFocused();
	await expect(page.getByRole("menu")).toBeHidden();
});

for (const key of ["Enter", "Space"]) {
	test(`${key} on an item that opens a dialog does not reach the dialog`, async ({ page }) => {
		await openStory(page, "item-opens-dialog");
		await button(page, "File").focus();
		await page.keyboard.press("Enter");
		expect(await active(page)).toBe("Rename…");
		await page.keyboard.press(key);
		await expect(page.getByRole("dialog", { name: "Rename" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "New name" })).toBeFocused();
		await expect(page.getByRole("textbox", { name: "New name" })).toHaveValue("");
		await expect(page.getByRole("menu")).toBeHidden();
	});
}

test("an item that opens an Ariakit dialog: focus goes into it, and back to the button on close", async ({ page }) => {
	await openStory(page, "item-opens-dialog");
	await button(page, "File").click();
	await item(page, "Archive…").click();
	const dialog = page.getByRole("dialog", { name: "Archive" });
	await expect(dialog).toBeVisible();
	await expect(page.getByRole("menu")).toBeHidden();
	await expect(button(page, "Confirm")).toBeFocused();

	await button(page, "Confirm").click();
	await expect(dialog).toBeHidden();
	await expect(button(page, "File")).toBeFocused();
});

for (const [story, dialogName, itemName] of [
	["in-dialog", "Settings", "Option"],
	["in-ariakit-dialog", "Organizations", "Leave"],
] as const) {
	test(`in the ${dialogName} dialog, Escape closes the menu first, then the dialog; an item click keeps the dialog`, async ({
		page,
	}) => {
		await openStory(page, story);
		await button(page, "Open dialog").click();
		const dialog = page.getByRole("dialog", { name: dialogName });
		await expect(dialog).toBeVisible();

		await button(page, "Options").click();
		await item(page, itemName).click();
		await expect(page.getByRole("menu")).toBeHidden();
		await expect(dialog).toBeVisible();
		await expect(button(page, "Options")).toBeFocused();

		await button(page, "Options").click();
		await expect(page.getByRole("menu")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toBeHidden();
		await expect(dialog).toBeVisible();
		await expect(button(page, "Options")).toBeFocused();

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
}
// #endregion layers
