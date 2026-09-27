import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=select--${id}&viewMode=story`);
	// Some stories render their widget only inside a closed dialog, so wait for any rendered child.
	await expect(page.locator("#storybook-root > *").first()).toBeAttached();
}

function trigger(page: Page, name: string | RegExp) {
	return page.getByRole("combobox", { name, exact: typeof name === "string" });
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
 * The text of the active option, read through `aria-activedescendant` of the focused element. So it
 * also proves where DOM focus is: `focus on <tag> <role>` when the focused element has no active option.
 */
async function active(page: Page) {
	return page.evaluate(() => {
		const focused = document.activeElement;
		const id = focused?.getAttribute("aria-activedescendant");
		if (!id) return `focus on ${focused?.tagName.toLowerCase()} ${focused?.getAttribute("role") ?? ""}`.trim();
		const item = document.getElementById(id);
		if (!item) return `missing ${id}`;
		if (!item.hasAttribute("data-active-item")) return "data-active-item missing";
		return item.textContent?.trim() ?? null;
	});
}

async function picks(page: Page) {
	return (await page.getByTestId("picks").textContent()) ?? "";
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
test("the trigger is a select-only combobox named by its label, and the list is a named listbox", async ({ page }) => {
	await openStory(page, "basic");
	const mode = trigger(page, "Mode");
	await expect(mode).toHaveAttribute("aria-haspopup", "listbox");
	await expect(mode).toHaveAttribute("aria-autocomplete", "none");
	await expect(mode).toHaveAttribute("aria-expanded", "false");

	await mode.click();
	const list = listbox(page, "Mode");
	await expect(list).toBeFocused();
	await expect(mode).toHaveAttribute("aria-expanded", "true");
	await expect(mode).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
	await expect(option(page, "Agent")).toHaveAttribute("aria-selected", "true");
	await expect(option(page, "Ask")).toHaveAttribute("aria-selected", "false");
	await expect(option(page, "Plan")).toHaveAttribute("aria-disabled", "true");
});

test("groups are named by their labels, and the labels are hidden from assistive technology", async ({ page }) => {
	await openStory(page, "groups");
	await trigger(page, "Color").click();
	await expect(page.getByRole("group", { name: "Text", exact: true })).toBeVisible();
	await expect(page.getByRole("group", { name: "Background", exact: true })).toBeVisible();
	await expect(page.getByText("Background", { exact: true })).toHaveAttribute("aria-hidden", "true");
});

test("a click on the label focuses the trigger", async ({ page }) => {
	await openStory(page, "basic");
	await page.getByText("Mode", { exact: true }).click();
	await expect(trigger(page, "Mode")).toBeFocused();
});
// #endregion roles

// #region open
test("a click opens with DOM focus on the listbox and the selected option active", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	expect(await active(page)).toBe("Agent");
});

for (const key of ["Enter", " ", "ArrowDown", "ArrowUp", "Alt+ArrowDown"]) {
	test(`${key === " " ? "Space" : key} on the trigger opens with the selected option active`, async ({ page }) => {
		await openStory(page, "basic");
		await trigger(page, "Mode").focus();
		await page.keyboard.press(key);
		await expect(listbox(page, "Mode")).toBeFocused();
		expect(await active(page)).toBe("Agent");
	});
}

test("with no selected option, ArrowDown opens on the first option, ArrowUp on the last, a click on none", async ({
	page,
}) => {
	await openStory(page, "no-value");
	const pinned = trigger(page, "Pinned");
	await pinned.focus();
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Agent");
	await page.keyboard.press("Escape");
	await page.keyboard.press("ArrowUp");
	expect(await active(page)).toBe("Review");
	await page.keyboard.press("Escape");
	await pinned.click();
	expect(await active(page)).toBe("focus on div listbox");
});
// #endregion open

// #region keys
test("arrows, Home, and End move the active option, skip disabled options, and do not loop", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	const seen: Array<string | null> = [];
	for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "Home", "ArrowUp", "End"]) {
		await page.keyboard.press(key);
		seen.push(await active(page));
	}
	// Plan is disabled, so Ask goes straight to Review.
	expect(seen).toEqual(["Ask", "Review", "Review", "Agent", "Agent", "Review"]);
});

test("PageDown and PageUp move by one visible page and keep the active option in view", async ({ page }) => {
	await openStory(page, "long-list");
	await trigger(page, "Long").click();
	await page.keyboard.press("PageDown");
	const afterPage = await active(page);
	expect(afterPage).not.toBe("Item 01");
	expect(afterPage).not.toBe("Item 30");
	await expect(option(page, afterPage!)).toBeInViewport();
	await page.keyboard.press("End");
	await expect(option(page, "Item 30")).toBeInViewport();
	await page.keyboard.press("PageUp");
	expect(await active(page)).not.toBe("Item 30");
});

test("typeahead moves to the next match, cycles on the same letter, and skips disabled options", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	await page.keyboard.press("a");
	expect(await active(page)).toBe("Ask");
	await page.keyboard.press("a");
	expect(await active(page)).toBe("Agent");
	await page.waitForTimeout(600);
	// Plan is the only match for "p", and it is disabled.
	await page.keyboard.press("p");
	expect(await active(page)).toBe("Agent");
	await page.waitForTimeout(600);
	await page.keyboard.press("r");
	expect(await active(page)).toBe("Review");
});

test("typeahead ignores aria-hidden text, so a hidden sample letter does not block the name", async ({ page }) => {
	await openStory(page, "groups");
	await trigger(page, "Color").click();
	await page.keyboard.press("p");
	expect(await active(page)).toBe("APurple");
});

test("hover moves the active option, and leaving the list clears it", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	const review = await center(option(page, "Review"));
	await page.mouse.move(review.x, review.y, { steps: 3 });
	expect(await active(page)).toBe("Review");
	await page.mouse.move(700, 600, { steps: 3 });
	expect(await active(page)).toBe("focus on div listbox");
});
// #endregion keys

// #region pick
test("Enter picks the active option, closes, and moves focus back to the trigger", async ({ page }) => {
	await openStory(page, "basic");
	const mode = trigger(page, "Mode");
	await mode.click();
	await pressAll(page, ["ArrowDown", "Enter"]);
	await expect(listbox(page, "Mode")).toBeHidden();
	await expect(mode).toBeFocused();
	await expect(mode).toHaveText("Ask");
	expect(await picks(page)).toBe("Ask");
});

test("Space picks on keyup, and a click picks too", async ({ page }) => {
	await openStory(page, "basic");
	const mode = trigger(page, "Mode");
	await mode.click();
	await page.keyboard.press("ArrowDown");
	await page.keyboard.down(" ");
	await expect(listbox(page, "Mode")).toBeVisible();
	await page.keyboard.up(" ");
	await expect(listbox(page, "Mode")).toBeHidden();
	await mode.click();
	await option(page, "Review").click();
	await expect(listbox(page, "Mode")).toBeHidden();
	expect(await picks(page)).toBe("Ask,Review");
});

test("Enter with no active option closes the list and picks nothing", async ({ page }) => {
	await openStory(page, "no-value");
	await trigger(page, "Pinned").click();
	await page.keyboard.press("Enter");
	await expect(listbox(page, "Pinned")).toBeHidden();
	expect(await picks(page)).toBe("");
});

test("a disabled option ignores a click", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	await option(page, "Plan").click({ force: true });
	await expect(listbox(page, "Mode")).toBeVisible();
	expect(await picks(page)).toBe("");
});

test("typeahead on the closed, focused trigger picks the next match without opening", async ({ page }) => {
	await openStory(page, "basic");
	const mode = trigger(page, "Mode");
	await mode.focus();
	await page.keyboard.press("a");
	await expect(mode).toHaveText("Ask");
	await expect(listbox(page, "Mode")).toBeHidden();
	expect(await picks(page)).toBe("Ask");
});

test("typeahead={false} and an unmountOnHide list leave a closed trigger's value alone", async ({ page }) => {
	await openStory(page, "typeahead-off");
	await trigger(page, "View").focus();
	await page.keyboard.press("r");
	await page.waitForTimeout(100);
	expect(await picks(page)).toBe("");

	await openStory(page, "unmount-on-hide");
	await trigger(page, "Unmounted").focus();
	await page.keyboard.press("r");
	await page.waitForTimeout(100);
	expect(await picks(page)).toBe("");
});

test("a pinned empty value and an uncontrolled select never pick the first option by themselves", async ({ page }) => {
	await openStory(page, "no-value");
	await trigger(page, "Pinned").click();
	await page.keyboard.press("Escape");
	await trigger(page, "Uncontrolled").click();
	await page.keyboard.press("Escape");
	await page.waitForTimeout(100);
	expect(await picks(page)).toBe("");
	await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
});

test("a multi-value select marks every chosen option and stays open on a click", async ({ page }) => {
	await openStory(page, "multiple");
	await trigger(page, "Colors").click();
	await expect(listbox(page, "Colors")).toHaveAttribute("aria-multiselectable", "true");
	await option(page, "Green").click();
	await expect(listbox(page, "Colors")).toBeVisible();
	await expect(page.getByTestId("value")).toHaveText("Red,Green");
	await expect(option(page, "Red")).toHaveAttribute("aria-selected", "true");
	await expect(option(page, "Green")).toHaveAttribute("aria-selected", "true");
	await option(page, "Red").click();
	await expect(page.getByTestId("value")).toHaveText("Green");
});

test("autoFocusOnShow={false} keeps focus on the trigger, and one ArrowDown moves into the list", async ({ page }) => {
	await openStory(page, "no-auto-focus");
	const keep = trigger(page, "Keep focus");
	await keep.click();
	await expect(listbox(page, "Keep focus")).toBeVisible();
	await expect(keep).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(listbox(page, "Keep focus")).toBeFocused();
	expect(await active(page)).toBe("Agent");
});

test("autoFocusOnShow={false}: typeahead on the trigger moves into the list, so Enter picks the match", async ({
	page,
}) => {
	await openStory(page, "no-auto-focus");
	const keep = trigger(page, "Keep focus");
	await keep.click();
	await expect(keep).toBeFocused();
	await page.keyboard.press("r");
	await expect(listbox(page, "Keep focus")).toBeFocused();
	expect(await active(page)).toBe("Review");
	await page.keyboard.press("Enter");
	await expect(listbox(page, "Keep focus")).toBeHidden();
	await expect(keep).toHaveText("Review");
});
// #endregion pick

// #region close
test("Escape closes and moves focus back to the trigger", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Mode")).toBeHidden();
	await expect(trigger(page, "Mode")).toBeFocused();
});

test("Tab closes and focus moves on; Shift+Tab goes to the trigger and keeps the list open", async ({ page }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	await page.keyboard.press("Shift+Tab");
	await expect(trigger(page, "Mode")).toBeFocused();
	await expect(listbox(page, "Mode")).toBeVisible();
	await page.keyboard.press("Escape");
	await trigger(page, "Mode").click();
	await page.keyboard.press("Tab");
	await expect(listbox(page, "Mode")).toBeHidden();
	await expect(page.getByRole("button", { name: "After" })).toBeFocused();
});

test("an outside click closes the list and focus stays where the user clicked", async ({ page, browserName }) => {
	await openStory(page, "basic");
	await trigger(page, "Mode").click();
	await page.mouse.click(700, 600);
	await expect(listbox(page, "Mode")).toBeHidden();
	await expect(trigger(page, "Mode")).not.toBeFocused();

	await trigger(page, "Mode").click();
	await page.getByRole("button", { name: "Before" }).click();
	await expect(listbox(page, "Mode")).toBeHidden();
	await expect(trigger(page, "Mode")).not.toBeFocused();
	// WebKit does not focus a button on click (README "Browser notes").
	if (browserName !== "webkit") await expect(page.getByRole("button", { name: "Before" })).toBeFocused();
});

test("a trigger click toggles, and never closes and reopens", async ({ page }) => {
	await openStory(page, "basic");
	await recordToggles(page);
	await trigger(page, "Mode").click();
	await expect(listbox(page, "Mode")).toBeVisible();
	await trigger(page, "Mode").click();
	await expect(listbox(page, "Mode")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("a closed list that stays mounted is hidden from queries", async ({ page }) => {
	await openStory(page, "basic");
	await expect(page.getByRole("option")).toHaveCount(0);
	await expect(page.locator(".np-SelectPositioner")).toHaveAttribute("hidden", "");
});
// #endregion close

// #region controlled
test("a controlled parent can refuse a close, and setOpen still runs", async ({ page }) => {
	await openStory(page, "controlled");
	await page.getByRole("checkbox", { name: "Refuse close" }).check();
	await trigger(page, "Mode").click();
	await page.keyboard.press("Escape");
	await page.waitForTimeout(100);
	await expect(listbox(page, "Mode")).toBeVisible();
	await expect(page.getByTestId("requests")).toHaveText("open,closed");
});

test("StrictMode: one click opens one list, the next click closes it", async ({ page }) => {
	await openStory(page, "strict-toggle");
	await recordToggles(page);
	await trigger(page, "Mode").click();
	await expect(listbox(page, "Mode")).toBeFocused();
	await trigger(page, "Mode").click();
	await expect(listbox(page, "Mode")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("StrictMode controlled open and close through setOpen", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await recordToggles(page);
	await trigger(page, "Mode").click();
	await expect(listbox(page, "Mode")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Mode")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});
// #endregion controlled

// #region search
test("a search select moves focus into the search input with no active option", async ({ page }) => {
	await openStory(page, "search");
	const fruit = trigger(page, "Fruit: Banana");
	await expect(fruit).toHaveAttribute("aria-haspopup", "dialog");
	await fruit.click();
	await expect(page.getByRole("dialog", { name: "Fruit options" })).toBeVisible();
	await expect(trigger(page, "Search Fruit")).toBeFocused();
	expect(await active(page)).toBe("focus on input combobox");
	await expect(option(page, "Banana")).toHaveAttribute("aria-selected", "true");
});

test("typing filters, autoSelect makes the first match active, Enter picks, and a form never submits", async ({
	page,
}) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await page.keyboard.type("ap");
	await expect(page.getByRole("option")).toHaveCount(3);
	expect(await active(page)).toBe("Apple");
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Apricot");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog", { name: "Fruit options" })).toBeHidden();
	await expect(trigger(page, "Fruit: Apricot")).toBeFocused();
	expect(await picks(page)).toBe("Apricot");
	await expect(page.getByTestId("submits")).toHaveText("0");
});

test("Enter with no results keeps the list open and never submits the form", async ({ page }) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await page.keyboard.type("zzz");
	await expect(page.getByText("No results")).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("submits")).toHaveText("0");
	await expect(page.getByRole("dialog", { name: "Fruit options" })).toBeVisible();
	expect(await picks(page)).toBe("");
});

test("the search arrows loop through the input, and Home and End stay in the text until an option is active", async ({
	page,
}) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await page.keyboard.type("an");
	// Banana and Mango match; autoSelect made Banana active.
	expect(await active(page)).toBe("Banana");
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Mango");
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("focus on input combobox");
	await page.keyboard.press("End");
	expect(await trigger(page, "Search Fruit").evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(2);
	await page.keyboard.press("ArrowDown");
	expect(await active(page)).toBe("Banana");
	await page.keyboard.press("End");
	expect(await active(page)).toBe("Mango");
});

test("in a search select, keys on the trigger while the list is open move focus back into the search input", async ({
	page,
}) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await expect(trigger(page, "Search Fruit")).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(trigger(page, "Fruit: Banana")).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(trigger(page, "Search Fruit")).toBeFocused();
	expect(await active(page)).toBe("Apple");
});

test("Escape closes the search select, returns focus to the trigger, and the next open starts empty", async ({
	page,
}) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await page.keyboard.type("ap");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Fruit options" })).toBeHidden();
	await expect(trigger(page, "Fruit: Banana")).toBeFocused();
	await trigger(page, "Fruit: Banana").click();
	await expect(trigger(page, "Search Fruit")).toHaveValue("");
	await expect(page.getByRole("option")).toHaveCount(8);
});

test("a filter that removes the active option leaves no stale aria-activedescendant", async ({ page }) => {
	await openStory(page, "search");
	await trigger(page, "Fruit: Banana").click();
	await page.keyboard.type("ap");
	expect(await active(page)).toBe("Apple");
	await page.keyboard.type("zzz");
	expect(await active(page)).toBe("focus on input combobox");
	await page.keyboard.press("Control+A");
	await page.keyboard.press("Backspace");
	await page.keyboard.type("bl");
	expect(await active(page)).toBe("Blueberry");
	await page.keyboard.press("Enter");
	expect(await picks(page)).toBe("Blueberry");
});

test("an active option that leaves the list without typing leaves no stale aria-activedescendant", async ({ page }) => {
	await openStory(page, "remove-option");
	await trigger(page, "Removable").click();
	await pressAll(page, ["ArrowDown", "ArrowDown"]);
	expect(await active(page)).toBe("Ask");
	await page.keyboard.press("Delete");
	await expect(option(page, "Ask")).toHaveCount(0);
	expect(await active(page)).toBe("focus on div listbox");
	await pressAll(page, ["ArrowDown", "Enter"]);
	expect(await picks(page)).toBe("Agent");
});

test("row actions: a click on the star toggles it and does not pick the row or close the list", async ({ page }) => {
	await openStory(page, "row-actions");
	await trigger(page, "Past chats").click();
	const chat1 = await center(page.getByRole("option", { name: /^Chat 1/ }));
	await page.mouse.move(chat1.x - 40, chat1.y, { steps: 2 });
	const star = page.getByRole("button", { name: "Add Chat 1 to favorites" });
	await expect(star).toHaveAttribute("tabindex", "0");
	await expect(page.getByRole("button", { name: "Add Chat 3 to favorites" })).toHaveAttribute("tabindex", "-1");
	await star.click();
	await expect(page.getByRole("button", { name: "Remove Chat 1 from favorites" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("dialog", { name: "Chats" })).toBeVisible();
	expect(await picks(page)).toBe("");
});

test("row actions: the active row's star is the only Tab stop, and Enter and Space on it run only the star", async ({
	page,
}) => {
	await openStory(page, "row-actions");
	await trigger(page, "Past chats").click();
	await pressAll(page, ["ArrowDown", "ArrowDown"]);
	expect(await active(page)).toBe("Chat 2★");
	await page.keyboard.press("Tab");
	const star = page.getByRole("button", { name: "Add Chat 2 to favorites" });
	await expect(star).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("button", { name: "Remove Chat 2 from favorites" })).toBeFocused();
	await page.keyboard.press(" ");
	await expect(page.getByRole("button", { name: "Add Chat 2 to favorites" })).toBeFocused();
	await expect(page.getByRole("dialog", { name: "Chats" })).toBeVisible();
	expect(await picks(page)).toBe("");
});
// #endregion search

// #region layers
test("a tooltip inside an option closes first on Escape, then the list", async ({ page }) => {
	await openStory(page, "tooltip-inside");
	await trigger(page, "Source").click();
	// The tooltip anchor is the short text span inside the option.
	const ask = await center(option(page, "Ask").locator("span").first());
	await page.mouse.move(ask.x, ask.y, { steps: 3 });
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(listbox(page, "Source")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(listbox(page, "Source")).toBeHidden();
});

test("an option that opens a dialog closes the list first", async ({ page }) => {
	await openStory(page, "dialog-from-item");
	await trigger(page, "Action").click();
	await option(page, "Settings").click();
	await expect(listbox(page, "Action")).toBeHidden();
	await expect(page.getByRole("dialog", { name: "Settings dialog" })).toBeVisible();
});

for (const story of ["in-dialog", "in-ariakit-dialog"]) {
	test(`inside a modal dialog (${story}), the list opens next to its trigger and Escape closes it first`, async ({
		page,
		browserName,
	}) => {
		await openStory(page, story);
		await page.getByRole("button", { name: "Open dialog" }).click();
		const dialog = page.getByRole("dialog", { name: "Settings" });
		await expect(dialog).toBeVisible();
		const mode = dialog.getByRole("combobox", { name: "Mode" });
		await mode.click();
		const list = listbox(page, "Mode");
		await expect(list).toBeFocused();
		const triggerBox = await box(mode);
		const listBox = await box(list);
		if (!(story === "in-ariakit-dialog" && browserName === "firefox")) {
			// Firefox anchor positioning ignores a transform on an ancestor of the anchor (README "Browser notes").
			expect(Math.abs(listBox.y - (triggerBox.y + triggerBox.height) - 4)).toBeLessThanOrEqual(0.5);
			expect(Math.abs(listBox.x - triggerBox.x)).toBeLessThanOrEqual(0.5);
		}
		await page.keyboard.press("Escape");
		await expect(list).toBeHidden();
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
}
// #endregion layers

// #region placement
test("anchorRect opens the list next to a virtual rectangle", async ({ page }) => {
	await openStory(page, "anchor-rect");
	const dialog = page.getByRole("dialog", { name: "Caret picker" });
	await expect(dialog).toBeVisible();
	const listBox = await box(dialog);
	expect(Math.abs(listBox.x - 300)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(listBox.y - 218)).toBeLessThanOrEqual(0.5);
	await expect(page.getByRole("combobox", { name: "Search files" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	expect(await picks(page)).toBe("");
});

test("a select with no trigger gives focus back to what had it before it opened", async ({ page }) => {
	await openStory(page, "anchor-rect");
	await page.keyboard.press("Escape");
	// Press it with the keyboard: WebKit does not focus a button on click.
	await page.getByRole("button", { name: "Reopen" }).focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("combobox", { name: "Search files" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Caret picker" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Reopen" })).toBeFocused();
});

test("placement, gap, and width match Ariakit's select, with and without sameWidth", async ({ page }) => {
	await openStory(page, "ariakit-parity");
	for (const cell of await page.locator(".story-parity-cell").all()) {
		const key = await cell.getAttribute("data-cell");
		const offsets: Record<string, { x: number; y: number; w: number }> = {};
		for (const kind of ["native", "ariakit"]) {
			const triggerBox = await box(cell.locator(`.story-parity-trigger[data-kind="${kind}"]`));
			// The Ariakit list is portaled to body, so find both lists by their cell key.
			const listBox = await box(page.locator(`.story-Select[data-kind="${kind}"][data-cell="${key}"]`));
			offsets[kind] = { x: listBox.x - triggerBox.x, y: listBox.y - triggerBox.y, w: listBox.width };
		}
		const message = `cell ${key}`;
		expect(Math.abs(offsets.native!.x - offsets.ariakit!.x), message).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.y - offsets.ariakit!.y), message).toBeLessThanOrEqual(0.5);
		expect(Math.abs(offsets.native!.w - offsets.ariakit!.w), message).toBeLessThanOrEqual(0.5);
	}
});

test("sameWidth makes the list as wide as the trigger", async ({ page }) => {
	await openStory(page, "same-width");
	await trigger(page, "Wide").click();
	const triggerBox = await box(trigger(page, "Wide"));
	const listBox = await box(listbox(page, "Wide"));
	expect(Math.abs(listBox.width - triggerBox.width)).toBeLessThanOrEqual(0.5);
});

test("the list flips near a viewport edge", async ({ page }) => {
	await openStory(page, "flips");
	const triggerBox = await box(trigger(page, "Bottom edge"));
	const listBox = await box(listbox(page, "Bottom edge"));
	expect(listBox.y + listBox.height).toBeLessThanOrEqual(triggerBox.y - 4 + 0.5);
});
// #endregion placement
