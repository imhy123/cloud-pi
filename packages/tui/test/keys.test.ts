import { afterEach, describe, expect, it } from "vitest";
import {
	decodePrintableKey,
	extractPrintableText,
	isKeyRelease,
	isKeyRepeat,
	isKittyProtocolActive,
	Key,
	matchesKey,
	parseKey,
	parseKittySequence,
	setKittyProtocolActive,
} from "../src/keys";

afterEach(() => setKittyProtocolActive(false));

describe("matchesKey", () => {
	it("matches legacy single-byte and CSI sequences", () => {
		expect(matchesKey("\x1b", Key.escape)).toBe(true);
		expect(matchesKey("\r", Key.enter)).toBe(true);
		expect(matchesKey("\t", Key.tab)).toBe(true);
		expect(matchesKey("\x7f", Key.backspace)).toBe(true);
		expect(matchesKey("\x1b[A", Key.up)).toBe(true);
		expect(matchesKey("\x1b[B", Key.down)).toBe(true);
		expect(matchesKey("\x1b[C", Key.right)).toBe(true);
		expect(matchesKey("\x1b[D", Key.left)).toBe(true);
		expect(matchesKey("\x1b[3~", Key.delete)).toBe(true);
		expect(matchesKey("\x1b[Z", Key.shift("tab"))).toBe(true);
	});

	it("matches control and alt letters", () => {
		expect(matchesKey("\x03", Key.ctrl("c"))).toBe(true);
		expect(matchesKey("\x1bx", Key.alt("x"))).toBe(true);
		expect(matchesKey("\x1bx", Key.ctrl("x"))).toBe(false);
		expect(matchesKey("\x1b[1;5A", Key.ctrl("up"))).toBe(true);
	});

	it("matches Kitty CSI-u sequences regardless of protocol state", () => {
		expect(matchesKey("\x1b[99;5u", Key.ctrl("c"))).toBe(true);
		expect(matchesKey("\x1b[13;2u", Key.shift("enter"))).toBe(true);
	});

	it("rejects unrecognized input", () => {
		expect(matchesKey("hello", Key.enter)).toBe(false);
		expect(matchesKey("\x1b[A", Key.down)).toBe(false);
	});
});

describe("parseKey", () => {
	it("normalizes legacy sequences into key identifiers", () => {
		expect(parseKey("\x1b[A")).toBe("up");
		expect(parseKey("\x03")).toBe("ctrl+c");
		expect(parseKey("\x1b[Z")).toBe("shift+tab");
		expect(parseKey("\x1b")).toBe("escape");
	});

	it("returns undefined for plain text", () => {
		expect(parseKey("hello")).toBeUndefined();
	});
});

describe("Kitty event types", () => {
	it("ignores release and repeat events while the protocol is inactive", () => {
		expect(isKeyRelease("\x1b[97;1:3u")).toBe(false);
		expect(isKeyRepeat("\x1b[97;1:2u")).toBe(false);
	});

	it("detects release and repeat events while the protocol is active", () => {
		setKittyProtocolActive(true);
		expect(isKittyProtocolActive()).toBe(true);
		expect(isKeyRelease("\x1b[97;1:3u")).toBe(true);
		expect(isKeyRelease("\x1b[1;1:3A")).toBe(true);
		expect(isKeyRepeat("\x1b[97;1:2u")).toBe(true);
		expect(isKeyRelease("\x1b[97;1:1u")).toBe(false);
	});

	it("never flags bracketed paste content", () => {
		setKittyProtocolActive(true);
		expect(isKeyRelease("\x1b[200~90:62:3F:A5\x1b[201~")).toBe(false);
		expect(isKeyRepeat("\x1b[200~90:62:2F:A5\x1b[201~")).toBe(false);
	});

	it("parses codepoint, modifier and event type", () => {
		expect(parseKittySequence("\x1b[97;5:1u")).toEqual({
			codepoint: 97,
			shiftedKey: undefined,
			baseLayoutKey: undefined,
			modifier: 4,
			eventType: "press",
		});
		const release = parseKittySequence("\x1b[97;5:3u");
		expect(release?.modifier).toBe(4);
		expect(release?.eventType).toBe("release");
		const arrow = parseKittySequence("\x1b[1;5:2A");
		expect(arrow?.codepoint).toBe(-1);
		expect(arrow?.eventType).toBe("repeat");
		expect(parseKittySequence("\x1b[A")).toBeNull();
	});
});

describe("printable decoding", () => {
	it("decodes Kitty CSI-u and modifyOtherKeys text", () => {
		expect(decodePrintableKey("\x1b[97u")).toBe("a");
		expect(decodePrintableKey("\x1b[27;2;65~")).toBe("A");
		expect(decodePrintableKey("\x1b[27;5;97~")).toBeUndefined();
		expect(decodePrintableKey("\x1b[1;5A")).toBeUndefined();
	});

	it("extracts input text but rejects control sequences", () => {
		expect(extractPrintableText("hello")).toBe("hello");
		expect(extractPrintableText("\x1b[97u")).toBe("a");
		expect(extractPrintableText("\x01")).toBeUndefined();
		expect(extractPrintableText("")).toBeUndefined();
	});
});
