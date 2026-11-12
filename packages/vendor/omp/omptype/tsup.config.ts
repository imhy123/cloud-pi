import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/*.ts", "src/jsonschema/*.ts"],
	format: ["esm"],
	target: "node24",
	platform: "node",
	splitting: true,
	clean: true,
	dts: true,
	sourcemap: true,
	treeshake: true,
});
