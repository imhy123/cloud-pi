import { afterEach, describe, expect, it } from "vitest";
import dark from "../src/theme/dark.json";
import { createTheme } from "../src/theme/loader";
import { validateThemeJson } from "../src/theme/schema-validation";
import type { ThemeJson } from "../src/theme/schema";
import {
	getMarkdownTheme,
	getThemeByName,
	highlightCode as highlightThemeCode,
	setHighlighter,
	setMarkdownColorful,
} from "../src/theme";
import { highlightCode, supportsLanguage, type HighlightColors } from "../src/compat/natives";
import { visibleWidth } from "../src/utils";

const BUILTIN = dark as ThemeJson;

function brokenTheme(mutate: (colors: Record<string, unknown>) => void): unknown {
	const clone = structuredClone(BUILTIN) as unknown as { colors: Record<string, unknown> };
	mutate(clone.colors);
	return clone;
}

describe("validateThemeJson", () => {
	it("accepts the bundled dark theme and returns it unchanged", () => {
		expect(validateThemeJson(BUILTIN)).toBe(BUILTIN);
	});

	it("rejects a missing required color token", () => {
		const theme = brokenTheme(colors => delete colors.accent);
		expect(() => validateThemeJson(theme)).toThrow(/colors\.accent/);
	});

	it("rejects a non-color token value", () => {
		const theme = brokenTheme(colors => {
			colors.success = null;
		});
		expect(() => validateThemeJson(theme)).toThrow(/colors\.success/);
	});

	it("rejects malformed terminal and symbol sections", () => {
		expect(() =>
			validateThemeJson({ ...BUILTIN, terminal: { ansi: ["#000"] } }),
		).toThrow(/terminal\.ansi/);
		expect(() =>
			validateThemeJson({ ...BUILTIN, symbols: { preset: "klingon" } }),
		).toThrow(/symbols\.preset/);
	});
});

describe("Theme rendering", () => {
	it("wraps foreground text in truecolor SGR and restores the default foreground", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		const styled = theme.fg("accent", "x");
		expect(styled.startsWith("\x1b[38;2;")).toBe(true);
		expect(styled.endsWith("\x1b[39m")).toBe(true);
		expect(visibleWidth(styled)).toBe(1);
	});

	it("wraps background text in a background SGR and resets only the background", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		const styled = theme.bg("selectedBg", "x");
		expect(styled.endsWith("\x1b[49m")).toBe(true);
		expect(styled).toContain("x");
	});

	it("throws for unknown color tokens", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		expect(() => theme.fg("nope" as never, "x")).toThrow(/Unknown theme color/);
	});

	it("returns undefined for a theme name that does not exist", async () => {
		await expect(getThemeByName("no-such-theme")).resolves.toBeUndefined();
	});

	it("colors text from the theme's terminal.ansi palette slot", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		expect(theme.ansiFg("red", "x")).toBe("\x1b[38;2;205;49;49mx\x1b[39m");
		expect(theme.ansiFg("red", "x")).not.toBe(theme.ansiFg("green", "x"));
	});

	it("falls back to the terminal palette index for slots the theme omits", () => {
		const theme = createTheme({ ...BUILTIN, terminal: {} } as ThemeJson, { mode: "truecolor" });
		expect(theme.ansiFg("red", "x")).toBe("\x1b[38;5;1mx\x1b[39m");
	});
});

describe("colorful Markdown", () => {
	afterEach(() => setMarkdownColorful(true));

	it("gives each heading depth its own hue and emphasis roles while enabled", () => {
		setMarkdownColorful(true);
		const markdown = getMarkdownTheme();
		expect(markdown.heading("T", 1)).not.toBe(markdown.heading("T", 2));
		expect(markdown.strong).toBeTypeOf("function");
		expect(markdown.emphasis).toBeTypeOf("function");
	});

	it("restores the single mdHeading color and drops emphasis roles when disabled", () => {
		setMarkdownColorful(false);
		const markdown = getMarkdownTheme();
		expect(markdown.heading("T", 1)).toBe(markdown.heading("T", 3));
		expect(markdown.strong).toBeUndefined();
		expect(markdown.emphasis).toBeUndefined();
	});
});

describe("pluggable syntax highlighting", () => {
	const colors = {
		comment: "",
		keyword: "",
		function: "",
		variable: "",
		string: "",
		number: "",
		type: "",
		operator: "",
		punctuation: "",
	};

	afterEach(() => setHighlighter(undefined));

	it("is a no-op until a highlighter is registered", () => {
		expect(highlightCode("const x = 1", "ts", colors)).toBe("const x = 1");
		expect(supportsLanguage("ts")).toBe(false);
	});

	it("routes supported languages through the registered highlighter", () => {
		setHighlighter({
			supportsLanguage: lang => lang === "ts",
			highlightCode: (code, lang) => `[${lang}]${code}`,
		});
		expect(supportsLanguage("ts")).toBe(true);
		expect(supportsLanguage("go")).toBe(false);
		expect(highlightCode("const x = 1", "ts", colors)).toBe("[ts]const x = 1");
		expect(highlightCode("package main", "go", colors)).toBe("package main");
		expect(highlightCode("plain", null, colors)).toBe("plain");
	});

	it("feeds theme syntax colors to the highlighter and returns lines", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		let received: HighlightColors | undefined;
		setHighlighter({
			supportsLanguage: lang => lang === "ts",
			highlightCode: (code, _lang, themeColors) => {
				received = themeColors;
				return `${code}\nsecond`;
			},
		});
		expect(highlightThemeCode("const x = 1", "ts", theme)).toEqual(["const x = 1", "second"]);
		expect(received?.keyword).toBe(theme.getFgAnsi("syntaxKeyword"));
		expect(received?.comment).toBe(theme.getFgAnsi("syntaxComment"));
	});

	it("returns unsupported languages verbatim from the theme adapter", () => {
		const theme = createTheme(BUILTIN, { mode: "truecolor" });
		setHighlighter({
			supportsLanguage: () => false,
			highlightCode: code => `should-not-run:${code}`,
		});
		expect(highlightThemeCode("a\nb", "go", theme)).toEqual(["a", "b"]);
	});
});
