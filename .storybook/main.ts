import type { StorybookConfig } from "@storybook/react-vite";

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
};

export default config;
