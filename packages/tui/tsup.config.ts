import * as path from "node:path";
import { defineConfig } from "tsup";

const vendor = (name: string) => path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src", name);

export default defineConfig({
	entry: {
		index: "src/index.ts",
		theme: "src/theme/index.ts",
		components: "entries/components.ts",
		render: "src/render/index.ts",
		image: "entries/image.ts",
		notifications: "entries/notifications.ts",
		multiplexers: "entries/multiplexers.ts",
		keys: "src/keys.ts",
		"render-worker-entry": "src/compat/render-worker-entry.ts",
	},
	format: ["esm"],
	target: "node24",
	platform: "node",
	splitting: true,
	clean: true,
	dts: true,
	sourcemap: true,
	treeshake: true,
	inject: [path.resolve(import.meta.dirname, "src/compat/bun.ts")],
	esbuildOptions(options) {
		options.alias = {
			"@oh-my-pi/pi-utils": vendor("index.ts"),
			"@oh-my-pi/pi-utils/chalk": vendor("chalk.ts"),
			"@oh-my-pi/pi-utils/color": vendor("color.ts"),
			"@oh-my-pi/pi-utils/dirs": vendor("dirs.ts"),
			"@oh-my-pi/pi-utils/env": vendor("env.ts"),
			"@oh-my-pi/pi-utils/fs-error": vendor("fs-error.ts"),
			"@oh-my-pi/pi-utils/logger": vendor("logger.ts"),
			"@oh-my-pi/pi-utils/loop-phase": vendor("loop-phase.ts"),
			"@oh-my-pi/pi-utils/lru": vendor("lru.ts"),
			"@oh-my-pi/pi-utils/marked": vendor("marked.ts"),
			"@oh-my-pi/pi-utils/marked-list": vendor("marked-list.ts"),
			"@oh-my-pi/pi-utils/math-delimiters": vendor("math-delimiters.ts"),
			"@oh-my-pi/pi-utils/postmortem": vendor("postmortem.ts"),
			"@oh-my-pi/pi-utils/stderr-guard": vendor("stderr-guard.ts"),
			"@oh-my-pi/pi-utils/type-guards": vendor("type-guards.ts"),
			"@oh-my-pi/pi-utils/yaml-config": vendor("yaml-config.ts"),
			"@oh-my-pi/pi-natives": path.resolve(import.meta.dirname, "src/compat/natives.ts"),
			"@oh-my-pi/pi-natives/path": path.resolve(import.meta.dirname, "../vendor/omp/pi-utils/src/natives-path.ts"),
			"@oh-my-pi/pi-ai": path.resolve(import.meta.dirname, "src/compat/pi-ai.ts"),
			"@oh-my-pi/pi-agent-core": path.resolve(import.meta.dirname, "src/compat/pi-agent-core.ts"),
		};
	},
});
