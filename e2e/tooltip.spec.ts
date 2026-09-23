import { expect, test, type Locator, type Page } from "@playwright/test";

async function openStory(page: Page, id: string) {
	await page.goto(`/iframe.html?id=${id}&viewMode=story`);
	await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

async function tooltip(page: Page) {
	return page.getByRole("tooltip");
}

test("content stays unmounted until the tooltip opens", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	await expect(await tooltip(page)).toHaveCount(0);
});

test("hover waits for the delay and cancels when the pointer leaves", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await save.hover();
	await page.waitForTimeout(150);
	await expect(await tooltip(page)).toHaveCount(0);
	await page.mouse.move(0, 0);
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);

	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	await expect(await tooltip(page)).toHaveText(/Saved/);
});

test("pointerdown and scroll cancel a pending hover", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await save.hover();
	await save.dispatchEvent("pointerdown", { pointerType: "mouse", bubbles: true });
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);

	await page.mouse.move(0, 0);
	await save.hover();
	await page.evaluate(() => {
		window.dispatchEvent(new Event("scroll"));
	});
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);
});

test("touch does not open and a pen does", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await dispatchPointer(save, "touch");
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);

	await dispatchPointer(save, "pen");
	await expect(await tooltip(page)).toBeVisible();
});

test("focus opens with no delay and blur closes", async ({ page }) => {
	await openStory(page, "tooltip--focus-open");
	const save = page.getByRole("button", { name: "Save" });
	await save.focus();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
	await save.blur();
	await expect(await tooltip(page)).toHaveCount(0);
});

test("escape closes and the pointer does not reopen until it leaves", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	const box = await save.boundingBox();
	if (!box) throw new Error("Save button has no box");
	await page.keyboard.press("Escape");
	await expect(await tooltip(page)).toHaveCount(0);
	await page.mouse.move(box.x + 4, box.y + 4);
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);
	await page.mouse.move(0, 0);
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
});

test("moving to a second tooltip skips the delay and closes the first", async ({ page }) => {
	await openStory(page, "tooltip--two-tips");
	const save = page.getByRole("button", { name: "Save" });
	const share = page.getByRole("button", { name: "Share" });
	await save.hover();
	await expect(page.getByRole("tooltip", { name: "Saved" })).toBeVisible();
	await share.hover();
	await expect(page.getByRole("tooltip", { name: "Shared" })).toBeVisible({ timeout: 200 });
	await expect(page.getByRole("tooltip", { name: "Saved" })).toHaveCount(0);
});

test("controlled open can refuse a request", async ({ page }) => {
	await openStory(page, "tooltip--controlled-closed");
	await page.getByRole("button", { name: "Save" }).hover();
	await expect(page.getByTestId("requested")).toHaveText("open");
	await expect(await tooltip(page)).toHaveCount(0);
});

test("aria-describedby keeps the existing id and adds the tooltip id while open", async ({ page }) => {
	await openStory(page, "tooltip--described");
	const save = page.getByRole("button", { name: "Save" });
	await expect(save).toHaveAttribute("aria-describedby", "hint");
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	const describedBy = await save.getAttribute("aria-describedby");
	expect(describedBy?.split(/\s+/)).toEqual(expect.arrayContaining(["hint"]));
	expect(describedBy).toMatch(/tooltip-/);
	await page.mouse.move(0, 0);
	await expect(await tooltip(page)).toHaveCount(0);
	await expect(save).toHaveAttribute("aria-describedby", "hint");
});

test("a tooltip that just closed skips the delay", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(await tooltip(page)).toHaveCount(0);
	await save.hover();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
});

test("the skip window ends and the delay comes back", async ({ page }) => {
	await openStory(page, "tooltip--hover-delay");
	const save = page.getByRole("button", { name: "Save" });
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(await tooltip(page)).toHaveCount(0);
	await page.waitForTimeout(700);
	await save.hover();
	await page.waitForTimeout(150);
	await expect(await tooltip(page)).toHaveCount(0);
	await expect(await tooltip(page)).toBeVisible();
});

test("strict mode still opens on hover and closes on leave", async ({ page }) => {
	await openStory(page, "tooltip--strict-hover");
	const save = page.getByRole("button", { name: "Save" });
	await expect(await tooltip(page)).toHaveCount(0);
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(await tooltip(page)).toHaveCount(0);
});

test("blur close blocks the next hover until the pointer leaves", async ({ page }) => {
	await openStory(page, "tooltip--focus-open");
	const save = page.getByRole("button", { name: "Save" });
	await save.focus();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
	await save.blur();
	await expect(await tooltip(page)).toHaveCount(0);
	await save.hover();
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);
	await page.mouse.move(0, 0);
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
});

test("escape while focused stays closed until blur and focus again", async ({ page }) => {
	await openStory(page, "tooltip--focus-open");
	const save = page.getByRole("button", { name: "Save" });
	await save.focus();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
	await page.keyboard.press("Escape");
	await expect(await tooltip(page)).toHaveCount(0);
	await page.evaluate(() => {
		const active = document.activeElement;
		if (active instanceof HTMLElement) active.blur();
	});
	await save.focus();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
});

test("a controlled close blocks hover until the pointer leaves", async ({ page }) => {
	await openStory(page, "tooltip--controlled-dismiss");
	const save = page.getByRole("button", { name: "Save" });
	await expect(await tooltip(page)).toBeVisible();
	await page.getByRole("button", { name: "Close" }).click();
	await expect(await tooltip(page)).toHaveCount(0);
	await save.hover();
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toHaveCount(0);
	await page.mouse.move(0, 0);
	await save.hover();
	await expect(await tooltip(page)).toBeVisible();
});

test("a rerender during the hover delay does not restart it", async ({ page }) => {
	await openStory(page, "tooltip--rerender-during-delay");
	await page.getByRole("button", { name: "Save" }).hover();
	await page.waitForTimeout(700);
	await expect(await tooltip(page)).toBeVisible();
});

test("strict mode keeps a controlled tooltip closed after Escape", async ({ page }) => {
	await openStory(page, "tooltip--strict-controlled");
	const save = page.getByRole("button", { name: "Save" });
	await save.focus();
	await expect(await tooltip(page)).toBeVisible({ timeout: 200 });
	await page.keyboard.press("Escape");
	await expect(await tooltip(page)).toHaveCount(0);
});

test("controlled open can refuse a close request", async ({ page }) => {
	await openStory(page, "tooltip--controlled-stays-open");
	await expect(await tooltip(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("requested")).toHaveText("closed");
	await expect(await tooltip(page)).toBeVisible();
});

test("bottom-start uses the native position-area and a gutter on both block edges", async ({ page }) => {
	await openStory(page, "tooltip--placement");
	const tip = await tooltip(page);
	await expect(tip).toBeVisible();
	await expect(tip).toHaveAttribute("data-side", "bottom");
	await expect(tip).toHaveAttribute("data-align", "start");
	const style = await tip.evaluate((element) => ({
		area: element.style.getPropertyValue("position-area"),
		marginBlockStart: element.style.marginBlockStart,
		marginBlockEnd: element.style.marginBlockEnd,
		anchor: element.style.getPropertyValue("position-anchor"),
	}));
	expect(style.area).toBe("self-block-end span-self-inline-end");
	expect(style.marginBlockStart).toBe("12px");
	expect(style.marginBlockEnd).toBe("12px");
	expect(style.anchor.startsWith("--nl-")).toBe(true);
});

async function dispatchPointer(locator: Locator, pointerType: string) {
	await locator.evaluate((element, type) => {
		element.dispatchEvent(new PointerEvent("pointerover", { pointerType: type, bubbles: true }));
		element.dispatchEvent(new PointerEvent("pointermove", { pointerType: type, bubbles: true }));
	}, pointerType);
}
