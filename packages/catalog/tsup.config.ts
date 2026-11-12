import * as path from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/*.ts",
		"src/compat/*.ts",
		"src/discovery/*.ts",
		"src/identity/*.ts",
		"src/provider-models/*.ts",
		"src/wire/*.ts",
		"!src/**/*.d.json.ts",
	],
	format: ["esm"],
	target: "node24",
	platform: "node",
	splitting: true,
	clean: true,
	dts: { resolve: true },
	sourcemap: true,
	treeshake: true,
	external: ["yaml", "@bgotink/kdl"],
	noExternal: [/^@oh-my-pi\//],
	esbuildOptions(options) {
		options.alias = {
			"@oh-my-pi/pi-utils": path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src/index.ts"),
			"@oh-my-pi/pi-utils/logger": path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src/logger.ts"),
			"@oh-my-pi/pi-utils/lru": path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src/lru.ts"),
			"@oh-my-pi/pi-utils/type-guards": path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src/type-guards.ts"),
			"@oh-my-pi/omptype": path.resolve(import.meta.dirname, "../vendor/omp/omptype/src/index.ts"),
		};
	},
});
