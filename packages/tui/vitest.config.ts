import * as path from "node:path";
import { defineConfig } from "vitest/config";

// The sources import the upstream workspace packages by their published names.
// Tests run against `src` directly, so the same mounts tsup applies have to be
// visible to Vite's resolver.
const root = import.meta.dirname;
const vendor = (name: string) => path.resolve(root, "src/vendor/pi-utils", name);
const compat = (name: string) => path.resolve(root, "src/compat", name);

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@oh-my-pi\/pi-utils$/, replacement: vendor("index.ts") },
			{ find: /^@oh-my-pi\/pi-utils\/(.*)$/, replacement: path.resolve(root, "src/vendor/pi-utils/$1") },
			{ find: /^@oh-my-pi\/pi-natives$/, replacement: compat("natives.ts") },
			{ find: /^@oh-my-pi\/pi-natives\/(.*)$/, replacement: compat("natives-$1.ts") },
			{ find: /^@oh-my-pi\/pi-ai$/, replacement: compat("pi-ai.ts") },
			{ find: /^@oh-my-pi\/pi-agent-core$/, replacement: compat("pi-agent-core.ts") },
		],
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
