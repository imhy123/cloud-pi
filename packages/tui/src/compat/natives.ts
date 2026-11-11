// cloud-pi-tui: new file. Native API facade: Node text/key/highlighting/appearance/output/search replacements and render-worker re-exports.
// See PATCHES.md.
/**
 * Pure JavaScript replacement for the subset of `@oh-my-pi/pi-natives` that
 * the TUI uses. The native addon (Rust/N-API) is intentionally not part of
 * cloud-pi-tui: text measurement and key parsing come from local ports, syntax
 * highlighting is a pluggable no-op, and the remaining helpers degrade to
 * platform-neutral implementations.
 */

import * as fs from "node:fs";
export type { MermaidRenderOptions, SvgCell, SvgFontOptions } from "./render-worker";
export { renderMermaidAscii, rasterizeSvg, setSvgFontOptions, closeMediaWorkers } from "./render-worker";
import { Worker } from "node:worker_threads";
import ignore, { type Ignore } from "ignore";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import * as keys from "./keys-engine";
import {
	extractSegments as extractSegmentsJs,
	sliceWithWidth as sliceWithWidthJs,
	truncateToWidth as truncateToWidthJs,
	wrapTextWithAnsi as wrapTextWithAnsiJs,
} from "./text";

// =============================================================================
// Text engine
// =============================================================================

/** Ellipsis style for {@link truncateToWidth}; mirrors the native enum values. */
export const Ellipsis = {
	Unicode: 0,
	Ascii: 1,
	Omit: 2,
} as const;
export type Ellipsis = (typeof Ellipsis)[keyof typeof Ellipsis];

export interface SliceResult {
	text: string;
	width: number;
}

export interface ExtractSegmentsResult {
	before: string;
	beforeWidth: number;
	after: string;
	afterWidth: number;
}

function ellipsisFor(kind: Ellipsis | null | undefined): string {
	switch (kind) {
		case Ellipsis.Ascii:
			return "...";
		case Ellipsis.Omit:
			return "";
		default:
			return "…";
	}
}

export function truncateToWidth(
	text: string,
	maxWidth: number,
	ellipsisKind: Ellipsis | null | undefined,
	pad: boolean | null | undefined,
	tabWidth: number,
): string {
	return truncateToWidthJs(text, maxWidth, ellipsisFor(ellipsisKind), pad ?? false, tabWidth);
}

export function sliceWithWidth(
	line: string,
	startCol: number,
	length: number,
	strict: boolean | null | undefined,
	tabWidth: number,
): SliceResult {
	return sliceWithWidthJs(line, startCol, length, strict ?? false, tabWidth);
}

export function extractSegments(
	line: string,
	beforeEnd: number,
	afterStart: number,
	afterLen: number,
	strictAfter: boolean | null | undefined,
	tabWidth: number,
): ExtractSegmentsResult {
	return extractSegmentsJs(line, beforeEnd, afterStart, afterLen, strictAfter ?? false, tabWidth);
}

export function wrapTextWithAnsi(text: string, width: number, tabWidth: number): string[] {
	return wrapTextWithAnsiJs(text, width, tabWidth);
}

export { setHangulCompatJamoWidthOverride } from "./text";

// =============================================================================
// Key parsing
// =============================================================================

export type KeyEventType = keys.KeyEventType;
export type KeyId = keys.KeyId;

export function matchesKey(data: string, keyId: KeyId, kittyProtocolActive: boolean): boolean {
	keys.setKittyProtocolActive(kittyProtocolActive);
	return keys.matchesKey(data, keyId);
}

export function parseKey(data: string, kittyProtocolActive: boolean): string | undefined {
	keys.setKittyProtocolActive(kittyProtocolActive);
	return keys.parseKey(data);
}

export function parseKittySequence(data: string): keys.ParsedKittySequence | null {
	return keys.parseKittySequence(data);
}

// =============================================================================
// Syntax highlighting (pluggable, disabled by default)
// =============================================================================

export interface HighlightColors {
	comment: string;
	keyword: string;
	function: string;
	variable: string;
	string: string;
	number: string;
	type: string;
	operator: string;
	punctuation: string;
	inserted?: string;
	deleted?: string;
}

export interface HighlighterStream {
	readonly supported: boolean;
	push(chunk: string): string;
}

/** Incremental highlighter implementation that can be registered at runtime. */
export interface Highlighter {
	supportsLanguage(lang: string): boolean;
	highlightCode(code: string, lang: string | null | undefined, colors: HighlightColors): string;
	createStream?(lang: string | undefined, colors: HighlightColors): HighlighterStream;
	warmup?(): Promise<void>;
}

let activeHighlighter: Highlighter | undefined;

/** Install a syntax highlighter. Passing `undefined` disables highlighting. */
export function setHighlighter(highlighter: Highlighter | undefined): void {
	activeHighlighter = highlighter;
}

export class HighlightStream {
	#stream: HighlighterStream | undefined;

	constructor(lang: string | undefined | null, colors: HighlightColors) {
		const highlighter = activeHighlighter;
		if (!highlighter || lang == null || !highlighter.supportsLanguage(lang)) return;
		try {
			this.#stream = highlighter.createStream?.(lang, colors);
		} catch {
			this.#stream = undefined;
		}
	}

	get supported(): boolean {
		return this.#stream?.supported ?? false;
	}

	push(chunk: string): string {
		return this.#stream?.push(chunk) ?? chunk;
	}
}

export function highlightCode(
	code: string,
	lang: string | null | undefined,
	colors: HighlightColors,
): string {
	const highlighter = activeHighlighter;
	if (!highlighter || lang == null || !highlighter.supportsLanguage(lang)) return code;
	try {
		return highlighter.highlightCode(code, lang, colors);
	} catch {
		return code;
	}
}

export function supportsLanguage(lang: string): boolean {
	return activeHighlighter?.supportsLanguage(lang) ?? false;
}

export async function warmHighlighter(): Promise<undefined> {
	try {
		await activeHighlighter?.warmup?.();
	} catch {
		// Warmup is opportunistic; failures leave the highlighter cold.
	}
	return undefined;
}

// =============================================================================
// macOS appearance
// =============================================================================

export type MacOSAppearance = "dark" | "light";

/** Read the system appearance through `defaults(1)`; `null` off macOS. */
export function detectMacOSAppearance(): MacOSAppearance | null {
	if (process.platform !== "darwin") return null;
	try {
		const result = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
			encoding: "utf8",
			timeout: 500,
			stdio: ["ignore", "pipe", "ignore"],
		});
		if (result.error || result.status !== 0) return "light";
		return result.stdout.trim().toLowerCase() === "dark" ? "dark" : "light";
	} catch {
		return null;
	}
}

/** Poll the macOS appearance; distributed notifications need a native listener. */
export class MacAppearanceObserver {
	#timer: NodeJS.Timeout | undefined;
	#last: MacOSAppearance | null = null;
	#callback: (err: Error | null, appearance: MacOSAppearance) => void;

	constructor(callback: (err: Error | null, appearance: MacOSAppearance) => void) {
		this.#callback = callback;
	}

	static start(callback: (err: Error | null, appearance: MacOSAppearance) => void): MacAppearanceObserver {
		const observer = new MacAppearanceObserver(callback);
		if (process.platform !== "darwin") return observer;
		const poll = () => {
			const appearance = detectMacOSAppearance();
			if (appearance === null || appearance === observer.#last) return;
			observer.#last = appearance;
			callback(null, appearance);
		};
		observer.#timer = setInterval(poll, 2000);
		observer.#timer.unref?.();
		queueMicrotask(poll);
		return observer;
	}

	stop(): void {
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
	}
}

// =============================================================================
// TTY output
// =============================================================================

/** @internal Complete writes, retaining the offset across short writes and retries. */
export function writeAllBytes(
	bytes: Uint8Array,
	write: (offset: number, length: number) => number,
	progress: (count: number) => void,
	pause: () => void,
): void {
	let offset = 0;
	while (offset < bytes.length) {
		try {
			const written = write(offset, Math.min(16384, bytes.length - offset));
			if (written <= 0) throw new Error("zero-byte terminal write");
			offset += written;
			progress(written);
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "EINTR") continue;
			if (code === "EAGAIN" || code === "EWOULDBLOCK") { pause(); continue; }
			throw err;
		}
	}
}

/** Off-thread FIFO output with shared byte counts for synchronous shutdown. */
export class TtyWriter {
	#state = new Int32Array(new SharedArrayBuffer(8));
	#worker: Worker;
	#stopped = false;
	constructor(fd: number) {
		this.#worker = new Worker(`
			const fs = require("node:fs");
			const { parentPort, workerData } = require("node:worker_threads");
			const state = new Int32Array(workerData.state);
			const pause = new Int32Array(new SharedArrayBuffer(4));
			const writeAll = (${writeAllBytes.toString()});
			parentPort.on("message", data => {
				if (data === null) { parentPort.close(); return; }
				let remaining = data.length;
				if (!Atomics.load(state, 1)) {
					try {
						writeAll(data, (offset, length) => fs.writeSync(workerData.fd, data, offset, length), count => {
							remaining -= count;
							Atomics.sub(state, 0, count);
						}, () => Atomics.wait(pause, 0, 0, 2));
					} catch { Atomics.store(state, 1, 1); }
				}
				if (remaining) Atomics.sub(state, 0, remaining);
				Atomics.notify(state, 0);
			});
		`, { eval: true, workerData: { fd, state: this.#state.buffer } });
		this.#worker.on("error", () => { Atomics.store(this.#state, 1, 1); Atomics.notify(this.#state, 0); });
		this.#worker.on("exit", () => { if (!this.#stopped) Atomics.store(this.#state, 1, 1); Atomics.notify(this.#state, 0); });
		this.#worker.unref();
	}
	write(data: string): number {
		if (this.dead || this.#stopped) return this.pending();
		const bytes = Buffer.from(data);
		Atomics.add(this.#state, 0, bytes.length);
		try { this.#worker.postMessage(bytes); }
		catch { Atomics.sub(this.#state, 0, bytes.length); Atomics.store(this.#state, 1, 1); }
		return this.pending();
	}
	pending(): number { return Atomics.load(this.#state, 0); }
	get dead(): boolean { return Atomics.load(this.#state, 1) !== 0; }
	flushSync(timeoutMs: number): boolean {
		const until = Date.now() + Math.max(0, timeoutMs);
		while (!this.dead) {
			const pending = this.pending();
			if (!pending) return true;
			const remaining = until - Date.now();
			if (remaining <= 0) return false;
			Atomics.wait(this.#state, 0, pending, remaining);
		}
		return false;
	}
	stop(timeoutMs: number): void {
		if (this.#stopped) return;
		const flushed = this.flushSync(timeoutMs);
		this.#stopped = true;
		if (flushed) this.#worker.postMessage(null);
		else void this.#worker.terminate();
	}
}

// =============================================================================
// Mermaid diagrams
// =============================================================================

// =============================================================================
// Fuzzy file search
// =============================================================================

export interface FuzzyFindMatch {
	path: string;
	isDirectory: boolean;
	score: number;
}

export interface FuzzyFindOptions {
	query: string;
	path: string;
	hidden?: boolean;
	gitignore?: boolean;
	cache?: boolean;
	maxResults?: number;
	signal?: unknown;
	timeoutMs?: number;
}

export interface FuzzyFindResult {
	matches: FuzzyFindMatch[];
	totalMatches: number;
}

const SKIPPED_DIRECTORIES = new Set([".git", ".hg", ".svn"]);
const MAX_SCANNED_ENTRIES = 200_000;

function subsequenceScore(haystack: string, needle: string): number | null {
	let position = 0;
	let gaps = 0;
	let lastMatch = -1;
	for (const char of needle) {
		const found = haystack.indexOf(char, position);
		if (found === -1) return null;
		if (lastMatch !== -1 && found !== lastMatch + 1) gaps++;
		lastMatch = found;
		position = found + 1;
	}
	return 500 - gaps * 10 - haystack.length;
}

function scorePath(relativePath: string, query: string): number | null {
	const lowerPath = relativePath.toLowerCase();
	if (!query) return -lowerPath.length;
	const lowerQuery = query.toLowerCase();
	const basename = lowerPath.slice(lowerPath.lastIndexOf("/") + 1);
	if (basename.startsWith(lowerQuery)) return 4000 - lowerPath.length;
	if (basename.includes(lowerQuery)) return 3000 - lowerPath.length;
	if (lowerPath.includes(lowerQuery)) return 2000 - lowerPath.length;
	return subsequenceScore(lowerPath, lowerQuery);
}

interface SearchEntry { path: string; isDirectory: boolean; }
interface IgnoreScope { directory: string; rules: Ignore; }
const discoveryCache = new Map<string, { at: number; entries: SearchEntry[] }>();
const DISCOVERY_TTL_MS = 1000;

/** Discover with nested gitignore rules; cache scans, never query-dependent ranks. */
export async function fuzzyFind(options: FuzzyFindOptions): Promise<FuzzyFindResult> {
	const root = path.resolve(options.path);
	const includeHidden = options.hidden ?? false;
	const respectGitignore = options.gitignore ?? true;
	const maxResults = Math.max(0, options.maxResults ?? 100);
	const signal = options.signal as AbortSignal | undefined;
	const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : Infinity;
	const expired = () => signal?.aborted || Date.now() > deadline;
	const cacheKey = JSON.stringify([root, includeHidden, respectGitignore]);
	const cached = options.cache ? discoveryCache.get(cacheKey) : undefined;
	let entries: SearchEntry[];
	if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) entries = cached.entries;
	else {
		entries = [];
		let scanned = 0;
		let complete = true;
		const loadRules = async (directory: string, filename: string): Promise<IgnoreScope | undefined> => {
			try { return { directory, rules: ignore().add(await fsp.readFile(filename, "utf8")) }; }
			catch { return undefined; }
		};
		const initial: IgnoreScope[] = [];
		if (respectGitignore) {
			const ancestors: string[] = [];
			for (let dir = root;; dir = path.dirname(dir)) {
				ancestors.unshift(dir);
				if (fs.existsSync(path.join(dir, ".git")) || path.dirname(dir) === dir) break;
			}
			const repo = ancestors[0]!;
			const exclude = await loadRules(repo, path.join(repo, ".git/info/exclude"));
			if (exclude) initial.push(exclude);
			for (const dir of ancestors.slice(0, -1)) {
				const scope = await loadRules(dir, path.join(dir, ".gitignore"));
				if (scope) initial.push(scope);
			}
		}
		const visit = async (directory: string, inherited: IgnoreScope[]): Promise<void> => {
			if (expired() || scanned >= MAX_SCANNED_ENTRIES) { complete = false; return; }
			let scopes = inherited;
			if (respectGitignore) {
				const scope = await loadRules(directory, path.join(directory, ".gitignore"));
				if (scope) scopes = [...inherited, scope];
			}
			let children: fs.Dirent[];
			try { children = await fsp.readdir(directory, { withFileTypes: true }); }
			catch { complete = false; return; }
			for (const entry of children) {
				if (expired() || scanned >= MAX_SCANNED_ENTRIES) { complete = false; return; }
				scanned++;
				if (!includeHidden && entry.name.startsWith(".")) continue;
				if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
				const absolute = path.join(directory, entry.name);
				const isDirectory = entry.isDirectory();
				let ignored = false;
				for (const scope of scopes) {
					const relative = path.relative(scope.directory, absolute).split(path.sep).join("/") + (isDirectory ? "/" : "");
					const result = scope.rules.test(relative);
					if (result.ignored) ignored = true;
					else if (result.unignored) ignored = false;
				}
				if (ignored) continue;
				const relative = path.relative(root, absolute).split(path.sep).join("/");
				entries.push({ path: relative, isDirectory });
				if (isDirectory) await visit(absolute, scopes);
			}
		};
		await visit(root, initial);
		if (options.cache && complete) {
			if (discoveryCache.size >= 16) discoveryCache.delete(discoveryCache.keys().next().value!);
			discoveryCache.set(cacheKey, { at: Date.now(), entries });
		}
	}
	const matches: FuzzyFindMatch[] = [];
	for (const entry of entries) {
		if (expired()) break;
		const score = scorePath(entry.path + (entry.isDirectory ? "/" : ""), options.query);
		if (score !== null) matches.push({ ...entry, score });
	}
	matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
	return { matches: matches.slice(0, maxResults), totalMatches: matches.length };
}
