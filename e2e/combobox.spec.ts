import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=combobox--${id}&viewMode=story`);
	// Some stories render their widget only inside a closed dialog, so wait for any rendered child.
	await expect(page.locator("#storybook-root > *").first()).toBeAttached();
}

function input(page: Page, name: string) {
	return page.getByRole("combobox", { name, exact: true });
}

function listbox(page: Page, name: string) {
	return page.getByRole("listbox", { name, exact: true });
}

function option(page: Page, name: string) {
	return page.getByRole("option", { name, exact: true });
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
 * The text of the active option, read through `aria-activedescendant` of the focused element. It also
 * proves that DOM focus stays in the input.
 */
async function active(page: Page) {
	return page.evaluate(() => {
		const focused = document.activeElement;
		if (focused?.getAttribute("role") !== "combobox") return `focus on ${focused?.tagName.toLowerCase()}`;
		const id = focused.getAttribute("aria-activedescendant");
		if (!id) return null;
		const item = document.getElementById(id);
		if (!item) return `missing ${id}`;
		if (!item.hasAttribute("data-active-item")) return "data-active-item missing";
		return item.textContent?.trim() ?? null;
	});
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

async function pressAll(page: Page, keys: string[]) {
	for (const key of keys) await page.keyboard.press(key);
}

// #region roles
test("the input is an editable combobox named by its label, pointing at the list", async ({ page }) => {
	await openStory(page, "basic");
	const fruit = input(page, "Fruit");
	await expect(fruit).toHaveAttribute("aria-autocomplete", "list");
	await expect(fruit).toHaveAttribute("aria-haspopup", "listbox");
	await expect(fruit).toHaveAttribute("aria-expanded", "false");
	await fruit.click();
	const list = listbox(page, "Fruit suggestions");
	await expect(list).toBeVisible();
	await expect(fruit).toHaveAttribute("aria-expanded", "true");
	await expect(fruit).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
});
// #endregion roles

// #region focus and keys
test("focus stays in the input while the arrows move aria-activedescendant, looping through the input", async ({
	page,
}) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	expect(await active(page)).toBeNull();
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Apple");
	await page.keyboard.press("ArrowUp");
	expect(await active(page)).toBeNull();
	await page.keyboard.press("ArrowUp");
	expect(await active(page)).toBe("Mango");
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBeNull();
	await expect(input(page, "Fruit")).toBeFocused();
});

test("arrows skip a disabled option", async ({ page }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	await pressAll(page, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]);
	expect(await active(page)).toBe("Blueberry");
	// Cherry is disabled.
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Grape");
});

test("Home and End stay in the text", async ({ page }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	await page.keyboard.type("an");
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Banana");
	await page.keyboard.press("Home");
	expect(await active(page)).toBe("Banana");
	expect(await input(page, "Fruit").evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(0);
});

test("typing filters and opens the list, and a closed ArrowDown opens it too", async ({ page }) => {
	await openStory(page, "basic");
	const fruit = input(page, "Fruit");
	await fruit.focus();
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	await page.keyboard.type("ap");
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
	await expect(page.getByRole("option")).toHaveCount(3);
	// Typing clears the active option when autoSelect is off.
	expect(await active(page)).toBeNull();
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	await page.keyboard.press("ArrowDown");
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
});

test("Enter picks the active option: the text becomes its value and the list closes", async ({ page }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	await page.keyboard.type("gr");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	await expect(input(page, "Fruit")).toHaveValue("Grape");
	await expect(page.getByTestId("text")).toHaveText("Grape");
	await expect(input(page, "Fruit")).toBeFocused();
});

test("a click on an option picks it and keeps focus in the input", async ({ page }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	await option(page, "Lemon").click();
	await expect(input(page, "Fruit")).toHaveValue("Lemon");
	await expect(input(page, "Fruit")).toBeFocused();
});

test("Enter on an active option is used first, so the caller's own Enter does not run", async ({ page }) => {
	await openStory(page, "app-like");
	const search = input(page, "Search files");
	await search.click();
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(search).toHaveValue("file.path:");
	await expect(page.getByTestId("log")).toHaveText("");
	await expect(listbox(page, "Search suggestions")).toBeVisible();
	// With no active option, the caller's Enter runs.
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("log")).toHaveText("submit file.path:");
});

test("Enter while the list is open never submits a form", async ({ page }) => {
	await openStory(page, "in-form");
	await input(page, "Fruit").click();
	await page.keyboard.press("Enter");
	await page.keyboard.type("zzz");
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("submits")).toHaveText("0");
});

test("hover moves the active option, and leaving the list clears it", async ({ page }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	const banana = await center(option(page, "Banana"));
	await page.mouse.move(banana.x, banana.y, { steps: 3 });
	expect(await active(page)).toBe("Banana");
	// The list sits near the middle of the story, so leave it toward the top-left corner.
	await page.mouse.move(5, 5, { steps: 3 });
	expect(await active(page)).toBeNull();
});
// #endregion focus and keys

// #region close
test("Escape closes the list first and keeps the text; a second Escape does nothing more", async ({ page }) => {
	await openStory(page, "basic");
	const fruit = input(page, "Fruit");
	await fruit.click();
	await page.keyboard.type("ap");
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	await expect(fruit).toHaveValue("ap");
	await expect(fruit).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(fruit).toHaveValue("ap");
	await expect(fruit).toBeFocused();
});

for (const story of ["in-dialog", "in-ariakit-dialog"]) {
	test(`inside a modal dialog (${story}), the first Escape closes the list and the dialog stays`, async ({ page }) => {
		await openStory(page, story);
		await page.getByRole("button", { name: "Open dialog" }).click();
		const dialog = page.getByRole("dialog", { name: "Search dialog" });
		await dialog.getByRole("combobox", { name: "Fruit" }).click();
		await expect(listbox(page, "Fruit suggestions")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(listbox(page, "Fruit suggestions")).toBeHidden();
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
}

test("an outside click closes the list and focus stays where the user clicked", async ({ page, browserName }) => {
	await openStory(page, "basic");
	await input(page, "Fruit").click();
	await page.getByRole("button", { name: "After" }).click();
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	// WebKit does not focus a button on click (README "Browser notes").
	if (browserName !== "webkit") await expect(page.getByRole("button", { name: "After" })).toBeFocused();
});

test("a popover with a list and other content is a dialog, and the input points at it", async ({ page }) => {
	await openStory(page, "app-like");
	const search = input(page, "Search files");
	await search.click();
	await expect(listbox(page, "Search suggestions")).toBeVisible();
	await expect(search).toHaveAttribute("aria-haspopup", "dialog");
	await expect(search).toHaveAttribute("aria-controls", "app-like-suggestions");
	await expect(page.getByRole("dialog", { name: "Search filters" })).toBeVisible();
});

test("focus on an element whose aria-controls names the list keeps it open", async ({ page }) => {
	await openStory(page, "app-like");
	await input(page, "Search files").click();
	await expect(listbox(page, "Search suggestions")).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "Add search filter" })).toBeFocused();
	await expect(listbox(page, "Search suggestions")).toBeVisible();
	await page.keyboard.press("Shift+Tab");
	await expect(listbox(page, "Search suggestions")).toBeVisible();
});

test("Escape with focus on a control inside the popup gives focus back to the input", async ({ page }) => {
	await openStory(page, "app-like");
	await input(page, "Search files").click();
	await expect(listbox(page, "Search suggestions")).toBeVisible();
	// WebKit does not focus a summary on click, so focus it directly.
	await page.locator("summary").focus();
	await page.keyboard.press("Escape");
	await expect(input(page, "Search files")).toBeFocused();
});

test("a press on the input while open never closes and reopens it", async ({ page }) => {
	await openStory(page, "basic");
	await recordToggles(page);
	await input(page, "Fruit").click();
	await input(page, "Fruit").click();
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
	expect(await toggles(page)).toEqual(["open"]);
});
// #endregion close

// #region cancel and inline
test("ComboboxCancel clears the text, keeps the list open, and keeps focus in the input", async ({ page }) => {
	await openStory(page, "cancel");
	const fruit = input(page, "Fruit");
	await fruit.click();
	await page.keyboard.type("ban");
	const clear = page.getByRole("button", { name: "Clear input" });
	await expect(clear).toHaveAttribute("tabindex", "-1");
	await expect(clear).toHaveAttribute("aria-controls", (await fruit.getAttribute("id"))!);
	await clear.click();
	await expect(fruit).toHaveValue("");
	await expect(fruit).toBeFocused();
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
});

test("an inline list with no popover works with the keys and a click", async ({ page }) => {
	await openStory(page, "inline");
	const ask = input(page, "Ask AI");
	await ask.click();
	await expect(listbox(page, "AI actions")).toBeVisible();
	await expect(ask).toHaveAttribute("aria-controls", (await listbox(page, "AI actions").getAttribute("id"))!);
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Improve writing");
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("picked")).toHaveText("Improve writing");
	await expect(ask).toHaveValue("");
	await page.keyboard.type("short");
	await expect(page.getByRole("option")).toHaveCount(1);
});
// #endregion cancel and inline

// #region controlled
test("a controlled parent can refuse a close, and setOpen still runs", async ({ page }) => {
	await openStory(page, "controlled");
	await page.getByRole("checkbox", { name: "Refuse close" }).check();
	await input(page, "Fruit").click();
	await page.keyboard.press("Escape");
	await page.waitForTimeout(100);
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
	await expect(page.getByTestId("requests")).toHaveText("open,closed");
});

test("StrictMode controlled open and close through setOpen", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await recordToggles(page);
	await input(page, "Fruit").click();
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Fruit suggestions")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("StrictMode typing opens one list", async ({ page }) => {
	await openStory(page, "strict-typing");
	await recordToggles(page);
	await input(page, "Fruit").focus();
	await page.keyboard.type("a");
	await expect(listbox(page, "Fruit suggestions")).toBeVisible();
	expect(await toggles(page)).toEqual(["open"]);
});
// #endregion controlled

// #region placement
test("the list follows the input when a scroll container scrolls", async ({ page }) => {
	await openStory(page, "scroll-container");
	const scroller = page.getByTestId("scroller");
	await scroller.evaluate((node) => {
		node.scrollTop = 300;
	});
	await input(page, "Fruit").click();
	const before = await box(listbox(page, "Fruit suggestions"));
	const inputBefore = await box(input(page, "Fruit"));
	await scroller.evaluate((node) => {
		node.scrollTop += 40;
	});
	await page.waitForTimeout(100);
	const after = await box(listbox(page, "Fruit suggestions"));
	const inputAfter = await box(input(page, "Fruit"));
	expect(Math.abs(after.y - inputAfter.y - (before.y - inputBefore.y))).toBeLessThanOrEqual(0.5);
	expect(Math.abs(inputAfter.y - inputBefore.y + 40)).toBeLessThanOrEqual(0.5);
});

test("placement and gap match Ariakit's combobox popover", async ({ page }) => {
	await openStory(page, "ariakit-parity");
	for (const cell of await page.locator(".story-parity-cell").all()) {
		const key = await cell.getAttribute("data-cell");
		const offsets: Record<string, { x: number; y: number; w: number }> = {};
		for (const kind of ["native", "ariakit"]) {
			const inputBox = await box(cell.locator(`.story-parity-input[data-kind="${kind}"]`));
			const listBox = await box(page.locator(`.story-Combobox[data-kind="${kind}"][data-cell="${key}"]`));
			offsets[kind] = { x: listBox.x - inputBox.x, y: listBox.y - inputBox.y, w: listBox.width };
		}
		expect(Math.abs(offsets.native!.x - offsets.ariakit!.x), `${key} x`).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.y - offsets.ariakit!.y), `${key} y`).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.w - offsets.ariakit!.w), `${key} width`).toBeLessThanOrEqual(0.5);
	}
});
// #endregion placement
