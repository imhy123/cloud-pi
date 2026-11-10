// @cloud-pi/tui example: welcome banner driven by the hand-drawn wordmark.txt.
//
// Run: node --import ./register.mjs 11-welcome/welcome.ts
//
// The art lives in wordmark.txt beside this file. Draw half-block glyphs
// (█ both pixels, ▀ top, ▄ bottom, ▔ separator rule, space empty), save,
// re-run.
//
// Directives above `### art` configure the banner:
//
//   @color gradient|text   gradient = animated gradient + shine (default)
//   @version v0.1.0
//   @tip Tip: Ctrl+C exits Cloud-Pi.
import { readFile } from "node:fs/promises";
import {
	type Component,
	initTheme,
	matchesKey,
	ProcessTerminal,
	TERMINAL,
	theme,
	TUI,
	visibleWidth,
} from "@cloud-pi/tui";

await initTheme();

const APP_NAME = "Cloud-Pi";
const DEFAULT_VERSION = "v0.1.0";
const DEFAULT_TIP = "Tip: Ctrl+C exits Cloud-Pi.";

/** Homepage shown beside the version, in plain text. */
const HOMEPAGE = "cloud-pi.com";

/** Partner / custom-edition label shown beside the wordmark; empty hides it. */
const EDITION: string = "Vibyte Buddy";
/** Partner version shown on the row under the label; empty hides just that row. */
const EDITION_VERSION: string = "v0.0.1";
/** Columns between the wordmark and the partner block. */
const EDITION_GAP = 3;

/** Separator-rule color once the intro settles; during the intro it joins the gradient. */
const RULE_GRAY = TERMINAL.trueColor ? "\x1b[38;2;128;128;128m" : "\x1b[38;5;244m";

/** Partner label color: plain white, independent of the theme. */
const PARTNER_WHITE = "\x1b[97m";

/** Total length of the intro animation. */
const INTRO_MS = 3000;
/** Render cadence during the intro (~30fps). */
const INTRO_TICK_MS = 33;
/** Number of full gradient rotations the sweep performs before settling. */
const INTRO_SWEEPS = 2.5;
/** Number of times the shine highlight crosses the diagonal across the intro. */
const INTRO_SHINE_TRAVERSALS = 3;

/** Narrowest terminal that still shows the tip line; below it the banner is the logo alone. */
const TIP_MIN_COLUMNS = 50;

/** Multi-stop palette for the diagonal gradient. */
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
	[248, 79, 204],
	[147, 98, 244],
	[0, 219, 228],
];

/** 256-color ramp fallback when truecolor isn't available. */
const GRADIENT_RAMP_256 = [206, 170, 134, 99, 69, 74, 44];

/** Half-width of the shine highlight band, expressed in gradient-t units. */
const SHINE_HALF_WIDTH = 0.18;

interface ShineConfig {
	/** Overall opacity of the shine overlay, in [0, 1]. */
	strength: number;
	/** Center of the shine band along the diagonal, in [0, 1]. */
	pos: number;
}

interface Wordmark {
	/** Ink pixels, two rows per drawn art line; `pixels[y][x]` is true where inked. */
	pixels: boolean[][];
	/** Separator-rule pixels, same shape as {@link pixels}; colored gray once the intro settles. */
	rules: boolean[][];
	/** Art columns after padding each drawn line to the widest one. */
	width: number;
	/** Drawn art lines padded to `width`, used as-is for the static "text" mode. */
	lines: string[];
	color: "gradient" | "text";
	version: string;
	tip: string;
}

/**
 * Parse wordmark.txt: uncommented `@key value` directives before the `### art`
 * marker, then the drawn half-block lines after it.
 */
async function loadWordmark(path: URL): Promise<Wordmark> {
	const directives: Record<string, string> = {};
	const art: string[] = [];
	let inArt = false;
	for (const rawLine of (await readFile(path, "utf8")).split(/\r?\n/)) {
		if (!inArt) {
			if (rawLine.trim() === "### art") {
				inArt = true;
				continue;
			}
			const directive = /^\s*@([a-z]+)\s+(.+)$/.exec(rawLine);
			// An uncommented template line keeps its inline "# ..." explanation.
			if (directive) directives[directive[1]] = directive[2].replace(/\s+#.*$/, "").trim();
			continue;
		}
		if (rawLine.trim() !== "") art.push(rawLine.trimEnd());
	}
	if (art.length === 0) throw new Error(`${path.pathname}: no art lines after "### art"`);

	const width = Math.max(...art.map(line => [...line].length));
	const pixels: boolean[][] = [];
	const rules: boolean[][] = [];
	for (const line of art) {
		const chars = [...line];
		const top: boolean[] = [];
		const bottom: boolean[] = [];
		const rule: boolean[] = [];
		for (let x = 0; x < width; x++) {
			const ch = chars[x] ?? " ";
			const isRule = ch === "▔";
			top.push(ch === "█" || ch === "▀" || isRule);
			bottom.push(ch === "█" || ch === "▄");
			rule.push(isRule);
		}
		pixels.push(top, bottom);
		rules.push(rule, rule.map(() => false));
	}

	return {
		pixels,
		rules,
		width,
		lines: art.map(line => line + " ".repeat(width - [...line].length)),
		color: directives.color === "text" ? "text" : "gradient",
		version: directives.version ?? DEFAULT_VERSION,
		tip: directives.tip ?? DEFAULT_TIP,
	};
}

const WORDMARK = await loadWordmark(new URL("./wordmark.txt", import.meta.url));

/**
 * SGR escape for a normalized position `t` (0..1) along the diagonal, for the
 * foreground or background layer. Half-block cells color both layers, so the
 * gradient stays per-pixel even though a character covers two pixel rows.
 */
function gradientSgr(t: number, layer: "fg" | "bg", shine?: ShineConfig): string {
	const code = layer === "fg" ? 38 : 48;
	const shineStrength = shine && shine.strength > 0 ? shine.strength : 0;
	const shinePos = shine ? shine.pos : 0;
	if (TERMINAL.trueColor) {
		const stops = GRADIENT_STOPS;
		const seg = t * (stops.length - 1);
		const i = Math.min(stops.length - 2, Math.floor(seg));
		const f = seg - i;
		const a = stops[i];
		const b = stops[i + 1];
		let r = a[0] + (b[0] - a[0]) * f;
		let g = a[1] + (b[1] - a[1]) * f;
		let bl = a[2] + (b[2] - a[2]) * f;
		if (shineStrength > 0) {
			const dist = Math.abs(t - shinePos);
			const intensity = Math.max(0, 1 - dist / SHINE_HALF_WIDTH) * shineStrength;
			if (intensity > 0) {
				r += (255 - r) * intensity;
				g += (255 - g) * intensity;
				bl += (255 - bl) * intensity;
			}
		}
		return `\x1b[${code};2;${Math.round(r)};${Math.round(g)};${Math.round(bl)}m`;
	}
	const ramp = GRADIENT_RAMP_256;
	let idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(t * (ramp.length - 1) + 0.5)));
	if (shineStrength > 0) {
		const dist = Math.abs(t - shinePos);
		const intensity = Math.max(0, 1 - dist / SHINE_HALF_WIDTH) * shineStrength;
		// Promote to the brightest ramp slot when the shine band peaks here.
		if (intensity > 0.5) idx = ramp.length - 1;
	}
	return `\x1b[${code};5;${ramp[idx]}m`;
}

/**
 * Render the wordmark as half-block rows: '▀' with a foreground top pixel and
 * background bottom pixel, '▄' for a lone bottom pixel, and a plain space
 * where both are empty. `phase` shifts the gradient along the diagonal; an
 * optional shine band is composited on top. `resting` paints separator rules
 * gray instead of taking the gradient.
 */
function gradientWordmark(phase = 0, shine?: ShineConfig, resting = false): string[] {
	const { pixels, rules, width } = WORDMARK;
	const xSpan = Math.max(1, width - 1);
	const ySpan = Math.max(1, pixels.length - 1);
	const normalizedPhase = ((phase % 1) + 1) % 1;
	const rows = Math.ceil(pixels.length / 2);
	const out: string[] = [];
	for (let row = 0; row < rows; row++) {
		const topRow = pixels[row * 2];
		const bottomRow = pixels[row * 2 + 1];
		const ruleRow = rules[row * 2];
		let line = "";
		for (let x = 0; x < width; x++) {
			const top = topRow?.[x] === true;
			const bottom = bottomRow?.[x] === true;
			const restingRule = resting && ruleRow?.[x] === true;
			if (!top && !bottom) {
				line += " ";
				continue;
			}
			const topY = row * 2;
			const bottomY = row * 2 + 1;
			const baseTop = (x / xSpan + topY / ySpan) / 2;
			const baseBottom = (x / xSpan + bottomY / ySpan) / 2;
			const tTop = normalizedPhase === 0 ? baseTop : (baseTop + normalizedPhase) % 1;
			const tBottom = normalizedPhase === 0 ? baseBottom : (baseBottom + normalizedPhase) % 1;
			if (top && bottom) {
				line += `${gradientSgr(tTop, "fg", shine)}${gradientSgr(tBottom, "bg", shine)}▀\x1b[0m`;
			} else if (top) {
				line += `${restingRule ? RULE_GRAY : gradientSgr(tTop, "fg", shine)}▀\x1b[0m`;
			} else {
				line += `${gradientSgr(tBottom, "fg", shine)}▄\x1b[0m`;
			}
		}
		out.push(line);
	}
	return out;
}

/**
 * Logo frame for a normalized intro progress in [0, 1). Ease-out cubic so the
 * spin decelerates into the resting state; the shine fades with the same curve.
 */
function introLogoFrame(progress: number): string[] {
	const eased = 1 - (1 - progress) ** 3;
	const phase = ((((1 - eased) * INTRO_SWEEPS) % 1) + 1) % 1;
	const shinePos = (((progress * INTRO_SHINE_TRAVERSALS) % 1) + 1) % 1;
	const shineStrength = (1 - eased) ** 1.5;
	return gradientWordmark(phase, { strength: shineStrength, pos: shinePos });
}

/** Resting frame: the gradient at phase 0 with a gray separator, or the art in a flat theme color. */
const REST_FRAME: readonly string[] =
	WORDMARK.color === "text"
		? WORDMARK.lines.map(line => theme.bold(theme.fg("text", line)))
		: gradientWordmark(0, undefined, true);

/** Left padding that centers a block `blockWidth` wide inside `total` columns. */
function centerIndent(blockWidth: number, total: number): string {
	return " ".repeat(Math.max(0, Math.floor((total - blockWidth) / 2)));
}

/** Indent `lines` as one block whose widest line is centered in `width` columns. */
function centerBlock(lines: readonly string[], width: number): string[] {
	const widest = lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
	const indent = centerIndent(widest, width);
	return lines.map(line => indent + line);
}

/** Pad a rendered line to `width` visible columns. */
function padTo(line: string, width: number): string {
	return line + " ".repeat(Math.max(0, width - visibleWidth(line)));
}

/**
 * Attach the partner block to the wordmark: its name on the top row and its
 * version on the row below, right-aligned as one stacked label beside the
 * brand.
 */
function withPartner(frame: readonly string[], name: string, version: string): readonly string[] {
	if (name === "" && version === "") return frame;
	const width = Math.max(visibleWidth(name), visibleWidth(version));
	const gap = " ".repeat(EDITION_GAP);
	const lines = [...frame];
	if (name !== "") {
		const lead = " ".repeat(width - visibleWidth(name));
		lines[0] = `${padTo(lines[0] ?? "", WORDMARK.width)}${gap}${lead}${name}`;
	}
	if (version !== "" && lines.length > 1) {
		const lead = " ".repeat(width - visibleWidth(version));
		lines[1] = `${padTo(lines[1], WORDMARK.width)}${gap}${lead}${version}`;
	}
	return lines;
}

class Welcome implements Component {
	#animStart: number | null = null;
	#timer: NodeJS.Timeout | undefined;
	#requestRender: (() => void) | undefined;
	#cachedWidth = -1;
	#cachedLines: string[] | undefined;

	invalidate(): void {
		this.#cachedWidth = -1;
		this.#cachedLines = undefined;
	}

	/**
	 * Play a one-shot intro that sweeps the gradient through every phase before
	 * settling on the resting frame. Static ("text") wordmarks skip the intro.
	 * Safe to call again; it restarts the intro.
	 */
	playIntro(requestRender: () => void): void {
		this.stopIntro();
		if (WORDMARK.color === "text") return;
		this.#requestRender = requestRender;
		this.#animStart = performance.now();
		this.#requestRender();
		this.#timer = setInterval(() => {
			const elapsed = performance.now() - (this.#animStart ?? 0);
			// Capture before stopping: the settled frame still has to paint.
			const requestRender = this.#requestRender;
			if (elapsed >= INTRO_MS) this.stopIntro();
			requestRender?.();
		}, INTRO_TICK_MS);
	}

	/** Stop the intro immediately and settle on the resting frame. Safe when idle. */
	stopIntro(): void {
		if (this.#timer !== undefined) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
		const wasAnimating = this.#animStart !== null;
		this.#animStart = null;
		this.#requestRender = undefined;
		if (wasAnimating) this.invalidate();
	}

	render(termWidth: number): readonly string[] {
		const animating = this.#animStart !== null;
		if (!animating && this.#cachedLines !== undefined && this.#cachedWidth === termWidth) {
			return this.#cachedLines;
		}
		const lines = this.#renderLines(termWidth);
		if (animating) {
			this.#cachedWidth = -1;
			this.#cachedLines = undefined;
		} else {
			this.#cachedWidth = termWidth;
			this.#cachedLines = lines;
		}
		return lines;
	}

	#renderLines(termWidth: number): string[] {
		// Content keeps a column clear on each side; everything centers in the full width.
		const room = termWidth - 2;
		if (room < 4) return [];
		// The partner block stays plain white text, independent of the theme.
		const name = EDITION === "" ? "" : `${PARTNER_WHITE}${EDITION}\x1b[0m`;
		const partnerVersion = EDITION_VERSION === "" ? "" : `${PARTNER_WHITE}${EDITION_VERSION}\x1b[0m`;
		const partnerWidth = Math.max(visibleWidth(name), visibleWidth(partnerVersion));
		const lockupWidth = WORDMARK.width + (partnerWidth === 0 ? 0 : EDITION_GAP + partnerWidth);
		// Below the lockup's width, drop the partner block, then fall back to the plain brand text.
		const pixelArt = room >= WORDMARK.width;
		const art =
			room >= lockupWidth
				? withPartner(this.#currentLogoFrame(), name, partnerVersion)
				: pixelArt
					? this.#currentLogoFrame()
					: room >= visibleWidth(APP_NAME)
						? [theme.bold(theme.fg("text", APP_NAME))]
						: [];
		const artWidth = room >= lockupWidth ? lockupWidth : pixelArt ? WORDMARK.width : visibleWidth(APP_NAME);
		const lines = art.length > 0 ? ["", "", ...centerBlock(art, termWidth)] : [];
		if (lines.length > 0) {
			const meta = theme.fg("dim", `${WORDMARK.version} · ${HOMEPAGE}`);
			// The pixel wordmark and its meta line share one center line; the edition
			// label widens only the bottom row, so it must not shift the meta line.
			const indent = pixelArt
				? centerIndent(artWidth, termWidth) + centerIndent(visibleWidth(meta), WORDMARK.width)
				: centerIndent(visibleWidth(meta), termWidth);
			lines.push(indent + meta);
		}
		if (termWidth >= TIP_MIN_COLUMNS) {
			const tip = theme.italic(theme.fg("muted", WORDMARK.tip));
			lines.push("", ...centerBlock([tip], termWidth));
		}
		return lines;
	}

	#currentLogoFrame(): readonly string[] {
		if (this.#animStart === null) return REST_FRAME;
		const elapsed = performance.now() - this.#animStart;
		if (elapsed >= INTRO_MS) return REST_FRAME;
		return introLogoFrame(elapsed / INTRO_MS);
	}
}

const tui = new TUI(new ProcessTerminal());
const welcome = new Welcome();

tui.addChild(welcome);
welcome.playIntro(() => tui.requestRender());

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		welcome.stopIntro();
		tui.stop();
		process.exit(0);
	}
	return undefined;
});

tui.start();
