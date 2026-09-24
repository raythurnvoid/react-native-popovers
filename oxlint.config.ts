import { defineConfig } from "oxlint";

/**
 * A small version of the t3-chat app config (packages/app/oxlint.config.ts and oxlint.rules.json).
 * The correctness category covers the ESLint recommended rules. The React rules below are the
 * React Compiler checks, so code in this repo stays safe to compile with it.
 */
export default defineConfig({
	$schema: "./node_modules/oxlint/configuration_schema.json",
	plugins: ["react", "typescript", "import"],
	categories: {
		correctness: "error",
	},
	options: {
		typeAware: true,
	},
	env: {
		builtin: true,
		browser: true,
	},
	ignorePatterns: ["references", "storybook-static", "test-results", "playwright-report"],
	// These React Compiler rules are not in Oxlint yet. The native `react/*` rules cover the rest.
	// eslint-plugin-react-hooks 7.1 no longer has `automatic-effect-dependencies` or `fire`, which t3-chat still lists.
	jsPlugins: [{ name: "react-hooks-js", specifier: "eslint-plugin-react-hooks" }],
	rules: {
		"no-unused-vars": "off",
		"typescript/await-thenable": "error",
		"typescript/no-misused-promises": ["error", { checksVoidReturn: false }],
		"typescript/no-redundant-type-constituents": "error",
		"typescript/no-unsafe-unary-minus": "error",
		"typescript/restrict-plus-operands": "error",
		"typescript/unbound-method": "error",
		"import/extensions": ["error", "ignorePackages"],
		"no-console": ["error", { allow: ["debug", "info", "error", "warn"] }],
	},
	overrides: [
		{
			files: ["src/**/*.{ts,tsx}"],
			rules: {
				"react/rules-of-hooks": "error",
				"react/exhaustive-deps": "off",
				"react/static-components": "error",
				"react/use-memo": "error",
				"react/void-use-memo": "error",
				"react/preserve-manual-memoization": "error",
				"react/incompatible-library": "warn",
				"react/immutability": "error",
				"react/globals": "error",
				"react/refs": "error",
				"react/set-state-in-effect": "off",
				"react/error-boundaries": "error",
				"react/purity": "error",
				"react/set-state-in-render": "error",
				"react/unsupported-syntax": "error",
				"react/capitalized-calls": "error",
				"react/hooks": "error",
				"react/invariant": "error",
				"react/no-deriving-state-in-effects": "error",
				"react/rule-suppression": "error",
				"react/syntax": "error",
				"react/todo": "error",
				"react/only-export-components": ["error", { allowConstantExport: true }],
				"react-hooks-js/component-hook-factories": "error",
				"react-hooks-js/config": "error",
				"react-hooks-js/fbt": "error",
				"react-hooks-js/gating": "error",
				"react-hooks-js/memoized-effect-dependencies": "error",
			},
		},
	],
});
