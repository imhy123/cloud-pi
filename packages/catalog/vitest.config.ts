import * as path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const src = (name: string) => path.resolve(root, "src", name);

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@cloud-pi\/catalog$/, replacement: src("index.ts") },
			{ find: /^@cloud-pi\/catalog\/(.*)$/, replacement: src("$1") },
			{ find: /^@oh-my-pi\/pi-utils$/, replacement: path.resolve(root, "../vendor/omp/pi-utils/src/index.ts") },
			{ find: /^@oh-my-pi\/pi-utils\/(.*)$/, replacement: path.resolve(root, "../vendor/omp/pi-utils/src/$1") },
			{ find: /^@oh-my-pi\/omptype$/, replacement: path.resolve(root, "../vendor/omp/omptype/src/index.ts") },
			{ find: /^@oh-my-pi\/omptype\/(.*)$/, replacement: path.resolve(root, "../vendor/omp/omptype/src/$1") },
		],
	},
	test: {
		environment: "node",
		include: ["test/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
