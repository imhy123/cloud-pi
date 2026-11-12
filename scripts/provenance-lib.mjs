// Shared provenance audit for workspaces that vendor or port oh-my-pi sources.
//
// Read-only by default: verifies every inventoried file has a manifest record,
// a truthful header, and the pinned upstream hash. `--write` rewrites headers
// and SOURCES.json while preserving hand-written adaptation notes from the
// existing manifest and the package's `changes` table.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_COMMIT = "e325ffc73ab86e03bdd20a91b77d8e2b3964c906";
export const BASELINE_TAG = "v18.18.7";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	cwd: path.dirname(fileURLToPath(import.meta.url)),
	encoding: "utf8",
}).trim();

const HEADER_END = "// See PATCHES.md.\n";

function splitHeader(text, prefix) {
	if (text.startsWith("#!")) {
		const newline = text.indexOf("\n") + 1;
		const [header, body] = splitHeader(text.slice(newline), prefix);
		return [text.slice(0, newline) + header, body];
	}
	if (!text.startsWith(prefix)) return ["", text];
	const end = text.indexOf(HEADER_END);
	if (end < 0) throw new Error("Missing provenance header terminator");
	const length = end + HEADER_END.length;
	return [text.slice(0, length), text.slice(length)];
}

function walk(target) {
	const stat = statSync(target);
	if (stat.isFile()) return [target];
	if (!stat.isDirectory()) return [];
	return readdirSync(target, { withFileTypes: true }).flatMap(entry =>
		entry.isDirectory() ? walk(path.join(target, entry.name)) : [path.join(target, entry.name)],
	);
}

function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}

export function runProvenance(config) {
	const {
		root,
		name,
		tag,
		roots,
		mapUpstream,
		newFiles = new Set(),
		skip = [],
		changes = {},
		upstreamRepo = process.env.OH_MY_PI_DIR ?? path.join(repoRoot, "..", "oh-my-pi"),
		write = process.argv.includes("--write"),
		licenseFiles = [],
		headerless = new Set(),
	} = config;
	const prefix = `// cloud-pi-${tag}:`;
	const manifestPath = path.join(root, "SOURCES.json");
	const previous = (() => {
		try {
			return JSON.parse(readFileSync(manifestPath, "utf8"));
		} catch {
			return { files: [] };
		}
	})();
	const previousByFile = new Map(previous.files.map(entry => [entry.file, entry]));
	const upstreamCache = new Map();
	const upstream = file => {
		if (!upstreamCache.has(file)) {
			upstreamCache.set(
				file,
				execFileSync("git", ["-C", upstreamRepo, "show", `${BASELINE_COMMIT}:${file}`], {
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			}),
			);
		}
		return upstreamCache.get(file);
	};

	const files = roots
		.flatMap(entry => walk(path.join(root, entry)))
		.map(file => path.relative(root, file).replaceAll(path.sep, "/"))
		.filter(file => !skip.some(pattern => pattern.test(file)))
		.filter(file => !file.endsWith("SOURCES.json"))
		.filter(file => !file.startsWith("dist/"))
		.sort();
	const manifest = [];
	for (const file of files) {
		const full = path.join(root, file);
		const source = newFiles.has(file) ? null : mapUpstream(file);
		const original = source === null ? undefined : upstream(source);
		let text = null;
		let header = "";
		let body = "";
		if ((file.endsWith(".ts") || file.endsWith(".mts")) && !headerless.has(file)) {
			text = readFileSync(full, "utf8");
			[header, body] = splitHeader(text, prefix);
		}
		const kind = source === null ? "new" : text === null ? "verbatim" : body === original ? "verbatim" : "adapted";
		const note =
			changes[file] ??
			previousByFile.get(file)?.changes ??
			(kind === "new" ? "cloud-pi workspace file; see PATCHES.md." : "Node.js adaptation; see PATCHES.md.");
		if (write && text !== null) {
			const expectedHeader =
				kind === "new"
					? `${prefix} new file. ${note}\n${HEADER_END}`
					: `${prefix} ${kind} copy of oh-my-pi ${source}\n// (commit ${BASELINE_COMMIT.slice(0, 12)}; ${BASELINE_TAG}).${kind === "adapted" ? ` ${note}` : ""}\n${HEADER_END}`;
			if (header !== expectedHeader) writeFileSync(full, expectedHeader + body);
		} else if (text !== null) {
			const expectedHeader =
				kind === "new"
					? `${prefix} new file.`
					: `${prefix} ${kind} copy of oh-my-pi ${source}`;
			if (!header.startsWith(expectedHeader) || !header.includes(HEADER_END)) {
				throw new Error(`${name}: ${file}: invalid provenance header`);
			}
			if (kind !== "new" && !header.includes(BASELINE_COMMIT.slice(0, 12))) {
				throw new Error(`${name}: ${file}: header does not cite the baseline commit`);
			}
		}
		manifest.push({
			file,
			kind,
			origin: source === null ? "new" : "oh-my-pi",
			source,
			commit: source === null ? null : BASELINE_COMMIT,
			upstreamSha256: original === undefined ? null : sha256(original),
			...(kind === "verbatim" ? {} : { changes: note }),
		});
	}
	for (const file of licenseFiles) {
		if (manifest.some(entry => entry.file === file)) continue;
		manifest.push({ file, kind: "verbatim", origin: "oh-my-pi", source: mapUpstream(file), commit: BASELINE_COMMIT, upstreamSha256: sha256(upstream(mapUpstream(file))) });
	}

	if (write) {
		writeFileSync(manifestPath, `${JSON.stringify({ upstreamTag: BASELINE_TAG, files: manifest }, null, "\t")}\n`);
	} else {
		const seen = new Set(manifest.map(entry => entry.file));
		for (const entry of previous.files) {
			if (!seen.has(entry.file)) throw new Error(`${name}: orphan inventory entry ${entry.file}`);
		}
		for (const entry of manifest) {
			const expected = previousByFile.get(entry.file);
			if (!expected) throw new Error(`${name}: missing inventory entry ${entry.file}`);
			for (const key of ["kind", "origin", "source", "commit", "upstreamSha256"]) {
				if (expected[key] !== entry[key]) throw new Error(`${name}: stale ${key} for ${entry.file}`);
			}
		}
	}
	const verbatim = manifest.filter(entry => entry.kind === "verbatim").length;
	console.log(
		`${name}: ${manifest.length} inventoried files against ${BASELINE_TAG} (${verbatim} verbatim, ${manifest.filter(entry => entry.kind === "adapted").length} adapted, ${manifest.filter(entry => entry.kind === "new").length} new).`,
	);
}
