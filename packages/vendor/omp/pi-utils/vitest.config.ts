import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		env: { PI_TEST_RUNTIME: "1" },
		include: ["test/**/*.test.ts"],
	},
});
