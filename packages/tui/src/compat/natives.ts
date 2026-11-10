// cloud-pi-tui: new file. Pure-TypeScript replacements for the
// `@oh-my-pi/pi-natives` APIs the TUI uses (text, highlighting hook, image
// metadata, TtyWriter, Mermaid stub). See PATCHES.md.
/**
 * Pure JavaScript replacement for the subset of `@oh-my-pi/pi-natives` that
 * the TUI uses. The native addon (Rust/N-API) is intentionally not part of
 * cloud-pi-tui: text measurement and key parsing come from local ports, syntax
 * highlighting is a pluggable no-op, and the remaining helpers degrade to
 * platform-neutral implementations.
 */

import * as fs from "node:fs";
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

/**
 * Hangul Compatibility Jamo width correction is a native-only table.
 * The JavaScript engine measures these code points by their Unicode East
 * Asian Width, so every override mode behaves as the native `unicode` mode.
 */
export function setHangulCompatJamoWidthOverride(_value: number): void {}

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

const EAGAIN = "EAGAIN";
const WRITE_RETRY_LIMIT = 200;

function sleepSync(ms: number): void {
	const shared = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(shared, 0, 0, ms);
}

/**
 * Synchronous replacement for the native pump thread. Writes go straight to
 * the descriptor; `pending()` is always zero because nothing is buffered.
 */
export class TtyWriter {
	#fd: number;
	#dead = false;

	constructor(fd: number) {
		this.#fd = fd;
	}

	write(data: string): number {
		if (this.#dead) return 0;
		const bytes = Buffer.from(data, "utf8");
		for (let attempt = 0; ; attempt++) {
			try {
				fs.writeSync(this.#fd, bytes);
				return 0;
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code === EAGAIN && attempt < WRITE_RETRY_LIMIT) {
					sleepSync(1);
					continue;
				}
				this.#dead = true;
				return 0;
			}
		}
	}

	pending(): number {
		return 0;
	}

	get dead(): boolean {
		return this.#dead;
	}

	flushSync(_timeoutMs: number): boolean {
		return !this.#dead;
	}

	stop(_flushTimeoutMs: number): void {}
}

// =============================================================================
// Mermaid diagrams
// =============================================================================

export interface MermaidRenderOptions {
	useAscii?: boolean;
	paddingX?: number;
	paddingY?: number;
	boxBorderPadding?: number;
	direction?: "TD" | "TB" | "LR" | "BT" | "RL";
	colorMode?: "none" | "auto" | "ansi16" | "ansi256" | "truecolor" | "html";
	theme?: {
		fg?: string;
		border?: string;
		line?: string;
		arrow?: string;
		accent?: string;
	};
}

/**
 * The native Mermaid renderer is not part of cloud-pi-tui. Throwing keeps the
 * markdown component's fallback (render the fenced source as code) intact.
 */
export function renderMermaidAscii(
	_text: string,
	_options?: MermaidRenderOptions | null,
): string {
	throw new Error("Mermaid rendering is unavailable in cloud-pi-tui");
}

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
const GITIGNORED_DIRECTORIES = new Set(["node_modules", ".venv", "__pycache__"]);
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

/** Approximate the native fuzzy finder; ordering prefers basename prefix hits. */
export async function fuzzyFind(options: FuzzyFindOptions): Promise<FuzzyFindResult> {
	const root = path.resolve(options.path);
	const includeHidden = options.hidden ?? false;
	const respectGitignore = options.gitignore ?? true;
	const maxResults = options.maxResults ?? 100;
	const signal = options.signal as AbortSignal | undefined;
	const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : Number.POSITIVE_INFINITY;

	const matches: FuzzyFindMatch[] = [];
	let scanned = 0;

	const visit = async (directory: string): Promise<void> => {
		if (signal?.aborted || Date.now() > deadline || scanned > MAX_SCANNED_ENTRIES) return;
		let entries: fs.Dirent[];
		try {
			entries = await fsp.readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (signal?.aborted || Date.now() > deadline || scanned > MAX_SCANNED_ENTRIES) return;
			scanned++;
			const name = entry.name;
			if (!includeHidden && name.startsWith(".")) continue;
			if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(name)) continue;
			if (entry.isDirectory() && respectGitignore && GITIGNORED_DIRECTORIES.has(name)) continue;

			const absolute = path.join(directory, name);
			const relative = path.relative(root, absolute).split(path.sep).join("/");
			const isDirectory = entry.isDirectory();
			const score = scorePath(isDirectory ? `${relative}/` : relative, options.query);
			if (score !== null) matches.push({ path: relative, isDirectory, score });
			if (isDirectory) await visit(absolute);
		}
	};

	await visit(root);
	matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
	return { matches: matches.slice(0, maxResults), totalMatches: matches.length };
}
