import { describe, expect, it } from "vitest";
import {
	Ellipsis,
	encodeTextSized,
	moveWordLeft,
	moveWordRight,
	sliceByColumn,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "../src/utils";

describe("visibleWidth", () => {
	it("measures printable text and ignores ANSI/OSC/APC sequences", () => {
		expect(visibleWidth("hello")).toBe(5);
		expect(visibleWidth("\x1b[31mred\x1b[39m")).toBe(3);
		expect(visibleWidth("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\")).toBe(4);
		expect(visibleWidth("\x1b_pi:c\x07ok")).toBe(2);
	});

	it("expands tabs to the configured three-cell tab stop", () => {
		expect(visibleWidth("a\tb")).toBe(5);
		expect(visibleWidth("\t")).toBe(3);
	});

	it("measures east-asian wide graphemes as two cells", () => {
		expect(visibleWidth("你好")).toBe(4);
	});
});

describe("truncateToWidth", () => {
	it("keeps the total width within the budget and appends the unicode ellipsis", () => {
		const result = truncateToWidth("abcdefghij", 5);
		expect(visibleWidth(result)).toBe(5);
		expect(stripTerminalSequences(result).endsWith("…")).toBe(true);
	});

	it("honors the ellipsis style and padding options", () => {
		expect(stripTerminalSequences(truncateToWidth("abcdefghij", 5, Ellipsis.Omit))).toBe("abcde");
		expect(stripTerminalSequences(truncateToWidth("abc", 5, Ellipsis.Omit, true))).toBe("abc  ");
	});

	it("does not touch text that already fits", () => {
		expect(truncateToWidth("abc", 3)).toBe("abc");
	});
});

describe("wrapTextWithAnsi", () => {
	it("hard-wraps unbreakable runs at the requested width", () => {
		const lines = wrapTextWithAnsi("abcdefghij", 4);
		expect(lines).toEqual(["abcd", "efgh", "ij"]);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(4);
	});

	it("preserves SGR state across wrapped rows", () => {
		const lines = wrapTextWithAnsi("\x1b[31mabcdef\x1b[39m", 3);
		expect(lines.map(line => visibleWidth(line)).every(width => width <= 3)).toBe(true);
		expect(stripTerminalSequences(lines.join(""))).toBe("abcdef");
	});
});

describe("sliceByColumn", () => {
	it("extracts visible columns without splitting ANSI sequences", () => {
		const slice = sliceByColumn("\x1b[31mabcdef\x1b[39m", 2, 3);
		expect(stripTerminalSequences(slice)).toBe("cde");
		expect(slice.startsWith("\x1b[31m")).toBe(true);
	});

	it("excludes wide graphemes that would cross a strict boundary", () => {
		expect(sliceByColumn("a你b", 0, 2, true)).toBe("a");
	});
});

describe("encodeTextSized", () => {
	it("emits an OSC 66 span with encoded metadata and ST terminator", () => {
		expect(encodeTextSized("hi", { scale: 2, widthCells: 4 })).toBe("\x1b]66;s=2:w=4;hi\x1b\\");
	});

	it("replaces control characters that would break the OSC payload", () => {
		expect(encodeTextSized("a\nb")).toBe("\x1b]66;;a b\x1b\\");
	});
});

describe("word navigation", () => {
	it("moves across whole words and skips punctuation runs", () => {
		expect(moveWordLeft("foo bar", 7)).toBe(4);
		expect(moveWordRight("foo bar", 0)).toBe(3);
		expect(moveWordRight("foo!bar", 3)).toBe(4);
	});
});
