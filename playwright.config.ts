import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	use: {
		baseURL: "http://127.0.0.1:6116",
		browserName: "chromium",
		trace: "on-first-retry",
	},
	webServer: {
		command: "pnpm exec storybook dev -p 6116 --ci",
		url: "http://127.0.0.1:6116",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
