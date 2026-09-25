import { chromium, type FullConfig } from "@playwright/test";

/**
 * Load one story of each stories file once, before the tests start.
 *
 * After a source change, Storybook's first load of a stories file waits while Vite compiles it.
 * Every worker asks for it at once, and a test's first `page.goto` can then pass its 30 s timeout.
 * Playwright starts the web server before this runs.
 */
export default async function warmUp(config: FullConfig) {
	const { baseURL } = config.projects[0]!.use;
	const browser = await chromium.launch();
	const page = await browser.newPage();

	for (const id of ["menu--basic", "popover--basic", "tooltip--hover-delay"]) {
		await page.goto(`${baseURL}/iframe.html?id=${id}&viewMode=story`, { timeout: 180_000 });
		await page.locator("#storybook-root > *").first().waitFor({ timeout: 180_000 });
	}

	await browser.close();
}
