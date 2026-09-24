import babel from "@rolldown/plugin-babel";
import type { StorybookConfig } from "@storybook/react-vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.tsx"],
	addons: ["@storybook/addon-docs"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	features: {
		actions: false,
		interactions: false,
		controls: false,
	},
	// Compile with the React Compiler, like the t3-chat app does, so the stories and the e2e tests
	// run the same code the app will run.
	viteFinal(viteConfig) {
		viteConfig.plugins = [
			...(viteConfig.plugins ?? []),
			babel({
				presets: [reactCompilerPreset({ target: "19" })],
			}),
		];
		// lightningcss 1.33, Vite's default CSS minifier, cannot parse `@container anchored(...)` yet and fails
		// the build (parcel-bundler/lightningcss#1176). esbuild keeps those rules as they are.
		viteConfig.build = { ...viteConfig.build, cssMinify: "esbuild" };
		return viteConfig;
	},
};

export default config;
