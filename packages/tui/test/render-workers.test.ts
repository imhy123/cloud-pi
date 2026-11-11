import { afterAll, afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { PNG } from "pngjs";
import { gzipSync } from "node:zlib";
import { closeMediaWorkers, rasterizeSvg, renderMermaidAscii, setSvgFontOptions } from "../src/compat/natives";
import { RenderWorker } from "../src/compat/render-worker";
import { resolveMermaidAscii } from "../src/theme/mermaid-cache";
import { Markdown } from "../src/components/markdown";
import { defaultMarkdownTheme } from "./test-themes";
import { visibleWidth } from "../src/utils";

const svg = (body: string, width = 12, height = 7) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
const red = svg('<rect width="12" height="7" fill="red"/>');
const decode = (bytes: Uint8Array) => PNG.sync.read(Buffer.from(bytes));
afterAll(closeMediaWorkers);
afterEach(() => { setSvgFontOptions({ loadSystemFonts: false }); });

describe("SVG worker pixels and limits", () => {
	it("renders exact pixels and pads only the right/bottom to whole terminal cells", async () => {
		setSvgFontOptions({ loadSystemFonts: false });
		const image = decode(await rasterizeSvg(red, 100, 100, 1, { widthPx: 9, heightPx: 18 }));
		expect([image.width, image.height]).toEqual([18, 18]);
		expect([...image.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
		expect([...image.data.subarray(12 * 4, 13 * 4)]).toEqual([0, 0, 0, 0]);
		expect(image.data[(7 * image.width) * 4 + 3]).toBe(0);
	});
	it("scales SVGZ and fits aspect ratio inside the requested limits", async () => {
		const zoom = decode(await rasterizeSvg(gzipSync(red), 100, 100, 2));
		expect([zoom.width, zoom.height]).toEqual([24, 14]);
		const fit = decode(await rasterizeSvg(red, 6, 100, 10));
		expect(fit.width).toBe(6);
		expect(fit.height).toBeLessThanOrEqual(4);
	});
	it("does not fetch local files or remote external image references", async () => {
		const image = decode(await rasterizeSvg(svg('<image href="file:///etc/passwd" width="12" height="7"/><image href="https://invalid.example/image.png" width="12" height="7"/>'), 100, 100));
		expect([...image.data].filter((_, index) => index % 4 === 3).every(alpha => alpha === 0)).toBe(true);
	});
	it("rejects invalid data, scale, cell sizes, source sizes and allocation limits", async () => {
		for (const request of [
			rasterizeSvg(Buffer.from("bad"), 100, 100), rasterizeSvg(red, 0, 10),
			rasterizeSvg(red, 100, 100, Infinity), rasterizeSvg(red, 4097, 4097),
			rasterizeSvg(red, 10, 10, 1, { widthPx: 0, heightPx: 1 }),
			rasterizeSvg(new Uint8Array(4 * 1024 * 1024 + 1), 10, 10),
		]) await expect(request).rejects.toThrow();
	});
	const fontFile = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "C:\\Windows\\Fonts\\arial.ttf"].find(existsSync);
	it.skipIf(!fontFile)("renders text using explicitly supplied font bytes", async () => {
		const font = new Uint8Array(readFileSync(fontFile!));
		setSvgFontOptions({ loadSystemFonts: false, fontBuffers: [font], defaultFontFamily: "sans-serif" });
		const image = decode(await rasterizeSvg(svg('<text x="0" y="25" font-size="22">SVG text</text>', 160, 40), 200, 100));
		expect([...image.data].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
	});
});

describe("Mermaid worker contract", () => {
 it("exposes kind-specific result types", () => {
  expectTypeOf<ReturnType<RenderWorker<"mermaid">["run"]>>().toEqualTypeOf<Promise<string>>();
  expectTypeOf<ReturnType<RenderWorker<"svg">["run"]>>().toEqualTypeOf<Promise<Uint8Array>>();
 });
	it("overrides the top-level state direction without changing composite states", async () => {
		const authored = 'stateDiagram-v2\ndirection LR\nFirst --> Second\nSecond --> Third\nstate Nested {\ndirection LR\n A --> B\n}';
		const expected = authored.replace("direction LR", "direction TD");
		const output = await renderMermaidAscii(authored, { direction: "TD" });
		expect(output).toBe(await renderMermaidAscii(expected));
		expect(output).not.toBe(await renderMermaidAscii(authored));
		expect(await renderMermaidAscii("stateDiagram-v2\nFirst --> Second", { direction: "LR" })).toBe(await renderMermaidAscii("stateDiagram-v2\ndirection LR\nFirst --> Second"));
	});
	it("chooses a genuinely narrower state orientation and reuses renders across widths", async () => {
		const source = "stateDiagram-v2\ndirection LR\nFirst --> Second\nSecond --> Third";
		const wide = await resolveMermaidAscii(source, { maxWidth: 120 });
		const narrow = await resolveMermaidAscii(source, { maxWidth: 24 });
		expect(wide).toBe(await renderMermaidAscii(source));
		expect(narrow).toBe(await renderMermaidAscii(source, { direction: "TD" }));
		expect(narrow).not.toBe(wide);
		expect(Math.max(...narrow!.split("\n").map(visibleWidth))).toBeLessThanOrEqual(24);
	});
	it("honors plain, truecolor, ANSI-256 and HTML output modes", async () => {
		const source = "graph LR\n A --> B";
		const theme = { fg: "#ff0000", border: "#00ff00", line: "#0000ff", arrow: "#ffffff" };
		expect(await renderMermaidAscii(source, { colorMode: "none", theme })).not.toContain("\x1b");
		expect(await renderMermaidAscii(source, { colorMode: "truecolor", theme })).toContain("38;2;");
		expect(await renderMermaidAscii(source, { colorMode: "ansi256", theme })).toContain("38;5;");
		expect(await renderMermaidAscii(source, { colorMode: "html", theme })).toContain("<span");
	});
	it("bounds pathological layout inputs and keeps the worker usable after a rejected request", async () => {
		await expect(renderMermaidAscii("graph LR\n" + "A --> B\n".repeat(1001))).rejects.toThrow("layout limits");
		await expect(renderMermaidAscii("graph LR\n A --> B", { paddingX: 1e8 })).rejects.toThrow("layout limits");
		expect(await renderMermaidAscii("graph LR\n A --> B")).toContain("A");
	});
	it("times out an expensive layout without blocking the main-thread heartbeat", async () => {
		const client = new RenderWorker("mermaid", 100);
		let ticks = 0;
		const timer = setInterval(() => { ticks++; }, 5);
		try {
			await expect(client.run({ kind: "mermaid", source: "graph TD\n" + Array.from({ length: 100 }, (_, i) => `Node${i} --> Node${i+1}`).join("\n") })).rejects.toThrow("timed out");
			expect(ticks).toBeGreaterThan(0);
		} finally { clearInterval(timer); client.close(); }
	});
	it("bounds queued work, rejects on shutdown, and restarts lazily", async () => {
		const client = new RenderWorker("mermaid", 10_000, 1);
		const task = { kind: "mermaid" as const, source: "graph LR\n A --> B" };
		try {
			const pending = client.run(task);
			await expect(client.run(task)).rejects.toThrow("queue is full");
			const rejection = expect(pending).rejects.toThrow("closed");
			client.close(); await rejection;
			expect(await client.run(task)).toContain("A");
		} finally { client.close(); }
	});
	it("terminates an overdue task rather than leaving a hanging promise", async () => {
		const client = new RenderWorker("mermaid", 1);
		try { await expect(client.run({ kind: "mermaid", source: "graph LR\n A --> B" })).rejects.toThrow("timed out"); }
		finally { client.close(); }
	});
});

describe("Markdown asynchronous diagrams", () => {
	const text = (source: string) => `Before\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nAfter`;
	it("repaints cached fallback rows when an asynchronous result arrives", async () => {
		const gate = Promise.withResolvers<string | null>();
		const resolver = vi.fn(() => gate.promise);
		const md = new Markdown(text("graph LR\n A --> B"), 0, 0, { ...defaultMarkdownTheme, resolveMermaidAscii: resolver });
		const changed = Promise.withResolvers<void>(); md.onChange = changed.resolve;
		md.transientRenderCache = true;
		expect(md.render(60).join("\n")).toContain("A --> B");
		expect(md.getLastRenderStableText()).not.toContain("mermaid");
		gate.resolve("DRAWN DIAGRAM"); await changed.promise;
		expect(md.render(60).join("\n")).toContain("DRAWN DIAGRAM");
		expect(md.render(60).join("\n")).not.toContain("A --> B");
		expect(resolver).toHaveBeenCalledTimes(1);
		md.dispose();
	});
	it("keeps a failed diagram as code, caching the failure without retry loops", async () => {
		const resolver = vi.fn(async () => null);
		const md = new Markdown(text("invalid diagram"), 0, 0, { ...defaultMarkdownTheme, resolveMermaidAscii: resolver });
		const changed = Promise.withResolvers<void>(); md.onChange = changed.resolve;
		md.render(60); await changed.promise;
		expect(md.render(60).join("\n")).toContain("invalid diagram");
		expect(resolver).toHaveBeenCalledTimes(1); md.dispose();
	});
	it("coalesces edits and never displays a stale source result", async () => {
		const first = Promise.withResolvers<string | null>(), last = Promise.withResolvers<string | null>();
		const resolver = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
		const md = new Markdown(text("first"), 0, 0, { ...defaultMarkdownTheme, resolveMermaidAscii: resolver });
		let changed = Promise.withResolvers<void>(); md.onChange = () => changed.resolve();
		md.render(60); md.setText(text("last")); md.render(60);
		expect(resolver).toHaveBeenCalledTimes(1);
		first.resolve("STALE"); await changed.promise;
		changed = Promise.withResolvers<void>();
		expect(md.render(60).join("\n")).not.toContain("STALE");
		last.resolve("CURRENT"); await changed.promise;
		expect(md.render(60).join("\n")).toContain("CURRENT"); md.dispose();
	});
	it("does not notify a removed component when its pending request completes", async () => {
		const gate = Promise.withResolvers<string | null>(); const callback = vi.fn();
		const md = new Markdown(text("source"), 0, 0, { ...defaultMarkdownTheme, resolveMermaidAscii: () => gate.promise });
		md.onChange = callback; md.render(60); md.dispose(); gate.resolve("obsolete");
		await Promise.resolve(); await Promise.resolve();
		expect(callback).not.toHaveBeenCalled();
	});
});
