import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		testTimeout: 8_000,
		maxWorkers: 2  // Limit PGlite database instances
	},
	resolve: {
		alias: {
			"#": new URL("./src", import.meta.url).pathname,
		},
	},
	define: {
		"process.env.TEST": '"true"',
	},
});
