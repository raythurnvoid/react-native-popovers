import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=popover--${id}&viewMode=story`);
	await expect(page.locator("#storybook-root").getByRole("button").first()).toBeVisible();
}

function button(page: Page, name: string | RegExp) {
	return page.getByRole("button", { name, exact: typeof name === "string" });
}

function dialog(page: Page, name: string) {
	return page.getByRole("dialog", { name, exact: true });
}

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("Element has no box");
	return value;
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

// #region open and close
test("click opens, a second click closes, and the trigger click never closes and reopens", async ({ page }) => {
	await openStory(page, "basic");
	await recordToggles(page);
	await button(page, "Filters").click();
	await expect(dialog(page, "Filters")).toBeVisible();
	expect(await page.locator(".np-PopoverPositioner").evaluate((node) => node.matches(":popover-open"))).toBe(true);
	await expect(page.locator(".np-PopoverPositioner")).toHaveJSProperty("popover", "manual");

	// Focus is inside the popover now, so this click is a press from outside the content.
	await button(page, "Filters").click();
	await expect(dialog(page, "Filters")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("StrictMode: one click opens one popover, the next click closes it", async ({ page }) => {
	await openStory(page, "strict-toggle");
	await recordToggles(page);
	await button(page, "Filters").click();
	await expect(dialog(page, "Filters")).toBeVisible();
	await button(page, "Filters").click();
	await expect(dialog(page, "Filters")).toBeHidden();
	expect(await toggles(page)).toEqual(["open", "closed"]);
});

test("trigger has aria-expanded, aria-controls, and aria-haspopup; content is a dialog", async ({ page }) => {
	await openStory(page, "basic");
	const trigger = button(page, "Filters");
	await expect(trigger).toHaveAttribute("aria-expanded", "false");
	await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
	await expect(trigger).toHaveAttribute("type", "button");

	await trigger.click();
	const content = dialog(page, "Filters");
	await expect(trigger).toHaveAttribute("aria-expanded", "true");
	await expect(trigger).toHaveAttribute("aria-controls", (await content.getAttribute("id"))!);
	await expect(content).toHaveAttribute("tabindex", "-1");

	await page.keyboard.press("Escape");
	await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("aria-controls points at the content only while it is mounted", async ({ page }) => {
	await openStory(page, "controlled");
	const trigger = button(page, "Jobs");
	await expect(trigger).not.toHaveAttribute("aria-controls");
	await trigger.click();
	await expect(trigger).toHaveAttribute("aria-controls", (await dialog(page, "Jobs").getAttribute("id"))!);
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Jobs")).toHaveCount(0);
	await expect(trigger).not.toHaveAttribute("aria-controls");
});

test("a disabled trigger never opens", async ({ page }) => {
	await openStory(page, "disabled-trigger");
	const trigger = button(page, "Comment");
	const triggerBox = await box(trigger);
	await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
	await page.waitForTimeout(100);
	expect(await dialog(page, "Comment").isVisible()).toBe(false);
	await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
// #endregion open and close

// #region focus
test("open moves focus to the first tabbable element, even from a focused input", async ({ page }) => {
	await openStory(page, "basic");
	// WebKit does not focus a button on click. Without the added tabIndex, focus would stay in this input.
	await page.getByRole("textbox", { name: "Before input" }).focus();
	await button(page, "Filters").click();
	await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
});

test("the trigger gets tabIndex 0 only in WebKit, where a click does not focus a button", async ({
	page,
	browserName,
}) => {
	await openStory(page, "basic");
	const trigger = button(page, "Filters");
	if (browserName === "webkit") await expect(trigger).toHaveAttribute("tabindex", "0");
	else await expect(trigger).not.toHaveAttribute("tabindex");
	await trigger.click();
	await trigger.click();
	await expect(dialog(page, "Filters")).toBeHidden();
	await expect(trigger).toBeFocused();
});

test("with nothing tabbable inside, the content takes focus", async ({ page }) => {
	await openStory(page, "no-tabbable");
	await button(page, "Info").click();
	await expect(dialog(page, "Info")).toBeFocused();
});

test("data-autofocus=true and the autofocus attribute pick the first focus", async ({ page }) => {
	await openStory(page, "autofocus");
	await button(page, "Data autofocus").click();
	await expect(page.getByRole("textbox", { name: "Data target" })).toBeFocused();
	await page.keyboard.press("Escape");
	await button(page, "Attribute autofocus").click();
	await expect(page.getByRole("textbox", { name: "Attribute target" })).toBeFocused();
});

test("Escape closes and moves focus back to the trigger", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Filters")).toBeHidden();
	await expect(button(page, "Filters")).toBeFocused();
});

test("Dismiss closes and moves focus back to the trigger; a prevented click keeps it open", async ({ page }) => {
	await openStory(page, "dismiss");
	await button(page, "Default icon").click();
	await button(page, "Dismiss popup").click();
	await expect(dialog(page, "Default icon")).toBeHidden();
	await expect(button(page, "Default icon")).toBeFocused();

	await button(page, "Custom text").click();
	await button(page, "Close").click();
	await expect(dialog(page, "Custom text")).toBeHidden();
	await expect(button(page, "Custom text")).toBeFocused();

	await button(page, "Prevented").click();
	await button(page, "Stay").click();
	await expect(dialog(page, "Prevented")).toBeVisible();
});

test("Shift+Tab from the first element goes to the trigger and keeps the popover open", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(button(page, "Filters")).toBeFocused();
	await expect(dialog(page, "Filters")).toBeVisible();
});

test("Tab out of the last element closes, and focus lands after the trigger", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	await button(page, "Apply").focus();
	await page.keyboard.press("Tab");
	await expect(button(page, "After")).toBeFocused();
	await expect(dialog(page, "Filters")).toBeHidden();
});
// #endregion focus

// #region outside
test("an outside click closes, and the clicked element keeps focus", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	// An input, because WebKit does not focus a clicked button.
	await page.getByRole("textbox", { name: "Before input" }).click();
	await expect(dialog(page, "Filters")).toBeHidden();
	await expect(page.getByRole("textbox", { name: "Before input" })).toBeFocused();
});

test("a click on the page background closes without moving focus to the trigger", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	await page.mouse.click(10, 700);
	await expect(dialog(page, "Filters")).toBeHidden();
	await expect(button(page, "Filters")).not.toBeFocused();
});

test("a drag from inside to outside does not close", async ({ page }) => {
	await openStory(page, "no-tabbable");
	await button(page, "Info").click();
	const contentBox = await box(dialog(page, "Info"));
	await page.mouse.move(contentBox.x + 10, contentBox.y + contentBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(10, 700, { steps: 4 });
	await page.mouse.up();
	await page.waitForTimeout(100);
	await expect(dialog(page, "Info")).toBeVisible();
});

test("a right click outside closes", async ({ page }) => {
	await openStory(page, "basic");
	await button(page, "Filters").click();
	await page.mouse.click(10, 700, { button: "right" });
	await expect(dialog(page, "Filters")).toBeHidden();
});
// #endregion outside

// #region placement
test("placement and gutter match Ariakit for every placement", async ({ page }) => {
	await openStory(page, "ariakit-parity");
	for (const gutter of [4, 10]) {
		if (gutter === 10) await button(page, "Gutter 4").click();
		await expect(button(page, `Gutter ${gutter}`)).toBeVisible();
		for (const cell of await page.locator(".story-parity-cell").all()) {
			const placement = await cell.getAttribute("data-placement");
			const offsets: Record<string, { x: number; y: number }> = {};
			for (const kind of ["native", "ariakit"]) {
				const triggerBox = await box(cell.locator(`.story-parity-trigger[data-kind="${kind}"]`));
				const contentBox = await box(
					page.locator(`.story-Popover[data-kind="${kind}"]`, { hasText: new RegExp(`^${placement}$`) }),
				);
				offsets[kind] = { x: contentBox.x - triggerBox.x, y: contentBox.y - triggerBox.y };
			}
			const message = `${placement}, gutter ${gutter}`;
			expect(Math.abs(offsets.native!.x - offsets.ariakit!.x), message).toBeLessThanOrEqual(0.5);
			expect(Math.abs(offsets.native!.y - offsets.ariakit!.y), message).toBeLessThanOrEqual(0.5);
		}
	}
});

test("the popover flips near a viewport edge", async ({ page }) => {
	await openStory(page, "flips");
	const bottomTrigger = await box(button(page, "Bottom edge"));
	const bottomContent = await box(dialog(page, "Bottom edge"));
	expect(bottomContent.y + bottomContent.height).toBeLessThanOrEqual(bottomTrigger.y - 4 + 0.5);

	const rightTrigger = await box(button(page, "Right edge"));
	const rightContent = await box(dialog(page, "Right edge"));
	const viewport = page.viewportSize()!;
	expect(rightContent.x + rightContent.width).toBeLessThanOrEqual(viewport.width);
	// bottom-start flips to bottom-end: the content ends at the trigger's right edge.
	expect(Math.abs(rightContent.x + rightContent.width - (rightTrigger.x + rightTrigger.width))).toBeLessThanOrEqual(
		0.5,
	);
	expect(rightContent.y).toBeGreaterThanOrEqual(rightTrigger.y + rightTrigger.height);
});

test("a shifted popover keeps overflowPadding from the viewport edge, like Ariakit", async ({ page }) => {
	await openStory(page, "overflow-padding");
	const viewport = page.viewportSize()!;

	// The default is 8px, like Ariakit. The trigger sits 4px from the edge, so the centered popover
	// must shift, and it stops 8px from the edge.
	const padded = await box(dialog(page, "Default padding"));
	expect(Math.abs(viewport.width - (padded.x + padded.width) - 8)).toBeLessThanOrEqual(0.5);

	const flush = await box(dialog(page, "No padding"));
	expect(Math.abs(viewport.width - (flush.x + flush.width))).toBeLessThanOrEqual(0.5);

	// A popover on the right side shifts up from the bottom edge the same way.
	const side = await box(dialog(page, "Right side"));
	expect(Math.abs(viewport.height - (side.y + side.height) - 8)).toBeLessThanOrEqual(0.5);
});
// #endregion placement

// #region controlled
test("StrictMode controlled open and close through setOpen", async ({ page }) => {
	await openStory(page, "strict-controlled");
	await button(page, "Jobs").click();
	await expect(dialog(page, "Jobs")).toBeVisible();
	await expect(dialog(page, "Jobs")).toHaveCount(1);
	await button(page, "Outside").click();
	await expect(dialog(page, "Jobs")).toHaveCount(0);
	await expect(page.getByTestId("requests")).toHaveText("open,closed");
});

test("a controlled parent can refuse a close, and setOpen still hears it", async ({ page, browserName }) => {
	await openStory(page, "controlled");
	await page.getByRole("checkbox", { name: "Refuse close" }).check();
	await button(page, "Jobs").click();
	await button(page, "Outside").click();
	// Chromium and Firefox focus the clicked button, so the outside press asks twice: once for the
	// focus move and once for the click. WebKit does not focus it, so only the click asks.
	const outsideCloses = browserName === "webkit" ? ",closed" : ",closed,closed";
	await expect(page.getByTestId("requests")).toHaveText(`open${outsideCloses}`);
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("requests")).toHaveText(`open${outsideCloses},closed`);
	await expect(dialog(page, "Jobs")).toBeVisible();
	expect(await page.locator(".np-PopoverPositioner").evaluate((node) => node.matches(":popover-open"))).toBe(true);
});

test("a close applied by the parent moves focus back to the trigger", async ({ page }) => {
	await openStory(page, "controlled");
	await button(page, "Jobs").click();
	await button(page, "Done").click();
	await expect(dialog(page, "Jobs")).toHaveCount(0);
	await expect(button(page, "Jobs")).toBeFocused();
});
// #endregion controlled

// #region layers
test("a tooltip inside: Escape closes the tooltip first, then the popover", async ({ page }) => {
	await openStory(page, "tooltip-inside");
	await button(page, "Jobs").click();
	await expect(dialog(page, "Jobs")).toBeVisible();
	await button(page, "Retry").hover();
	await expect(page.getByRole("tooltip")).toHaveText("Retry this job");

	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(dialog(page, "Jobs")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog(page, "Jobs")).toBeHidden();
	await expect(button(page, "Jobs")).toBeFocused();
});

test("a tooltip on the trigger does not stop the click from opening the popover", async ({ page }) => {
	await openStory(page, "tooltip-inside");
	await button(page, "Jobs").hover();
	await expect(page.getByRole("tooltip")).toHaveText("Open the jobs");
	await button(page, "Jobs").click();
	await expect(dialog(page, "Jobs")).toBeVisible();
	// Focus moved into the popover, so the trigger tooltip closed.
	await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("nested popovers open and close in order", async ({ page }) => {
	await openStory(page, "nested");
	await button(page, "Parent").click();
	await button(page, "Child").click();
	await expect(dialog(page, "Child")).toBeVisible();

	// A click in the child keeps both. A click in the parent closes only the child.
	await button(page, "Child action").click();
	await expect(dialog(page, "Child")).toBeVisible();
	await expect(dialog(page, "Parent")).toBeVisible();
	await page.getByText("Parent text").click();
	await expect(dialog(page, "Child")).toBeHidden();
	await expect(dialog(page, "Parent")).toBeVisible();

	// Escape closes the child, then the parent, each moving focus to its own trigger.
	await button(page, "Child").click();
	await expect(button(page, "Child action")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Child")).toBeHidden();
	await expect(button(page, "Child")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Parent")).toBeHidden();
	await expect(button(page, "Parent")).toBeFocused();

	// An outside click closes both.
	await button(page, "Parent").click();
	await button(page, "Child").click();
	await button(page, "Outside").click();
	await expect(dialog(page, "Child")).toBeHidden();
	await expect(dialog(page, "Parent")).toBeHidden();
});

test("a parent close also closes a tooltip open inside it", async ({ page }) => {
	await openStory(page, "parent-close-tooltip");
	await button(page, "Link").click();
	await button(page, "Save later").click();
	// Put focus on the trigger first. Then the close moves no focus, and a focus change cannot close the tooltip.
	await button(page, "Link").focus();
	await expect(dialog(page, "Link")).toBeVisible();
	await page.getByText("Hint").hover();
	await expect(page.getByRole("tooltip")).toHaveText("Paste a URL");

	await expect(dialog(page, "Link")).toBeHidden();
	// The tooltip unmounts only when it closes. The hidden anchor leaves the pointer, and every browser
	// sends pointerleave for that, so the tooltip closes by itself.
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(button(page, "Link")).toBeFocused();
});

test("an input that uses Escape first keeps the popover open", async ({ page }) => {
	await openStory(page, "escape-owner");
	await button(page, "Search").click();
	const query = page.getByRole("textbox", { name: "Query" });
	await expect(query).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(query).toHaveValue("");
	await expect(dialog(page, "Search")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Search")).toBeHidden();
	await expect(button(page, "Search")).toBeFocused();
});

for (const story of ["in-dialog", "in-ariakit-dialog"]) {
	test(`${story}: the first Escape closes only the popover`, async ({ page }) => {
		await openStory(page, story);
		await button(page, "Open dialog").click();
		const settings = dialog(page, "Settings");
		await expect(settings).toBeVisible();
		await button(page, "Options").click();
		await expect(button(page, "Option")).toBeFocused();

		await page.keyboard.press("Escape");
		await expect(dialog(page, "Options")).toBeHidden();
		await expect(settings).toBeVisible();
		await expect(button(page, "Options")).toBeFocused();

		await page.keyboard.press("Escape");
		await expect(settings).toBeHidden();
	});
}

test("a modal opened from inside the popover keeps it open under the modal, like Ariakit", async ({ page }) => {
	await openStory(page, "ariakit-dialog-from-popover");
	const trigger = button(page, "Notifications");
	const notifications = dialog(page, "Notifications");
	const progress = dialog(page, "Progress");
	await trigger.click();
	// Open by keyboard: WebKit does not focus a clicked button, and then the modal has no element
	// to return focus to.
	await button(page, "View progress").focus();
	await page.keyboard.press("Enter");
	await expect(progress).toBeVisible();
	await expect(button(page, "Close")).toBeFocused();
	// The modal made the popover inert. It stays open, but hidden, so the top layer does not paint it
	// above the modal.
	await expect(trigger).toHaveAttribute("aria-expanded", "true");
	await expect(notifications).toBeHidden();

	await page.keyboard.press("Escape");
	await expect(progress).toBeHidden();
	await expect(notifications).toBeVisible();
	await expect(button(page, "View progress")).toBeFocused();

	// A click outside the modal closes only the modal.
	await button(page, "View progress").click();
	await expect(progress).toBeVisible();
	await page.mouse.click(5, 5);
	await expect(progress).toBeHidden();
	await expect(notifications).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(notifications).toBeHidden();
	await expect(trigger).toBeFocused();
});
// #endregion layers

// #region mounting
test("unmountOnHide: kept content stays hidden in the DOM; unmounted content leaves it", async ({ page }) => {
	await openStory(page, "keep-mounted");
	await expect(page.locator('[role="dialog"][aria-label="Kept"]')).toHaveCount(1);
	await expect(page.locator('[role="dialog"][aria-label="Kept"]')).toBeHidden();
	await expect(page.locator('[role="dialog"][aria-label="Unmounted"]')).toHaveCount(0);

	await button(page, "Unmounted").click();
	await expect(dialog(page, "Unmounted")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.locator('[role="dialog"][aria-label="Unmounted"]')).toHaveCount(0);
});

test("a hidden container hides the popover too, because it keeps its DOM parent", async ({ page }) => {
	await openStory(page, "hidden-container");
	await expect(dialog(page, "Link")).toBeVisible();
	await page.getByRole("combobox", { name: "Hide" }).selectOption("visibility");
	await expect(page.locator('[role="dialog"][aria-label="Link"]')).toBeHidden();
	await page.getByRole("combobox", { name: "Hide" }).selectOption("display");
	await expect(page.locator('[role="dialog"][aria-label="Link"]')).toBeHidden();
	await page.getByRole("combobox", { name: "Hide" }).selectOption("none");
	await expect(dialog(page, "Link")).toBeVisible();
});

test("a region the app turns off with hidden and inert is not a modal: outside clicks and Escape still close", async ({
	page,
}) => {
	await openStory(page, "inert-container");
	// The trigger is hidden while the region is off, so the role query must include hidden elements.
	const link = page.getByRole("button", { name: "Link", exact: true, includeHidden: true });
	const container = page.getByTestId("container");

	await link.click();
	await page.getByRole("button", { name: "Turn off the toolbar" }).click();
	await expect(container).toBeHidden();
	await expect(link).toHaveAttribute("aria-expanded", "true");
	await page.mouse.click(5, 300);
	await expect(link).toHaveAttribute("aria-expanded", "false");

	await page.getByRole("button", { name: "Turn on the toolbar" }).click();
	await link.click();
	await page.getByRole("button", { name: "Turn off the toolbar" }).click();
	await expect(container).toBeHidden();
	await page.keyboard.press("Escape");
	await expect(link).toHaveAttribute("aria-expanded", "false");

	// The popover stays closed when the region comes back.
	await page.getByRole("button", { name: "Turn on the toolbar" }).click();
	await expect(page.locator('[role="dialog"][aria-label="Link"]')).toBeHidden();
});
// #endregion mounting
