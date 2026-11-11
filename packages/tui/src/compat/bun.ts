// cloud-pi-tui: new file. Partial Node.js Bun shim, with Unicode Jamo measurement separate from terminal overrides.
// See PATCHES.md.
/**
	* Minimal `Bun` global shim for running the vendored TUI sources on Node.js.
	* Bundles inject this module in place of the free `Bun` identifier; the
	* exported object mirrors only the APIs the TUI actually calls.
	*/

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { createRequire } from "node:module";
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process";
import * as util from "node:util";
import { isMainThread } from "node:worker_threads";
import { stripAnsi, visibleWidth } from "./text";

// =============================================================================
// Width / ANSI
// =============================================================================

export interface StringWidthOptions {
	countAnsiEscapeCodes?: boolean;
	ambiguousIsNarrow?: boolean;
}

function stringWidth(text: string, _options?: StringWidthOptions): number {
	// Bun measures tabs and control characters as zero cells; the TUI adds tab
	// width separately in `utils.visibleWidth`. Passing tabWidth 0 keeps this
	// shim faithful and avoids double-counting every tab.
	const width = visibleWidth(text, 0);
	// The shared text engine follows terminal overrides; Bun's width remains 2
	// for every Compatibility Jamo, with correction applied by utils.ts.
	let delta = 0;
	for (const ch of stripAnsi(text)) {
		const cp = ch.codePointAt(0)!;
		if (cp >= 0x3131 && cp <= 0x318e) delta += 2 - visibleWidth(ch, 0);
	}
	return width + delta;
}

// =============================================================================
// Color
// =============================================================================

export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface RGBA extends RGB {
	a: number;
}

const NAMED_COLORS: Record<string, string> = {
	aliceblue: "#f0f8ff",
	antiquewhite: "#faebd7",
	aqua: "#00ffff",
	aquamarine: "#7fffd4",
	azure: "#f0ffff",
	beige: "#f5f5dc",
	bisque: "#ffe4c4",
	black: "#000000",
	blanchedalmond: "#ffebcd",
	blue: "#0000ff",
	blueviolet: "#8a2be2",
	brown: "#a52a2a",
	burlywood: "#deb887",
	cadetblue: "#5f9ea0",
	chartreuse: "#7fff00",
	chocolate: "#d2691e",
	coral: "#ff7f50",
	cornflowerblue: "#6495ed",
	cornsilk: "#fff8dc",
	crimson: "#dc143c",
	cyan: "#00ffff",
	darkblue: "#00008b",
	darkcyan: "#008b8b",
	darkgoldenrod: "#b8860b",
	darkgray: "#a9a9a9",
	darkgreen: "#006400",
	darkgrey: "#a9a9a9",
	darkkhaki: "#bdb76b",
	darkmagenta: "#8b008b",
	darkolivegreen: "#556b2f",
	darkorange: "#ff8c00",
	darkorchid: "#9932cc",
	darkred: "#8b0000",
	darksalmon: "#e9967a",
	darkseagreen: "#8fbc8f",
	darkslateblue: "#483d8b",
	darkslategray: "#2f4f4f",
	darkslategrey: "#2f4f4f",
	darkturquoise: "#00ced1",
	darkviolet: "#9400d3",
	deeppink: "#ff1493",
	deepskyblue: "#00bfff",
	dimgray: "#696969",
	dimgrey: "#696969",
	dodgerblue: "#1e90ff",
	firebrick: "#b22222",
	floralwhite: "#fffaf0",
	forestgreen: "#228b22",
	fuchsia: "#ff00ff",
	gainsboro: "#dcdcdc",
	ghostwhite: "#f8f8ff",
	gold: "#ffd700",
	goldenrod: "#daa520",
	gray: "#808080",
	green: "#008000",
	greenyellow: "#adff2f",
	grey: "#808080",
	honeydew: "#f0fff0",
	hotpink: "#ff69b4",
	indianred: "#cd5c5c",
	indigo: "#4b0082",
	ivory: "#fffff0",
	khaki: "#f0e68c",
	lavender: "#e6e6fa",
	lavenderblush: "#fff0f5",
	lawngreen: "#7cfc00",
	lemonchiffon: "#fffacd",
	lightblue: "#add8e6",
	lightcoral: "#f08080",
	lightcyan: "#e0ffff",
	lightgoldenrodyellow: "#fafad2",
	lightgray: "#d3d3d3",
	lightgreen: "#90ee90",
	lightgrey: "#d3d3d3",
	lightpink: "#ffb6c1",
	lightsalmon: "#ffa07a",
	lightseagreen: "#20b2aa",
	lightskyblue: "#87cefa",
	lightslategray: "#778899",
	lightslategrey: "#778899",
	lightsteelblue: "#b0c4de",
	lightyellow: "#ffffe0",
	lime: "#00ff00",
	limegreen: "#32cd32",
	linen: "#faf0e6",
	magenta: "#ff00ff",
	maroon: "#800000",
	mediumaquamarine: "#66cdaa",
	mediumblue: "#0000cd",
	mediumorchid: "#ba55d3",
	mediumpurple: "#9370db",
	mediumseagreen: "#3cb371",
	mediumslateblue: "#7b68ee",
	mediumspringgreen: "#00fa9a",
	mediumturquoise: "#48d1cc",
	mediumvioletred: "#c71585",
	midnightblue: "#191970",
	mintcream: "#f5fffa",
	mistyrose: "#ffe4e1",
	moccasin: "#ffe4b5",
	navajowhite: "#ffdead",
	navy: "#000080",
	oldlace: "#fdf5e6",
	olive: "#808000",
	olivedrab: "#6b8e23",
	orange: "#ffa500",
	orangered: "#ff4500",
	orchid: "#da70d6",
	palegoldenrod: "#eee8aa",
	palegreen: "#98fb98",
	paleturquoise: "#afeeee",
	palevioletred: "#db7093",
	papayawhip: "#ffefd5",
	peachpuff: "#ffdab9",
	peru: "#cd853f",
	pink: "#ffc0cb",
	plum: "#dda0dd",
	powderblue: "#b0e0e6",
	purple: "#800080",
	rebeccapurple: "#663399",
	red: "#ff0000",
	rosybrown: "#bc8f8f",
	royalblue: "#4169e1",
	saddlebrown: "#8b4513",
	salmon: "#fa8072",
	sandybrown: "#f4a460",
	seagreen: "#2e8b57",
	seashell: "#fff5ee",
	sienna: "#a0522d",
	silver: "#c0c0c0",
	skyblue: "#87ceeb",
	slateblue: "#6a5acd",
	slategray: "#708090",
	slategrey: "#708090",
	snow: "#fffafa",
	springgreen: "#00ff7f",
	steelblue: "#4682b4",
	tan: "#d2b48c",
	teal: "#008080",
	thistle: "#d8bfd8",
	tomato: "#ff6347",
	turquoise: "#40e0d0",
	violet: "#ee82ee",
	wheat: "#f5deb3",
	white: "#ffffff",
	whitesmoke: "#f5f5f5",
	yellow: "#ffff00",
	yellowgreen: "#9acd32",
};

function channel(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function alphaChannel(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function parseHexColor(hex: string): RGBA | null {
	const match = /^#([0-9a-f]{3,8})$/i.exec(hex);
	if (!match) return null;
	const digits = match[1]!;
	const expand = (value: string) => Number.parseInt(value.length === 1 ? value + value : value, 16);
	switch (digits.length) {
		case 3:
			return { r: expand(digits[0]!), g: expand(digits[1]!), b: expand(digits[2]!), a: 255 };
		case 4:
			return {
				r: expand(digits[0]!),
				g: expand(digits[1]!),
				b: expand(digits[2]!),
				a: expand(digits[3]!),
			};
		case 6:
			return {
				r: Number.parseInt(digits.slice(0, 2), 16),
				g: Number.parseInt(digits.slice(2, 4), 16),
				b: Number.parseInt(digits.slice(4, 6), 16),
				a: 255,
			};
		case 8:
			return {
				r: Number.parseInt(digits.slice(0, 2), 16),
				g: Number.parseInt(digits.slice(2, 4), 16),
				b: Number.parseInt(digits.slice(4, 6), 16),
				a: Number.parseInt(digits.slice(6, 8), 16),
			};
		default:
			return null;
	}
}

function parseRgbFunction(body: string): RGBA | null {
	const [valuesPart, alphaPart] = body.split("/");
	const values = (valuesPart ?? "").trim().split(/[\s,]+/).filter(Boolean);
	if (values.length < 3) return null;
	const parseComponent = (value: string): number => {
		if (value.endsWith("%")) return channel((Number.parseFloat(value) / 100) * 255);
		return channel(Number.parseFloat(value));
	};
	const r = parseComponent(values[0]!);
	const g = parseComponent(values[1]!);
	const b = parseComponent(values[2]!);
	if (![r, g, b].every(Number.isFinite)) return null;
	const rawAlpha = (alphaPart ?? values[3] ?? "1").trim();
	const alpha = rawAlpha.endsWith("%")
		? Number.parseFloat(rawAlpha) / 100
		: Number.parseFloat(rawAlpha);
	return { r, g, b, a: alphaChannel(Number.isFinite(alpha) ? alpha : 1) };
}

function parseHue(value: string): number | null {
	const number = Number.parseFloat(value);
	if (!Number.isFinite(number)) return null;
	if (value.endsWith("turn")) return number * 360;
	if (value.endsWith("rad")) return (number * 180) / Math.PI;
	if (value.endsWith("grad")) return number * 0.9;
	return number;
}

function parseHslFunction(body: string): RGBA | null {
	const [valuesPart, alphaPart] = body.split("/");
	const values = (valuesPart ?? "").trim().split(/[\s,]+/).filter(Boolean);
	if (values.length < 3) return null;
	const hue = parseHue(values[0]!);
	const saturation = Number.parseFloat(values[1]!);
	const lightness = Number.parseFloat(values[2]!);
	if (hue === null || !Number.isFinite(saturation) || !Number.isFinite(lightness)) return null;
	const s = Math.max(0, Math.min(1, saturation / 100));
	const l = Math.max(0, Math.min(1, lightness / 100));
	const normalizedHue = ((hue % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
	const m = l - c / 2;
	const sector = Math.floor(normalizedHue / 60);
	const [r1, g1, b1] = [
		[ c, x, 0 ],
		[ x, c, 0 ],
		[ 0, c, x ],
		[ 0, x, c ],
		[ x, 0, c ],
		[ c, 0, x ],
	][sector] ?? [0, 0, 0];
	const rawAlpha = (alphaPart ?? values[3] ?? "1").trim();
	const alpha = rawAlpha.endsWith("%")
		? Number.parseFloat(rawAlpha) / 100
		: Number.parseFloat(rawAlpha);
	return {
		r: channel((r1! + m) * 255),
		g: channel((g1! + m) * 255),
		b: channel((b1! + m) * 255),
		a: alphaChannel(Number.isFinite(alpha) ? alpha : 1),
	};
}

function parseColor(input: string | number): RGBA | null {
	if (typeof input === "number") {
		return {
			r: (input >> 16) & 0xff,
			g: (input >> 8) & 0xff,
			b: input & 0xff,
			a: 255,
		};
	}
	const value = input.trim().toLowerCase();
	if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
	const named = NAMED_COLORS[value];
	if (named !== undefined) return parseHexColor(named);
	if (value.startsWith("#")) return parseHexColor(value);
	const fn = /^(rgba?|hsla?)\((.*)\)$/u.exec(value);
	if (!fn) return null;
	return fn[1]!.startsWith("rgb") ? parseRgbFunction(fn[2]!) : parseHslFunction(fn[2]!);
}

const XTERM_LEVELS = [0, 95, 135, 175, 215, 255];

const XTERM_PALETTE: ReadonlyArray<readonly [number, number, number]> = (() => {
	const palette: Array<readonly [number, number, number]> = [
		[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
		[0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
		[128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
		[0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
	];
	for (let index = 0; index < 216; index++) {
		palette.push([
			XTERM_LEVELS[Math.floor(index / 36)]!,
			XTERM_LEVELS[Math.floor(index / 6) % 6]!,
			XTERM_LEVELS[index % 6]!,
		]);
	}
	for (let index = 0; index < 24; index++) {
		const level = 8 + index * 10;
		palette.push([level, level, level]);
	}
	return palette;
})();

function ansi256Index({ r, g, b }: RGB): number {
	let best = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < XTERM_PALETTE.length; index++) {
		const [pr, pg, pb] = XTERM_PALETTE[index]!;
		const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}
	return best;
}

function toCssHex(color: RGBA): string {
	const hex = (value: number) => value.toString(16).padStart(2, "0");
	return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

export function color(input: string | number, format: "css"): string | null;
export function color(input: string | number, format: "{rgb}"): RGB | null;
export function color(input: string | number, format: "{rgba}"): RGBA | null;
export function color(input: string | number, format: "ansi-16m" | "ansi-256"): string | null;
export function color(input: string | number, format?: undefined): number | null;
export function color(
	input: string | number,
	format?: "css" | "{rgb}" | "{rgba}" | "ansi-16m" | "ansi-256",
): string | number | RGB | RGBA | null {
	const parsed = parseColor(input);
	if (!parsed) return null;
	switch (format) {
		case undefined:
			return (parsed.r << 16) | (parsed.g << 8) | parsed.b;
		case "css":
			return toCssHex(parsed);
		case "{rgb}":
			return { r: parsed.r, g: parsed.g, b: parsed.b };
		case "{rgba}":
			return parsed;
		case "ansi-16m":
			return `\x1b[38;2;${parsed.r};${parsed.g};${parsed.b}m`;
		case "ansi-256":
			return `\x1b[38;5;${ansi256Index(parsed)}m`;
		default:
			return null;
	}
}

// =============================================================================
// Hashing
// =============================================================================

const MASK64 = (1n << 64n) - 1n;
const PRIME64_1 = 11400714785074694791n;
const PRIME64_2 = 14029467366897019727n;
const PRIME64_3 = 1609587929392839161n;
const PRIME64_4 = 9650029242287828579n;
const PRIME64_5 = 2870177450012600261n;

function rotl64(value: bigint, bits: bigint): bigint {
	return ((value << bits) | (value >> (64n - bits))) & MASK64;
}

function round64(accumulator: bigint, input: bigint): bigint {
	const mixed = (accumulator + input * PRIME64_2) & MASK64;
	return (rotl64(mixed, 31n) * PRIME64_1) & MASK64;
}

function mergeRound64(accumulator: bigint, value: bigint): bigint {
	return ((accumulator ^ round64(0n, value)) * PRIME64_1 + PRIME64_4) & MASK64;
}

function toBytes(input: string | Uint8Array): Uint8Array {
	return typeof input === "string" ? new TextEncoder().encode(input) : input;
}

/** xxHash64 over UTF-8 bytes (Bun-compatible signature, pure JS implementation). */
export function xxHash64(input: string | Uint8Array, seed: number | bigint = 0n): bigint {
	const bytes = toBytes(input);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const length = bytes.byteLength;
	let offset = 0;
	let hash: bigint;

	if (length >= 32) {
		let v1 = (BigInt(seed) + PRIME64_1 + PRIME64_2) & MASK64;
		let v2 = (BigInt(seed) + PRIME64_2) & MASK64;
		let v3 = BigInt(seed) & MASK64;
		let v4 = (BigInt(seed) - PRIME64_1) & MASK64;
		const limit = length - 32;
		while (offset <= limit) {
			v1 = round64(v1, view.getBigUint64(offset, true));
			v2 = round64(v2, view.getBigUint64(offset + 8, true));
			v3 = round64(v3, view.getBigUint64(offset + 16, true));
			v4 = round64(v4, view.getBigUint64(offset + 24, true));
			offset += 32;
		}
		hash = (rotl64(v1, 1n) + rotl64(v2, 7n) + rotl64(v3, 12n) + rotl64(v4, 18n)) & MASK64;
		hash = mergeRound64(hash, v1);
		hash = mergeRound64(hash, v2);
		hash = mergeRound64(hash, v3);
		hash = mergeRound64(hash, v4);
	} else {
		hash = (BigInt(seed) + PRIME64_5) & MASK64;
	}

	hash = (hash + BigInt(length)) & MASK64;

	while (offset + 8 <= length) {
		hash ^= round64(0n, view.getBigUint64(offset, true));
		hash = (rotl64(hash, 27n) * PRIME64_1 + PRIME64_4) & MASK64;
		offset += 8;
	}
	if (offset + 4 <= length) {
		hash ^= (BigInt(view.getUint32(offset, true)) * PRIME64_1) & MASK64;
		hash = (rotl64(hash, 23n) * PRIME64_2 + PRIME64_3) & MASK64;
		offset += 4;
	}
	while (offset < length) {
		hash ^= (BigInt(bytes[offset]!) * PRIME64_5) & MASK64;
		hash = (rotl64(hash, 11n) * PRIME64_1) & MASK64;
		offset++;
	}

	hash ^= hash >> 33n;
	hash = (hash * PRIME64_2) & MASK64;
	hash ^= hash >> 29n;
	hash = (hash * PRIME64_3) & MASK64;
	hash ^= hash >> 32n;
	return hash;
}

const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let value = i;
		for (let bit = 0; bit < 8; bit++) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[i] = value >>> 0;
	}
	return table;
})();

function crc32(input: string | Uint8Array): number {
	const bytes = toBytes(input);
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function hash(input: string | Uint8Array, seed?: number | bigint): number {
	return Number(xxHash64(input, seed ?? 0n) & 0x1fffffffffffffn);
}

export const hashFn = Object.assign(hash, {
	xxHash64,
	wyhash: (input: string | Uint8Array, seed?: number | bigint) => xxHash64(input, seed ?? 0n),
	crc32,
});

// =============================================================================
// Process helpers
// =============================================================================

export interface WhichOptions {
	cwd?: string;
	PATH?: string;
}

export function which(command: string, options?: WhichOptions): string | null {
	const isWindows = process.platform === "win32";
	const extensions = isWindows ? [".exe", ".cmd", ".bat", ".com", ""] : [""];
	const isExecutable = (candidate: string): boolean => {
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return fs.statSync(candidate).isFile();
		} catch {
			return false;
		}
	};
	if (command.includes("/") || (isWindows && command.includes("\\"))) {
		const candidate = path.resolve(options?.cwd ?? process.cwd(), command);
		return isExecutable(candidate) ? candidate : null;
	}
	const searchPath = options?.PATH ?? process.env.PATH ?? "";
	for (const directory of searchPath.split(path.delimiter)) {
		if (!directory) continue;
		for (const extension of extensions) {
			const candidate = path.join(directory, command + extension);
			if (isExecutable(candidate)) return candidate;
		}
	}
	return null;
}

export interface SpawnOptions {
	cmd: string[];
	stdin?: "ignore" | "pipe" | "inherit";
	stdout?: "ignore" | "pipe" | "inherit";
	stderr?: "ignore" | "pipe" | "inherit";
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export function spawn(options: SpawnOptions) {
	const [command, ...args] = options.cmd;
	if (!command) throw new Error("spawn: empty command");
	return nodeSpawn(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [options.stdin ?? "ignore", options.stdout ?? "ignore", options.stderr ?? "ignore"],
	});
}

export interface SpawnSyncOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdin?: "ignore" | "pipe" | "inherit";
	stdout?: "ignore" | "pipe" | "inherit";
	stderr?: "ignore" | "pipe" | "inherit";
	timeout?: number;
	killSignal?: NodeJS.Signals;
}

export interface SpawnSyncResult {
	exitCode: number;
	signal: NodeJS.Signals | null;
	stdout: Buffer;
	stderr: Buffer;
}

export function spawnSync(cmd: string[], options: SpawnSyncOptions = {}): SpawnSyncResult {
	const [command, ...args] = cmd;
	if (!command) throw new Error("spawnSync: empty command");
	const result = nodeSpawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
		timeout: options.timeout,
		killSignal: options.killSignal ?? "SIGTERM",
	});
	return {
		exitCode: result.status ?? (result.error ? 1 : 0),
		signal: result.signal,
		stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
		stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ""),
	};
}

export function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const requireFrom = createRequire(path.join(process.cwd(), "noop.js"));

export function resolveSync(specifier: string, parent?: string): string {
	const resolver = parent ? createRequire(path.join(parent, "noop.js")) : requireFrom;
	return resolver.resolve(specifier);
}

// =============================================================================
// Files / globs / inspection
// =============================================================================

export interface BunFileLike {
	text(): Promise<string>;
	json(): Promise<unknown>;
	arrayBuffer(): Promise<ArrayBuffer>;
	bytes(): Promise<Uint8Array>;
	exists(): Promise<boolean>;
	readonly size: number;
}

export function file(filePath: string): BunFileLike {
	return {
		text: () => fsp.readFile(filePath, "utf8"),
		json: async () => JSON.parse(await fsp.readFile(filePath, "utf8")),
		arrayBuffer: async () => {
			const buffer = await fsp.readFile(filePath);
			return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		},
		bytes: () => fsp.readFile(filePath),
		exists: async () => {
			try {
				await fsp.access(filePath);
				return true;
			} catch {
				return false;
			}
		},
		get size() {
			try {
				return fs.statSync(filePath).size;
			} catch {
				return 0;
			}
		},
	};
}

export function inspect(value: unknown, options?: { colors?: boolean }): string {
	return util.inspect(value, { colors: options?.colors ?? false, depth: 4 });
}

function expandBraces(pattern: string): string[] {
	const open = pattern.indexOf("{");
	if (open === -1) return [pattern];
	let depth = 0;
	for (let i = open; i < pattern.length; i++) {
		if (pattern[i] === "{") depth++;
		else if (pattern[i] === "}") {
			depth--;
			if (depth === 0) {
				const prefix = pattern.slice(0, open);
				const suffix = pattern.slice(i + 1);
				const body = pattern.slice(open + 1, i);
				const alternatives: string[] = [];
				let current = "";
				let inner = 0;
				for (const char of body) {
					if (char === "," && inner === 0) {
						alternatives.push(current);
						current = "";
					} else {
						if (char === "{") inner++;
						if (char === "}") inner--;
						current += char;
					}
				}
				alternatives.push(current);
				return alternatives.flatMap((alternative) => expandBraces(prefix + alternative + suffix));
			}
		}
	}
	return [pattern];
}

function globToRegExp(pattern: string): RegExp {
	let source = "";
	let i = 0;
	while (i < pattern.length) {
		const char = pattern[i]!;
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				const slashAfter = pattern[i + 2] === "/";
				source += slashAfter ? "(?:.*/)?" : ".*";
				i += slashAfter ? 3 : 2;
			} else {
				source += "[^/]*";
				i++;
			}
			continue;
		}
		if (char === "?") {
			source += "[^/]";
			i++;
			continue;
		}
		if (char === "[") {
			const end = pattern.indexOf("]", i + 1);
			if (end !== -1) {
				source += pattern.slice(i, end + 1);
				i = end + 1;
				continue;
			}
		}
		source += char.replace(/[.+^${}()|\\]/g, "\\$&");
		i++;
	}
	return new RegExp(`^${source}$`, "u");
}

export class Glob {
	#matcher: RegExp;

	constructor(pattern: string) {
		const alternatives = expandBraces(pattern.replaceAll("\\", "/")).map(globToRegExp);
		this.#matcher = new RegExp(alternatives.map((regex) => regex.source.slice(1, -1)).join("|"), "u");
	}

	match(relativePath: string): boolean {
		return this.#matcher.test(relativePath.replaceAll("\\", "/"));
	}
}

// =============================================================================
// The injected global
// =============================================================================

export const Bun = {
	env: process.env as Record<string, string | undefined>,
	stringWidth,
	color,
	hash: hashFn,
	stripANSI: stripAnsi,
	isMainThread,
	which,
	spawn,
	spawnSync,
	sleep,
	resolveSync,
	get main(): string {
		return process.argv[1] ?? "";
	},
	file,
	inspect,
	Glob,
};

export type BunShim = typeof Bun;
