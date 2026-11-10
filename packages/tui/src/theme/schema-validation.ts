// cloud-pi-tui: adapted from oh-my-pi packages/tui/src/theme/schema-validation.ts
// (commit 83de60ad99). Replaced the ArkType/`@oh-my-pi/omptype` schema with
// structural validators. See PATCHES.md.
import type { SpinnerFramesOverride } from "./symbols";
import type { ThemeJson } from "./schema";

// Lightweight structural validation for custom themes. cloud-pi-tui does not depend
// on @oh-my-pi/omptype; the checks below cover the documented theme contract and
// reject malformed files before they reach rendering.

const REQUIRED_THEME_COLORS = [
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"selectedBg",
	"userMessageBg",
	"userMessageText",
	"customMessageBg",
	"customMessageText",
	"customMessageLabel",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"bashMode",
	"pythonMode",
	"statusLineBg",
	"statusLineSep",
	"statusLineModel",
	"statusLinePath",
	"statusLineGitClean",
	"statusLineGitDirty",
	"statusLineContext",
	"statusLineSpend",
	"statusLineStaged",
	"statusLineDirty",
	"statusLineUntracked",
	"statusLineOutput",
	"statusLineCost",
	"statusLineSubagents",
] as const;

const OPTIONAL_THEME_COLORS = ["assistantMessageText", "thinkingMax"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColorValue(value: unknown): value is string | number {
	return typeof value === "string" || typeof value === "number";
}

function fail(path: string, expected: string): never {
	throw new Error(`Invalid theme: ${path} must be ${expected}`);
}

function validateColorRecord(
	value: unknown,
	path: string,
	required: readonly string[],
	optional: readonly string[],
): void {
	if (!isRecord(value)) fail(path, "an object");
	for (const key of required) {
		if (!isColorValue(value[key])) fail(`${path}.${key}`, "a string or number");
	}
	for (const key of optional) {
		if (value[key] !== undefined && !isColorValue(value[key])) fail(`${path}.${key}`, "a string or number");
	}
}

function validateVars(value: unknown): void {
	if (!isRecord(value)) fail("vars", "an object");
	for (const [key, entry] of Object.entries(value)) {
		if (!isColorValue(entry)) fail(`vars.${key}`, "a string or number");
	}
}

function validateExport(value: unknown): void {
	if (!isRecord(value)) fail("export", "an object");
	for (const key of ["pageBg", "cardBg", "infoBg"]) {
		if (value[key] !== undefined && !isColorValue(value[key])) fail(`export.${key}`, "a string or number");
	}
}

function validateTerminal(value: unknown): void {
	if (!isRecord(value)) fail("terminal", "an object");
	for (const key of ["background", "foreground", "chrome", "widget"]) {
		if (value[key] !== undefined && !isColorValue(value[key])) fail(`terminal.${key}`, "a string or number");
	}
	const { ansi } = value;
	if (ansi !== undefined) {
		if (!Array.isArray(ansi) || ansi.length !== 16 || !ansi.every(isColorValue)) {
			fail("terminal.ansi", "an array of exactly 16 colors");
		}
	}
}

function isFrames(value: unknown): value is string[] {
	return Array.isArray(value) && value.length >= 1 && value.every((item) => typeof item === "string");
}

function isSpinnerFrames(value: unknown): value is SpinnerFramesOverride {
	if (Array.isArray(value)) return isFrames(value);
	if (!isRecord(value)) return false;
	if (value.status === undefined && value.activity === undefined) return false;
	return (
		(value.status === undefined || isFrames(value.status)) &&
		(value.activity === undefined || isFrames(value.activity))
	);
}

function validateSymbols(value: unknown): void {
	if (!isRecord(value)) fail("symbols", "an object");
	if (value.preset !== undefined && value.preset !== "unicode" && value.preset !== "nerd" && value.preset !== "ascii") {
		fail("symbols.preset", "'unicode', 'nerd', or 'ascii'");
	}
	if (value.overrides !== undefined) {
		if (!isRecord(value.overrides)) fail("symbols.overrides", "an object");
		for (const [key, entry] of Object.entries(value.overrides)) {
			if (typeof entry !== "string") fail(`symbols.overrides.${key}`, "a string");
		}
	}
	if (value.spinnerFrames !== undefined && !isSpinnerFrames(value.spinnerFrames)) {
		fail("symbols.spinnerFrames", "frame arrays or a { status, activity } object");
	}
}

/** Validate a custom theme against the documented JSON contract. */
export function validateThemeJson(value: unknown): ThemeJson {
	if (!isRecord(value)) fail("theme", "an object");
	if (typeof value.name !== "string") fail("name", "a string");
	if (value.$schema !== undefined && typeof value.$schema !== "string") fail("$schema", "a string");
	if (value.vars !== undefined) validateVars(value.vars);
	validateColorRecord(value.colors, "colors", REQUIRED_THEME_COLORS, OPTIONAL_THEME_COLORS);
	if (value.export !== undefined) validateExport(value.export);
	if (value.terminal !== undefined) validateTerminal(value.terminal);
	if (value.symbols !== undefined) validateSymbols(value.symbols);
	// The structural checks above establish the documented contract; TypeScript
	// cannot see that a generic record satisfies ThemeJson's required fields.
	return value as unknown as ThemeJson;
}
