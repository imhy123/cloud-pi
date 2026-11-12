import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runProvenance } from "../../../../../scripts/provenance-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const newFiles = new Set([
	"package.json",
	"README.md",
	"README_cn.md",
	"PATCHES.md",
	"PATCHES_cn.md",
	"THIRD-PARTY-NOTICES.md",
	"src/bun-compat.ts",
	"src/natives-path.ts",
	"test/env.test.ts",
	"test/sqlite.test.ts",
]);
const changes = {
	"test/env.test.ts": "Import purity and explicit environment bootstrap regressions.",
	"test/sqlite.test.ts": "Node SQLite contention, bounded retry, and corruption recovery regressions.",
	"package.json": "Private Node.js workspace metadata replaces the upstream Bun package manifest.",
	"src/index.ts": "Curated TUI + catalog facade, including explicit host environment initialization.",
	"src/dirs.ts": "Node import of the package manifest, cloud-pi identity, and a local Windows path shim.",
	"src/env.ts": "Node environment access; dotenv loading and sanitization require explicit initializeEnvironment().",
	"src/sqlite.ts": "Node SQLite adapter with bounded BUSY waits/retries; native locks and salvage helpers are omitted.",
	"src/tls-fetch.ts": "Pass-through wrapper; Node owns NODE_EXTRA_CA_CERTS trust.",
	"src/fetch-retry.ts": "Bun timeout extension is accepted but not forwarded.",
	"src/temp.ts": "Bun.gc and Bun.sleep use Node fallbacks.",
	"src/test-runtime.ts": "process.env and process.argv[1] replace Bun env/main.",
	"src/postmortem.ts": "Bun.inspect, Bun.sleep, and Bun.isMainThread come from the Node shim.",
	"src/which.ts": "Node PATH lookup replaces Bun.which; macOS toolchain fallback is unchanged.",
	"src/worker-host.ts": "process.argv[1] replaces Bun.main.",
	"src/sanitize-text.ts": "ANSI stripping is implemented locally.",
	"src/tab-spacing.ts": "Local glob matching replaces Bun.Glob.",
	"src/bun-compat.ts": "Node stand-ins for the Bun globals the retained utility sources use.",
	"src/natives-path.ts": "Pure JavaScript Windows path shim for the removed pi-natives dependency.",
};

runProvenance({
	root,
	name: "@oh-my-pi/pi-utils",
	tag: "vendor",
	roots: ["src", "test", "LICENSE", "package.json", "README.md", "README_cn.md", "PATCHES.md", "PATCHES_cn.md", "THIRD-PARTY-NOTICES.md"],
	mapUpstream: file => {
		if (file === "LICENSE") return "packages/utils/LICENSE";
		if (file.startsWith("src/")) return `packages/utils/${file}`;
		return null;
	},
	newFiles,
	changes,
	skip: [/^scripts\//],
});
