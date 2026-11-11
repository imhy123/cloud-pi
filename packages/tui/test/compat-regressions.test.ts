import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { migrateKeybindingsConfigFile } from "../src/app-keybindings";
import { fuzzyFind, renderMermaidAscii, TtyWriter, writeAllBytes } from "../src/compat/natives";
import { stripAnsi } from "../src/compat/text";
import { Input } from "../src/components/input";
import { resetHangulCompatibilityJamoWidthForTests, setHangulCompatibilityJamoWidth, sliceWithWidth, truncateToWidth, visibleWidth, wrapTextWithAnsi, Ellipsis } from "../src/utils";

const temporary: string[] = [];
function directory() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-pi-compat-")); temporary.push(dir); return dir; }
afterEach(() => { resetHangulCompatibilityJamoWidthForTests(); for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe("migration regressions", () => {
	it("keeps JSONC punctuation in strings while removing comments and trailing commas", () => {
		const dir = directory();
		fs.writeFileSync(path.join(dir, "keybindings.json"), '{/* comment */"app.test":",}","app.other":",]",}');
		migrateKeybindingsConfigFile(dir);
		expect(parseYaml(fs.readFileSync(path.join(dir, "keybindings.yml"), "utf8"))).toEqual({ "app.test": ",}", "app.other": ",]" });
	});
	it("rejects malformed JSONC rather than writing a partial config", () => {
		const dir = directory();
		fs.writeFileSync(path.join(dir, "keybindings.json"), '{"app.test":"a" /* unterminated');
		migrateKeybindingsConfigFile(dir);
		expect(fs.existsSync(path.join(dir, "keybindings.yml"))).toBe(false);
	});
	it("uses the same Hangul width for measuring, slicing, truncating and wrapping", () => {
		for (const width of [1, 2] as const) {
			setHangulCompatibilityJamoWidth(width);
			expect(visibleWidth("ㄱㄴ")).toBe(width * 2);
			expect(sliceWithWidth("ㄱㄴ", 0, width, true)).toEqual({ text: "ㄱ", width });
			expect(stripAnsi(truncateToWidth("ㄱㄴ", width, Ellipsis.Omit))).toBe("ㄱ");
			expect(wrapTextWithAnsi("ㄱㄴ", width)).toEqual(["ㄱ", "ㄴ"]);
		}
	});
	it("recognizes CSI and two-byte escapes without swallowing printable text", () => {
		expect(stripAnsi("\x1b[2Cabc\x1b7")).toBe("abc");
		expect(visibleWidth("\x1b[2Cabc")).toBe(3);
	});
	it("carries colon SGR colors and styled underlines across wraps", () => {
		const lines = wrapTextWithAnsi("\x1b[4:4;38:2::1:2:3;58:2::9:9:9mhello world\x1b[4:0m", 5);
		expect(lines[1]).toContain("4:4");
		expect(lines[1]).toContain("38:2::1:2:3");
		expect(lines[1]).toContain("58:2::9:9:9");
		expect(lines.map(stripAnsi)).toEqual(["hello", "world"]);
		expect(wrapTextWithAnsi("\x1b[4:4mlink\x1b[4:0m\nnext", 20)[1]).not.toContain("4:4");
	});
	it("retains the byte offset after short writes, EINTR and EAGAIN", () => {
		const bytes = Buffer.from("abcdef");
		let calls = 0, progress = 0, pauses = 0;
		const offsets: number[] = [];
		writeAllBytes(bytes, (offset, length) => {
			offsets.push(offset);
			calls++;
			if (calls === 2) throw Object.assign(new Error(), { code: "EINTR" });
			if (calls === 3) throw Object.assign(new Error(), { code: "EAGAIN" });
			return Math.min(2, length);
		}, count => { progress += count; }, () => { pauses++; });
		expect(offsets).toEqual([0, 2, 2, 2, 4]);
		expect(progress).toBe(6);
		expect(pauses).toBe(1);
		expect(() => writeAllBytes(bytes, () => 0, () => {}, () => {})).toThrow("zero-byte");
	});
	it("writes large queued frames completely and in FIFO order, with synchronous flush", () => {
		const file = path.join(directory(), "terminal");
		const fd = fs.openSync(file, "w");
		const writer = new TtyWriter(fd);
		try {
			const first = "你".repeat(100_000);
			writer.write(first);
			writer.write("tail");
			expect(writer.flushSync(10_000)).toBe(true);
			expect(writer.pending()).toBe(0);
			expect(writer.dead).toBe(false);
			expect(fs.readFileSync(file, "utf8")).toBe(first + "tail");
		} finally { writer.stop(1000); fs.closeSync(fd); }
	});
	it("respects nested gitignore negations and caches discovery separately from ranking", async () => {
		const dir = directory();
		fs.mkdirSync(path.join(dir, "nested"));
		fs.writeFileSync(path.join(dir, ".gitignore"), "*.secret\n");
		fs.writeFileSync(path.join(dir, "nested/.gitignore"), "!keep.secret\n");
		for (const name of ["drop.secret", "nested/keep.secret", "visible.txt"]) fs.writeFileSync(path.join(dir, name), "");
		const find = (query: string, cache = true, gitignore = true) => fuzzyFind({ path: dir, query, gitignore, cache });
		expect((await find("secret")).matches.map(x => x.path)).toEqual(["nested/keep.secret"]);
		expect((await find("visible")).matches.map(x => x.path)).toEqual(["visible.txt"]);
		fs.writeFileSync(path.join(dir, "new.txt"), "");
		expect((await find("new")).matches).toEqual([]);
		expect((await find("new", false)).matches.map(x => x.path)).toEqual(["new.txt"]);
		expect((await find("drop", false, false)).matches.map(x => x.path)).toEqual(["drop.secret"]);
		expect((await fuzzyFind({ path: dir, query: "", signal: AbortSignal.abort() })).matches).toEqual([]);
	});
	it.each([
		"graph LR\n A --> B", "stateDiagram-v2\n A --> B", "sequenceDiagram\n A->>B: hello",
		"classDiagram\n A --> B", "erDiagram\n A ||--o{ B : has", "xychart-beta\n x-axis [a,b]\n bar [1,2]",
	])("renders Mermaid without a browser: %s", source => {
		expect(renderMermaidAscii(source, { colorMode: "none" }).trim().length).toBeGreaterThan(0);
	});
	it("overrides Mermaid direction through the compatibility adapter", () => {
		expect(renderMermaidAscii("graph TD\n A --> B", { direction: "LR" })).toBe(renderMermaidAscii("graph LR\n A --> B"));
	});
	it("places Input caret at the requested end", () => {
		const input = new Input();
		input.setValue("abc", { cursor: "start" }); input.handleInput("x"); expect(input.getValue()).toBe("xabc");
		input.setValue("abc"); input.handleInput("x"); expect(input.getValue()).toBe("abcx");
	});
});

describe("Windows marker timeout grace", () => {
	it("accepts the queued tail before an overdue marker timeout releases its prefix", async () => {
		const { vi } = await import("vitest");
		const { Win32PasteMarkerNormalizer } = await import("../src/windows-input-mode");
		const output: string[] = [];
		const records = (text: string) => [...text].map(ch => `\x1b[231;0;${ch.charCodeAt(0)};1;0;1_`).join("");
		vi.useFakeTimers();
		const normalizer = new Win32PasteMarkerNormalizer(data => output.push(data));
		try {
			normalizer.process(records("\x1b[20"));
			vi.advanceTimersByTime(75);
			expect(output).toEqual([]);
			normalizer.process(records("0~"));
			vi.runAllTimers();
			expect(output).toEqual(["\x1b[200~"]);
		} finally { normalizer.flush(); vi.useRealTimers(); }
	});
});
