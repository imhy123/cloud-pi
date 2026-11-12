import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Provenance audit for @cloud-pi/tui sources. Read-only by default; `--write`
// rewrites headers and SOURCES.json, preserving hand-written notes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = path.join(root, "src");
const write = process.argv.includes("--write");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
const ompDir = process.env.OH_MY_PI_DIR ?? path.join(repoRoot, "..", "oh-my-pi");
const piDir = process.env.PI_DIR ?? path.join(repoRoot, "..", "pi");
const OMP_COMMIT = "e325ffc73ab86e03bdd20a91b77d8e2b3964c906";
const PI_COMMIT = execFileSync("git", ["-C", piDir, "rev-parse", "2a32a605a9"], { encoding: "utf8" }).trim();
const PREFIX = "// cloud-pi-tui: ";
const HEADER_END = "// See PATCHES.md.\n";
const piSources = new Map([
	["compat/text.ts", "packages/tui/src/utils.ts"],
	["compat/keys-engine.ts", "packages/tui/src/keys.ts"],
]);
const ompSources = new Map([["compat/mermaid-ascii.ts", "packages/utils/src/mermaid-ascii.ts"]]);

function splitHeader(text) {
	if (!text.startsWith(PREFIX)) return ["", text];
	const end = text.indexOf(HEADER_END);
	if (end < 0) throw new Error("Missing provenance header terminator");
	const length = end + HEADER_END.length;
	return [text.slice(0, length), text.slice(length)];
}

function files(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
		entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
	);
}

const previous = JSON.parse(readFileSync(path.join(root, "SOURCES.json"), "utf8")).files;
const previousByFile = new Map(previous.map(entry => [entry.file, entry]));
const gitShow = (repo, revision, source) =>
	execFileSync("git", ["-C", repo, "show", `${revision}:${source}`], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});

const manifest = [];
for (const filename of files(sources).sort()) {
	const file = path.relative(sources, filename).replaceAll("\\", "/");
	const expected = previousByFile.get(file);
	let origin;
	let source;
	let revision;
	if (expected) {
		({ origin, source } = expected);
		revision = expected.commit;
	} else if (piSources.has(file)) {
		origin = "pi";
		source = piSources.get(file);
		revision = PI_COMMIT;
	} else if (ompSources.has(file)) {
		origin = "oh-my-pi";
		source = ompSources.get(file);
		revision = OMP_COMMIT;
	} else {
		origin = "new";
	}
	const original =
		origin === "new" ? undefined : gitShow(origin === "pi" ? piDir : ompDir, revision, source);
	const text = readFileSync(filename, "utf8");
	const isSource = file.endsWith(".ts");
	const [header, body] = isSource ? splitHeader(text) : ["", text];
	const kind = origin === "new" ? "new" : isSource && body !== original ? "adapted" : "verbatim";
	const note =
		expected?.changes ??
		(file === "compat/mermaid-ascii.ts"
			? "Promise-based worker rendering and async safe fallback; removed unused extractMermaidBlocks."
			: "Node.js adaptation; see the per-file modification log.");
	if (write && isSource) {
		const nextHeader =
			kind === "new"
				? `${PREFIX}new file. ${note}\n${HEADER_END}`
				: `${PREFIX}${kind} copy of ${origin} ${source}\n// (commit ${revision.slice(0, 12)}${origin === "oh-my-pi" ? "; v18.18.7" : ""}).${kind === "adapted" ? ` ${note}` : ""}\n${HEADER_END}`;
		if (header !== nextHeader) writeFileSync(filename, nextHeader + body);
	} else if (isSource) {
		const expectedHeader =
			kind === "new" ? `${PREFIX}new file.` : `${PREFIX}${kind} copy of ${origin} ${source}`;
		if (!header.startsWith(expectedHeader) || !header.includes(HEADER_END)) {
			throw new Error(`${file}: invalid provenance header`);
		}
		if (origin !== "new" && !header.includes(revision.slice(0, 12))) {
			throw new Error(`${file}: header does not cite the baseline commit`);
		}
	}
	const hash = original === undefined ? null : createHash("sha256").update(original).digest("hex");
	if (!write && expected?.upstreamSha256 !== hash) throw new Error(`${file}: upstream hash changed`);
	manifest.push({
		file,
		kind,
		origin,
		source: origin === "new" ? null : source,
		commit: origin === "new" ? null : revision,
		upstreamSha256: hash,
		...(kind === "verbatim" ? {} : { changes: note }),
	});
}
if (write) {
	writeFileSync(path.join(root, "SOURCES.json"), `${JSON.stringify({ upstreamTag: "v18.18.7", files: manifest }, null, "\t")}\n`);
} else {
	const seen = new Set(manifest.map(entry => entry.file));
	for (const entry of previous) if (!seen.has(entry.file)) throw new Error(`orphan inventory entry ${entry.file}`);
	for (const entry of manifest) {
		const expected = previousByFile.get(entry.file);
		if (!expected) throw new Error(`missing inventory entry ${entry.file}`);
		if (expected.kind !== entry.kind || expected.source !== entry.source) {
			throw new Error(`stale inventory entry ${entry.file}`);
		}
	}
	if (previous.length !== manifest.length) throw new Error("Source inventory file count differs");
}
console.log(
	`Checked ${manifest.length} TUI source files against v18.18.7 and pi; ${manifest.filter(entry => entry.kind === "verbatim").length} verbatim.`,
);
