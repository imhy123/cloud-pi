// cloud-pi-tui: adapted copy of pi packages/tui/src/utils.ts
// (commit 2a32a605a9f1). Pure TypeScript text engine with explicit tab width, terminal Jamo overrides, complete CSI detection and colon SGR state.
// See PATCHES.md.
/**
	* Pure-TypeScript terminal text engine.
	*
	* Replaces the native `pi-natives` text APIs (`visibleWidth`,
	* `truncateToWidth`, `sliceWithWidth`, `extractSegments`,
	* `wrapTextWithAnsi`) with an ANSI-aware implementation.
	*
	* The algorithms are ported from pi's `packages/tui/src/utils.ts`
	* (MIT, Copyright (c) 2025 Mario Zechner), generalized to take an explicit
	* tab width instead of the fixed 3-cell tab that pi assumes.
	*/

import { eastAsianWidth } from "get-east-asian-width";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const DEFAULT_TAB_WIDTH = 3;

const ZERO_WIDTH_REGEX = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;
const LEADING_NON_PRINTING_REGEX = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
const NON_PRINTING_CHAR_REGEX = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Mark}|\p{Surrogate})$/v;
const MARK_CHAR_REGEX = /^\p{Mark}$/v;
const TERMINAL_SPACING_MARK_REGEX =
	/^(?:[\p{Spacing_Mark}--[\u1734\u302E\u302F]]|[\u065F\u0F7F\u102B\u102C\u1031\u1033-\u1035\u1038\u103A-\u103E])+$/v;
const RGI_EMOJI_REGEX = /^\p{RGI_Emoji}$/v;

const CJK_BREAK_REGEX =
	/[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;

let hangulWidthOverride = 0;

/** 0 follows the platform, -1 follows Unicode, 1/2 force terminal Jamo width. */
export function setHangulCompatJamoWidthOverride(value: number): void {
	hangulWidthOverride = value;
	widthCache.clear();
}

const WIDTH_CACHE_SIZE = 512;
const widthCache = new Map<string, number>();

/** Length of the ANSI/OSC/APC escape sequence starting at `pos`, or 0 if there is none. */
function ansiCodeLength(str: string, pos: number): number {
	if (pos >= str.length || str.charCodeAt(pos) !== 0x1b) return 0;

	const next = str[pos + 1];

	if (next === "[") {
		for (let j = pos + 2; j < str.length; j++) {
			const c = str.charCodeAt(j);
			if (c >= 0x40 && c <= 0x7e) return j + 1 - pos;
		}
		return 0;
	}

	if (next === "]" || next === "_" || next === "P" || next === "^") {
		for (let j = pos + 2; j < str.length; j++) {
			const c = str.charCodeAt(j);
			if (c === 0x07) return j + 1 - pos;
			if (c === 0x1b && str[j + 1] === "\\") return j + 2 - pos;
		}
		return 0;
	}

	return next && /[\x30-\x7e]/.test(next) ? 2 : 0;
}

/** The escape sequence starting at `pos`, or null when there is none. */
export function extractAnsiCode(str: string, pos: number): { code: string; length: number } | null {
	const length = ansiCodeLength(str, pos);
	return length > 0 ? { code: str.substring(pos, pos + length), length } : null;
}

function couldBeEmoji(segment: string): boolean {
	const cp = segment.codePointAt(0)!;
	return (
		(cp >= 0x1f000 && cp <= 0x1fbff) ||
		(cp >= 0x2300 && cp <= 0x23ff) ||
		(cp >= 0x2600 && cp <= 0x27bf) ||
		(cp >= 0x2b50 && cp <= 0x2b55) ||
		segment.includes("\uFE0F") ||
		segment.length > 2
	);
}

/** Terminal width of a single grapheme cluster. */
function graphemeWidth(segment: string, tabWidth: number): number {
	const target = hangulWidthOverride === 0 ? (process.platform === "darwin" ? 1 : -1) : hangulWidthOverride;
	if (segment.length === 1 && segment.charCodeAt(0) >= 0x3131 && segment.charCodeAt(0) <= 0x318e) {
		if (segment === "\u3164") return target === 1 ? 1 : 0;
		if (target === 1 || target === 2) return target;
	}
	if (segment.length === 1) {
		const code = segment.charCodeAt(0);
		if (code >= 0x20 && code <= 0x7e) return 1;
		if (code === 0x09) return tabWidth;
	}

	if (TERMINAL_SPACING_MARK_REGEX.test(segment)) {
		return [...segment].length;
	}

	if (ZERO_WIDTH_REGEX.test(segment)) {
		return 0;
	}

	if (couldBeEmoji(segment) && RGI_EMOJI_REGEX.test(segment)) {
		return 2;
	}

	const base = segment.replace(LEADING_NON_PRINTING_REGEX, "");
	const cp = base.codePointAt(0);
	if (cp === undefined) {
		return 0;
	}

	if (cp >= 0x1f1e6 && cp <= 0x1f1ff) {
		return 2;
	}

	let width = eastAsianWidth(cp);

	let followsMark = false;
	const chars = [...base];
	for (const char of chars.slice(1)) {
		if (TERMINAL_SPACING_MARK_REGEX.test(char)) {
			width += 1;
			followsMark = false;
		} else if (MARK_CHAR_REGEX.test(char)) {
			followsMark = true;
		} else if (!NON_PRINTING_CHAR_REGEX.test(char)) {
			const c = char.codePointAt(0)!;
			if (followsMark || (c >= 0xff00 && c <= 0xffef)) {
				width += eastAsianWidth(c);
			} else if (c === 0x0e33 || c === 0x0eb3) {
				width += 1;
			}
			followsMark = false;
		}
	}

	return width;
}

/** Visible width of `str` in terminal cells, ignoring ANSI escape sequences. */
export function visibleWidth(str: string, tabWidth: number = DEFAULT_TAB_WIDTH): number {
	if (str.length === 0) return 0;

	const ascii = asciiVisibleWidth(str, tabWidth);
	if (ascii !== -1) return ascii;

	const cacheKey = tabWidth === DEFAULT_TAB_WIDTH ? str : `${tabWidth}\u0000${str}`;
	const cached = widthCache.get(cacheKey);
	if (cached !== undefined) return cached;

	let width = 0;
	for (const { segment } of graphemeSegmenter.segment(stripAnsi(str))) {
		width += graphemeWidth(segment, tabWidth);
	}

	if (widthCache.size >= WIDTH_CACHE_SIZE) {
		const firstKey = widthCache.keys().next().value;
		if (firstKey !== undefined) widthCache.delete(firstKey);
	}
	widthCache.set(cacheKey, width);
	return width;
}

/** Width of a printable-ASCII string, or -1 when it contains anything else. */
function asciiVisibleWidth(str: string, tabWidth: number): number {
	let width = 0;
	let i = 0;
	while (i < str.length) {
		const code = str.charCodeAt(i);
		if (code >= 0x20 && code <= 0x7e) {
			width++;
			i++;
		} else if (code === 0x09) {
			width += tabWidth;
			i++;
		} else if (code === 0x1b) {
			const length = ansiCodeLength(str, i);
			if (length === 0) return -1;
			i += length;
		} else {
			return -1;
		}
	}
	return width;
}

/** Remove ANSI/OSC/APC escape sequences while keeping visible text. */
export function stripAnsi(str: string): string {
	if (!str.includes("\x1b")) return str;
	let result = "";
	let i = 0;
	while (i < str.length) {
		const ansi = extractAnsiCode(str, i);
		if (ansi) {
			i += ansi.length;
			continue;
		}
		result += str[i];
		i++;
	}
	return result;
}

function isPrintableAscii(str: string): boolean {
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (code < 0x20 || code > 0x7e) return false;
	}
	return true;
}

/** Collect every ANSI code in `text` in order. */
function extractAnsiCodes(text: string): string {
	let result = "";
	let i = text.indexOf("\x1b");
	while (i !== -1) {
		const length = ansiCodeLength(text, i);
		if (length > 0) {
			result += text.substring(i, i + length);
			i += length;
		} else {
			i++;
		}
		i = text.indexOf("\x1b", i);
	}
	return result;
}

type Osc8Terminator = "\x07" | "\x1b\\";

interface ActiveHyperlink {
	params: string;
	url: string;
	terminator: Osc8Terminator;
}

function parseOsc8Hyperlink(ansiCode: string): ActiveHyperlink | null | undefined {
	if (!ansiCode.startsWith("\x1b]8;")) return undefined;

	const terminator: Osc8Terminator = ansiCode.endsWith("\x07") ? "\x07" : "\x1b\\";
	const body = ansiCode.slice(4, terminator === "\x07" ? -1 : -2);
	const separatorIndex = body.indexOf(";");
	if (separatorIndex === -1) return undefined;

	const params = body.slice(0, separatorIndex);
	const url = body.slice(separatorIndex + 1);
	if (!url) return null;
	return { params, url, terminator };
}

function formatOsc8Hyperlink(hyperlink: ActiveHyperlink): string {
	return `\x1b]8;${hyperlink.params};${hyperlink.url}${hyperlink.terminator}`;
}

function formatOsc8Close(terminator: Osc8Terminator): string {
	return `\x1b]8;;${terminator}`;
}

/** Tracks active SGR attributes so they can be re-opened across line breaks. */
class AnsiCodeTracker {
	bold = false;
	dim = false;
	italic = false;
	underline = false;
	underlineStyle = "4";
	underlineColor: string | null = null;
	blink = false;
	inverse = false;
	hidden = false;
	strikethrough = false;
	fgColor: string | null = null;
	bgColor: string | null = null;
	activeHyperlink: ActiveHyperlink | null = null;

	process(ansiCode: string): void {
		const hyperlink = parseOsc8Hyperlink(ansiCode);
		if (hyperlink !== undefined) {
			this.activeHyperlink = hyperlink;
			return;
		}

		if (!ansiCode.endsWith("m")) return;

		const match = ansiCode.match(/\x1b\[([\d;:]*)m/);
		if (!match) return;

		const params = match[1];
		if (params === "" || params === "0") {
			this.reset();
			return;
		}

		const parts = params.split(";");
		let i = 0;
		while (i < parts.length) {
			const part = parts[i]!;
			const code = Number.parseInt(part, 10);
			if (part.includes(":")) {
				if (code === 4) { this.underline = Number(part.split(":")[1]) !== 0; this.underlineStyle = part; }
				else if (code === 38) this.fgColor = part;
				else if (code === 48) this.bgColor = part;
				else if (code === 58) this.underlineColor = part;
				i++;
				continue;
			}

			if (code === 38 || code === 48 || code === 58) {
				if (parts[i + 1] === "5" && parts[i + 2] !== undefined) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
					if (code === 38) this.fgColor = colorCode;
					else if (code === 48) this.bgColor = colorCode;
					else this.underlineColor = colorCode;
					i += 3;
					continue;
				}
				if (parts[i + 1] === "2" && parts[i + 4] !== undefined) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
					if (code === 38) this.fgColor = colorCode;
					else if (code === 48) this.bgColor = colorCode;
					else this.underlineColor = colorCode;
					i += 5;
					continue;
				}
			}

			switch (code) {
				case 0:
					this.reset();
					break;
				case 1:
					this.bold = true;
					break;
				case 2:
					this.dim = true;
					break;
				case 3:
					this.italic = true;
					break;
				case 4:
					this.underline = true;
					this.underlineStyle = "4";
					break;
				case 5:
					this.blink = true;
					break;
				case 7:
					this.inverse = true;
					break;
				case 8:
					this.hidden = true;
					break;
				case 9:
					this.strikethrough = true;
					break;
				case 21:
					this.bold = false;
					break;
				case 22:
					this.bold = false;
					this.dim = false;
					break;
				case 23:
					this.italic = false;
					break;
				case 24:
					this.underline = false;
					break;
				case 25:
					this.blink = false;
					break;
				case 27:
					this.inverse = false;
					break;
				case 28:
					this.hidden = false;
					break;
				case 29:
					this.strikethrough = false;
					break;
				case 39:
					this.fgColor = null;
					break;
				case 59:
					this.underlineColor = null;
					break;
				case 49:
					this.bgColor = null;
					break;
				default:
					if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) this.fgColor = String(code);
					else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) this.bgColor = String(code);
					break;
			}
			i++;
		}
	}

	reset(): void {
		this.bold = false;
		this.dim = false;
		this.italic = false;
		this.underline = false;
		this.blink = false;
		this.inverse = false;
		this.hidden = false;
		this.strikethrough = false;
		this.fgColor = null;
		this.bgColor = null;
		this.underlineColor = null;
		this.underlineStyle = "4";
	}

	clear(): void {
		this.reset();
		this.activeHyperlink = null;
	}

	getActiveCodes(): string {
		const codes: string[] = [];
		if (this.bold) codes.push("1");
		if (this.dim) codes.push("2");
		if (this.italic) codes.push("3");
		if (this.underline) codes.push(this.underlineStyle);
		if (this.blink) codes.push("5");
		if (this.inverse) codes.push("7");
		if (this.hidden) codes.push("8");
		if (this.strikethrough) codes.push("9");
		if (this.fgColor) codes.push(this.fgColor);
		if (this.bgColor) codes.push(this.bgColor);
		if (this.underlineColor) codes.push(this.underlineColor);

		let result = codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
		if (this.activeHyperlink) result += formatOsc8Hyperlink(this.activeHyperlink);
		return result;
	}

	getLineEndReset(): string {
		let result = "";
		if (this.underline) result += "\x1b[24m";
		if (this.strikethrough) result += "\x1b[29m";
		if (this.activeHyperlink) result += formatOsc8Close(this.activeHyperlink.terminator);
		return result;
	}
}

function updateTrackerFromText(text: string, tracker: AnsiCodeTracker): void {
	let i = text.indexOf("\x1b");
	while (i !== -1) {
		const length = ansiCodeLength(text, i);
		if (length > 0) {
			tracker.process(text.substring(i, i + length));
			i += length;
		} else {
			i++;
		}
		i = text.indexOf("\x1b", i);
	}
}

/** Split text into words and whitespace runs while keeping ANSI codes attached. */
function splitIntoTokensWithAnsi(text: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let pendingAnsi = "";
	let currentKind: "space" | "word" | null = null;
	let i = 0;

	const flushCurrent = (): void => {
		if (!current) return;
		tokens.push(current);
		current = "";
		currentKind = null;
	};

	while (i < text.length) {
		const ansiResult = extractAnsiCode(text, i);
		if (ansiResult) {
			pendingAnsi += ansiResult.code;
			i += ansiResult.length;
			continue;
		}

		let end = text.indexOf("\x1b", i + 1);
		while (end !== -1 && ansiCodeLength(text, end) === 0) {
			end = text.indexOf("\x1b", end + 1);
		}
		if (end === -1) end = text.length;

		const chunk = text.slice(i, end);
		const ascii = isPrintableAscii(chunk);
		const segments = ascii ? chunk : [...graphemeSegmenter.segment(chunk)].map((s) => s.segment);
		for (const segment of segments) {
			const segmentIsSpace = segment === " ";
			if (!ascii && !segmentIsSpace && CJK_BREAK_REGEX.test(segment)) {
				flushCurrent();
				tokens.push(pendingAnsi + segment);
				pendingAnsi = "";
				continue;
			}

			const segmentKind = segmentIsSpace ? "space" : "word";
			if (current && currentKind !== segmentKind) flushCurrent();

			if (pendingAnsi) {
				current += pendingAnsi;
				pendingAnsi = "";
			}

			currentKind = segmentKind;
			current += segment;
		}

		i = end;
	}

	if (pendingAnsi) {
		if (current) current += pendingAnsi;
		else if (tokens.length > 0) tokens[tokens.length - 1] += pendingAnsi;
		else current = pendingAnsi;
	}

	if (current) tokens.push(current);
	return tokens;
}

function isWhitespaceToken(token: string): boolean {
	let i = 0;
	while (i < token.length) {
		const code = token.charCodeAt(i);
		if (code === 0x1b) {
			const length = ansiCodeLength(token, i);
			if (length === 0) return false;
			i += length;
		} else if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) {
			i++;
		} else {
			return false;
		}
	}
	return true;
}

function breakLongWord(word: string, width: number, tracker: AnsiCodeTracker, tabWidth: number): string[] {
	const lines: string[] = [];
	let currentLine = tracker.getActiveCodes();
	let currentWidth = 0;

	let i = 0;
	const segments: Array<{ type: "ansi" | "grapheme"; value: string }> = [];

	while (i < word.length) {
		const ansiResult = extractAnsiCode(word, i);
		if (ansiResult) {
			segments.push({ type: "ansi", value: ansiResult.code });
			i += ansiResult.length;
		} else {
			let end = i;
			while (end < word.length) {
				const nextAnsi = extractAnsiCode(word, end);
				if (nextAnsi) break;
				end++;
			}
			const textPortion = word.slice(i, end);
			for (const seg of graphemeSegmenter.segment(textPortion)) {
				segments.push({ type: "grapheme", value: seg.segment });
			}
			i = end;
		}
	}

	for (const seg of segments) {
		if (seg.type === "ansi") {
			currentLine += seg.value;
			tracker.process(seg.value);
			continue;
		}

		const grapheme = seg.value;
		if (!grapheme) continue;

		const width_ = graphemeWidth(grapheme, tabWidth);

		if (currentWidth + width_ > width) {
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset) currentLine += lineEndReset;
			lines.push(currentLine);
			currentLine = tracker.getActiveCodes();
			currentWidth = 0;
		}

		currentLine += grapheme;
		currentWidth += width_;
	}

	if (currentLine) lines.push(currentLine);
	return lines.length > 0 ? lines : [""];
}

function finalizeTruncatedResult(
	prefix: string,
	prefixWidth: number,
	ellipsis: string,
	ellipsisWidth: number,
	maxWidth: number,
	pad: boolean,
): string {
	const reset = "\x1b[0m";
	const hyperlinkClose = getActiveOsc8Close(prefix);
	const visible = prefixWidth + ellipsisWidth;
	const result = ellipsis.length > 0 ? `${prefix}${hyperlinkClose}${reset}${ellipsis}${reset}` : `${prefix}${hyperlinkClose}${reset}`;
	return pad ? result + " ".repeat(Math.max(0, maxWidth - visible)) : result;
}

function getActiveOsc8Close(prefix: string): string {
	if (!prefix.includes("\x1b]8;")) return "";

	let activeHyperlink: ActiveHyperlink | null = null;
	let i = 0;
	while (i < prefix.length) {
		const ansi = extractAnsiCode(prefix, i);
		if (ansi) {
			const hyperlink = parseOsc8Hyperlink(ansi.code);
			if (hyperlink !== undefined) activeHyperlink = hyperlink;
			i += ansi.length;
		} else {
			i++;
		}
	}
	return activeHyperlink ? formatOsc8Close(activeHyperlink.terminator) : "";
}

function truncateFragmentToWidth(
	text: string,
	maxWidth: number,
	tabWidth: number,
): { text: string; width: number } {
	if (maxWidth <= 0 || text.length === 0) return { text: "", width: 0 };

	if (isPrintableAscii(text)) {
		const clipped = text.slice(0, maxWidth);
		return { text: clipped, width: clipped.length };
	}

	const hasAnsi = text.includes("\x1b");
	const hasTabs = text.includes("\t");
	if (!hasAnsi && !hasTabs) {
		let result = "";
		let width = 0;
		for (const { segment } of graphemeSegmenter.segment(text)) {
			const w = graphemeWidth(segment, tabWidth);
			if (width + w > maxWidth) break;
			result += segment;
			width += w;
		}
		return { text: result, width };
	}

	let result = "";
	let width = 0;
	let i = 0;
	let pendingAnsi = "";

	while (i < text.length) {
		const ansi = extractAnsiCode(text, i);
		if (ansi) {
			pendingAnsi += ansi.code;
			i += ansi.length;
			continue;
		}

		if (text[i] === "\t") {
			if (width + tabWidth > maxWidth) break;
			if (pendingAnsi) {
				result += pendingAnsi;
				pendingAnsi = "";
			}
			result += "\t";
			width += tabWidth;
			i++;
			continue;
		}

		let end = i;
		while (end < text.length && text[end] !== "\t") {
			if (extractAnsiCode(text, end)) break;
			end++;
		}

		for (const { segment } of graphemeSegmenter.segment(text.slice(i, end))) {
			const w = graphemeWidth(segment, tabWidth);
			if (width + w > maxWidth) return { text: result, width };
			if (pendingAnsi) {
				result += pendingAnsi;
				pendingAnsi = "";
			}
			result += segment;
			width += w;
		}
		i = end;
	}

	return { text: result, width };
}

/** Truncate `text` to `maxWidth` visible cells, appending `ellipsis` when clipped. */
export function truncateToWidth(
	text: string,
	maxWidth: number,
	ellipsis: string = "…",
	pad: boolean = false,
	tabWidth: number = DEFAULT_TAB_WIDTH,
): string {
	if (maxWidth <= 0) return "";

	if (text.length === 0) return pad ? " ".repeat(maxWidth) : "";

	const ellipsisWidth = visibleWidth(ellipsis, tabWidth);
	if (ellipsisWidth >= maxWidth) {
		const textWidth = visibleWidth(text, tabWidth);
		if (textWidth <= maxWidth) return pad ? text + " ".repeat(maxWidth - textWidth) : text;

		const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth, tabWidth);
		if (clippedEllipsis.width === 0) return pad ? " ".repeat(maxWidth) : "";
		return finalizeTruncatedResult("", 0, clippedEllipsis.text, clippedEllipsis.width, maxWidth, pad);
	}

	if (isPrintableAscii(text)) {
		if (text.length <= maxWidth) return pad ? text + " ".repeat(maxWidth - text.length) : text;
		const targetWidth = maxWidth - ellipsisWidth;
		return finalizeTruncatedResult(text.slice(0, targetWidth), targetWidth, ellipsis, ellipsisWidth, maxWidth, pad);
	}

	const targetWidth = maxWidth - ellipsisWidth;
	let result = "";
	let pendingAnsi = "";
	let visibleSoFar = 0;
	let keptWidth = 0;
	let keepContiguousPrefix = true;
	let overflowed = false;
	let exhaustedInput = false;
	const hasAnsi = text.includes("\x1b");
	const hasTabs = text.includes("\t");

	if (!hasAnsi && !hasTabs) {
		for (const { segment } of graphemeSegmenter.segment(text)) {
			const width = graphemeWidth(segment, tabWidth);
			if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
				result += segment;
				keptWidth += width;
			} else {
				keepContiguousPrefix = false;
			}
			visibleSoFar += width;
			if (visibleSoFar > maxWidth) {
				overflowed = true;
				break;
			}
		}
		exhaustedInput = !overflowed;
	} else {
		let i = 0;
		while (i < text.length) {
			const ansi = extractAnsiCode(text, i);
			if (ansi) {
				pendingAnsi += ansi.code;
				i += ansi.length;
				continue;
			}

			if (text[i] === "\t") {
				if (keepContiguousPrefix && keptWidth + tabWidth <= targetWidth) {
					if (pendingAnsi) {
						result += pendingAnsi;
						pendingAnsi = "";
					}
					result += "\t";
					keptWidth += tabWidth;
				} else {
					keepContiguousPrefix = false;
					pendingAnsi = "";
				}
				visibleSoFar += tabWidth;
				if (visibleSoFar > maxWidth) {
					overflowed = true;
					break;
				}
				i++;
				continue;
			}

			let end = i;
			while (end < text.length && text[end] !== "\t") {
				if (extractAnsiCode(text, end)) break;
				end++;
			}

			for (const { segment } of graphemeSegmenter.segment(text.slice(i, end))) {
				const width = graphemeWidth(segment, tabWidth);
				if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
					if (pendingAnsi) {
						result += pendingAnsi;
						pendingAnsi = "";
					}
					result += segment;
					keptWidth += width;
				} else {
					keepContiguousPrefix = false;
					pendingAnsi = "";
				}

				visibleSoFar += width;
				if (visibleSoFar > maxWidth) {
					overflowed = true;
					break;
				}
			}
			if (overflowed) break;
			i = end;
		}
		exhaustedInput = i >= text.length;
	}

	if (!overflowed && exhaustedInput) {
		return pad ? text + " ".repeat(Math.max(0, maxWidth - visibleSoFar)) : text;
	}

	return finalizeTruncatedResult(result, keptWidth, ellipsis, ellipsisWidth, maxWidth, pad);
}

/** Slice `length` visible columns starting at `startCol`, preserving ANSI styling. */
export function sliceWithWidth(
	line: string,
	startCol: number,
	length: number,
	strict: boolean = false,
	tabWidth: number = DEFAULT_TAB_WIDTH,
): { text: string; width: number } {
	if (length <= 0) return { text: "", width: 0 };
	const endCol = startCol + length;
	let result = "";
	let resultWidth = 0;
	let currentCol = 0;
	let i = 0;
	let pendingAnsi = "";

	while (i < line.length) {
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			if (currentCol >= startCol && currentCol < endCol) {
				result += pendingAnsi + ansi.code;
				pendingAnsi = "";
			} else if (currentCol < startCol && !ansi.code.startsWith("\x1b_")) {
				pendingAnsi += ansi.code;
			}
			i += ansi.length;
			continue;
		}

		let textEnd = i;
		while (textEnd < line.length && !extractAnsiCode(line, textEnd)) textEnd++;

		for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
			const w = graphemeWidth(segment, tabWidth);
			const inRange = currentCol >= startCol && currentCol < endCol;
			const fits = !strict || currentCol + w <= endCol;
			if (inRange && fits) {
				if (pendingAnsi) {
					result += pendingAnsi;
					pendingAnsi = "";
				}
				result += segment;
				resultWidth += w;
			}
			currentCol += w;
			if (currentCol >= endCol) break;
		}
		i = textEnd;
		if (currentCol >= endCol) break;
	}
	return { text: result, width: resultWidth };
}

const pooledStyleTracker = new AnsiCodeTracker();

/** Slice the before/after regions around a composited overlay span. */
export function extractSegments(
	line: string,
	beforeEnd: number,
	afterStart: number,
	afterLen: number,
	strictAfter: boolean = false,
	tabWidth: number = DEFAULT_TAB_WIDTH,
): { before: string; beforeWidth: number; after: string; afterWidth: number } {
	let before = "";
	let beforeWidth = 0;
	let after = "";
	let afterWidth = 0;
	let currentCol = 0;
	let i = 0;
	let pendingAnsiBefore = "";
	let afterStarted = false;
	const afterEnd = afterStart + afterLen;

	pooledStyleTracker.clear();

	while (i < line.length) {
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			pooledStyleTracker.process(ansi.code);
			if (currentCol < beforeEnd) {
				pendingAnsiBefore += ansi.code;
			} else if (
				currentCol >= afterStart &&
				currentCol < afterEnd &&
				(afterStarted || ansi.code.startsWith("\x1b_"))
			) {
				after += ansi.code;
			}
			i += ansi.length;
			continue;
		}

		let textEnd = i;
		while (textEnd < line.length && !extractAnsiCode(line, textEnd)) textEnd++;

		for (const { segment } of graphemeSegmenter.segment(line.slice(i, textEnd))) {
			const w = graphemeWidth(segment, tabWidth);

			if (currentCol < beforeEnd && currentCol + w <= beforeEnd) {
				if (pendingAnsiBefore) {
					before += pendingAnsiBefore;
					pendingAnsiBefore = "";
				}
				before += segment;
				beforeWidth += w;
			} else if (currentCol >= afterStart && currentCol < afterEnd) {
				const fits = !strictAfter || currentCol + w <= afterEnd;
				if (fits) {
					if (!afterStarted) {
						after += pooledStyleTracker.getActiveCodes();
						afterStarted = true;
					}
					after += segment;
					afterWidth += w;
				}
			}

			currentCol += w;
			if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd) break;
		}
		i = textEnd;
		if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd) break;
	}

	return { before, beforeWidth, after, afterWidth };
}

function wrapSingleLine(line: string, width: number, tabWidth: number): string[] {
	if (!line) return [""];

	if (visibleWidth(line, tabWidth) <= width) return [line];

	const wrapped: string[] = [];
	const tracker = new AnsiCodeTracker();
	const tokens = splitIntoTokensWithAnsi(line);

	let currentLine = "";
	let currentVisibleLength = 0;

	for (const token of tokens) {
		const tokenVisibleLength = visibleWidth(token, tabWidth);
		const isWhitespace = isWhitespaceToken(token);

		if (tokenVisibleLength > width && !isWhitespace) {
			if (currentLine) {
				currentLine = currentLine.trimEnd();
				const lineEndReset = tracker.getLineEndReset();
				if (lineEndReset) currentLine += lineEndReset;
				wrapped.push(currentLine);
				currentLine = "";
				currentVisibleLength = 0;
			}

			const broken = breakLongWord(token, width, tracker, tabWidth);
			for (let i = 0; i < broken.length - 1; i++) wrapped.push(broken[i]!);
			currentLine = broken[broken.length - 1]!;
			currentVisibleLength = visibleWidth(currentLine, tabWidth);
			continue;
		}

		const totalNeeded = currentVisibleLength + tokenVisibleLength;

		if (totalNeeded > width && currentVisibleLength > 0) {
			let lineToWrap = currentLine.trimEnd();
			if (isWhitespace) {
				lineToWrap += extractAnsiCodes(token);
				updateTrackerFromText(token, tracker);
			}
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset) lineToWrap += lineEndReset;
			wrapped.push(lineToWrap);
			if (isWhitespace) {
				currentLine = tracker.getActiveCodes();
				currentVisibleLength = 0;
				continue;
			}
			currentLine = tracker.getActiveCodes() + token;
			currentVisibleLength = tokenVisibleLength;
		} else if (isWhitespace && totalNeeded > width && token.includes("\x1b")) {
			currentLine += extractAnsiCodes(token);
		} else {
			currentLine += token;
			currentVisibleLength += tokenVisibleLength;
		}

		updateTrackerFromText(token, tracker);
	}

	if (currentLine) wrapped.push(currentLine);
	return wrapped.length > 0 ? wrapped.map((line) => line.trimEnd()) : [""];
}

/** Word-wrap ANSI-styled text to `width` visible cells per line. */
export function wrapTextWithAnsi(text: string, width: number, tabWidth: number = DEFAULT_TAB_WIDTH): string[] {
	if (!text) return [""];

	const inputLines = text.split(/\r\n|\r|\n/);
	const result: string[] = [];
	const tracker = new AnsiCodeTracker();

	for (const inputLine of inputLines) {
		const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
		for (const wrappedLine of wrapSingleLine(prefix + inputLine, width, tabWidth)) {
			result.push(wrappedLine);
		}
		updateTrackerFromText(inputLine, tracker);
	}

	return result.length > 0 ? result : [""];
}
