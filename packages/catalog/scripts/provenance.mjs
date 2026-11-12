import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runProvenance } from "../../../scripts/provenance-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runProvenance({
	root,
	name: "@cloud-pi/catalog",
	tag: "catalog",
	roots: [
		"src",
		"scripts",
		"test",
		"bench",
		"LICENSE",
		"README.md",
		"README_cn.md",
		"PATCHES.md",
		"PATCHES_cn.md",
		"THIRD-PARTY-NOTICES.md",
		"CHANGELOG.md",
		"package.json",
	],
	mapUpstream: file => {
		if (["LICENSE", "README.md", "CHANGELOG.md"].includes(file)) return `packages/catalog/${file}`;
		if (file.startsWith("test/integration/")) {
			return `packages/catalog/test/${file.slice("test/integration/".length)}`;
		}
		if (file.startsWith("src/") || file.startsWith("scripts/") || file.startsWith("test/") || file.startsWith("bench/")) {
			return `packages/catalog/${file}`;
		}
		return null;
	},
	newFiles: new Set([
		"package.json",
		"README_cn.md",
		"PATCHES.md",
		"PATCHES_cn.md",
		"THIRD-PARTY-NOTICES.md",
		"scripts/provenance.mjs",
		"scripts/generation-host.ts",
		"test/generation-host.test.ts",
		"scripts/clean-dts.mjs",
		"scripts/test-dist.mjs",
		"scripts/clean-dts.mjs",
		"test/helpers/http-server.ts",
		"test/helpers/vitest-clock.ts",
		"test/setup.ts",
	]),
	changes: {
		"scripts/generation-host.ts": "Explicit typed programmatic and local ESM host services for live generation.",
		"test/generation-host.test.ts": "Injected credentials, discovery preparation, async GitLab, fallback, and host loading regressions.",
		"package.json": "cloud-pi package identity and Node.js build/test scripts replace the upstream Bun manifest.",
		"README.md": "Upstream catalog documentation with cloud-pi Node port commands, build, and install notes.",
		"src/model-cache.ts": "node:sqlite adapter, deterministic Node hash, and cache schema v16 replace Bun sqlite/hash.",
		"src/model-manager.ts": "Deterministic Node hash and merge-v6 fingerprint version.",
		"src/provider-models/openai-compat.ts": "process.env and node:zlib zstd replace Bun.env and Bun.zstdDecompress.",
		"src/provider-models/cache-provider-id.ts": "process.env and deterministic Node hash replace Bun APIs.",
		"src/provider-models/special.ts": "process.env and deterministic Node hash replace Bun.env and Bun.hash.",
		"src/wire/factory-droid.ts": "Deterministic Node hash replaces Bun.hash.",
		"src/compat/collapse.ts": "node:util isDeepStrictEqual replaces Bun.deepEquals.",
		"src/discovery/gitlab-duo-workflow.ts": "process.env replaces Bun.env.",
		"src/discovery/protobuf.ts": "Buffer base64 replaces Uint8Array.toBase64.",
		"src/provider-models/google.ts": "Dropped the Bun-only global fetch preconnect fallback.",
		"scripts/compile-compat.ts": "Node fs and fileURLToPath replace Bun.write and import.meta.dir.",
		"scripts/compat-compiler/index.ts": "node:fs readFile replaces Bun.file.",
		"scripts/generate-protocols.ts": "Node fs.globSync and fs read/write replace Bun.Glob/Bun.file/Bun.write.",
		"scripts/proto-parser.ts": "Node fs.globSync and fs read/write replace Bun.Glob/Bun.file/Bun.write.",
		"scripts/generate-models.ts": "Node fs/argv and explicit programmatic/CLI host injection replace pi-ai imports.",
		"bench/classify.bench.ts": "performance.now replaces Bun.nanoseconds.",
		"test/helpers/http-server.ts": "Node http server replaces Bun.serve for Cursor discovery tests.",
		"test/helpers/vitest-clock.ts": "Vitest adapter for Bun's setSystemTime.",
		"test/compat-parity.test.ts": "Vitest and Node equality adaptation; 30s budget for the full catalog parity sweep.",
		"test/setup.ts": "Per-worker HOME/XDG isolation so catalog tests never write the real cloud-pi config root.",
	},
	skip: [/^scripts\/provenance\.mjs$/],
	headerless: new Set([
		"src/compat/auth-ids.ts",
		"src/compat/provider-ids.ts",
		"src/discovery/cursor-proto.ts",
		"src/discovery/devin-proto.ts",
	]),
});
