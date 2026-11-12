import * as path from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		"compile-compat": "scripts/compile-compat.ts",
		"generate-protocols": "scripts/generate-protocols.ts",
		"generate-models": "scripts/generate-models.ts",
		"proto-parser": "scripts/proto-parser.ts",
	},
	outDir: "dist-scripts",
	format: ["esm"],
	target: "node24",
	platform: "node",
	clean: true,
	dts: false,
	sourcemap: false,
	splitting: true,
	external: ["@bgotink/kdl", "yaml"],
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
