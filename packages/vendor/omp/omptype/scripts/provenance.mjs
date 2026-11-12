import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runProvenance } from "../../../../../scripts/provenance-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runProvenance({
	root,
	name: "@oh-my-pi/omptype",
	tag: "vendor",
	roots: ["src", "test", "LICENSE", "README.md", "package.json"],
	mapUpstream: file => {
		if (file === "LICENSE" || file === "README.md") return `packages/omptype/${file}`;
		if (file === "test/infer.type-test.ts") return "packages/omptype/test/infer.test.ts";
		if (file.startsWith("src/") || file.startsWith("test/")) return `packages/omptype/${file}`;
		return null;
	},
	newFiles: new Set(["package.json", "test/helpers", "test/infer.type-test.ts"]),
	changes: {
		"package.json": "Private Node.js workspace metadata replaces the upstream Bun package manifest.",
		"src/infer.ts": "Bun.FormDataEntryValue replaced with the DOM string | File type.",
		"src/keywords.ts": "Bun.FormDataEntryValue replaced with the DOM string | File type.",
		"test/json-schema-suite.test.ts": "Vitest plus Node fs/JSON loading replace bun:test and Bun.Glob/Bun.file.",
		"test/infer.type-test.ts": "Type-only assertions renamed out of the runtime suite; assertions unchanged.",
	},
	skip: [/^scripts\//],
});
