// Adapted from oh-my-pi packages/tui/test/svg-figure.test.ts (v18.18.7):
// focused Node/WASM integration tests, without SIXEL or CLI render harnesses.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { SvgFigure, setSvgFigureRendering } from "../src/chat/svg-figure";
import { FigureMarkdown } from "../src/chat/figure-markdown";
import { Markdown } from "../src/components/markdown";
import { getCellDimensions, setCellDimensions, setTerminalImageProtocol, TERMINAL, ImageProtocol } from "../src/terminal-capabilities";
import { closeMediaWorkers, setSvgFontOptions } from "../src/compat/natives";
import { getMarkdownTheme } from "../src/theme/tui-adapters";

const CELL = { widthPx: 16, heightPx: 36 };
const SVG = '<svg viewBox="0 0 838 200"><rect width="838" height="200" fill="var(--accent)"/></svg>';
const originalProtocol = TERMINAL.imageProtocol;
const originalCell = { ...getCellDimensions() };
const components: { dispose(): void }[] = [];
beforeEach(() => { setTerminalImageProtocol(ImageProtocol.Kitty); setCellDimensions(CELL); setSvgFontOptions({ loadSystemFonts: false }); });
afterEach(() => { components.splice(0).forEach(component => component.dispose()); setTerminalImageProtocol(originalProtocol); setCellDimensions(originalCell); setSvgFigureRendering(true); });
afterAll(closeMediaWorkers);
function figure() {
	let notify = () => {};
	const options = { markdown: (text: string) => new Markdown(text, 0, 0, getMarkdownTheme()), onChange: () => notify() };
	const svg = new SvgFigure(options); components.push(svg);
	return { svg, options, landed: () => { const gate = Promise.withResolvers<void>(); notify = gate.resolve; return gate.promise; } };
}

describe("SvgFigure", () => {
	it("rasterizes at natural size onto exactly the cells used by its placement", async () => {
		const { svg, landed } = figure(); const done = landed();
		svg.update(SVG, true); svg.render(200); await done;
		const match = /c=(\d+),r=(\d+)/.exec(svg.render(200).join("\n"));
		expect(match).not.toBeNull(); expect(Number(match![1])).toBe(118);
		expect(svg.debugState().raster).toBe(`${Number(match![1]) * CELL.widthPx}x${Number(match![2]) * CELL.heightPx}`);
	});
	it("redraws for narrower widths", async () => {
		const { svg, landed } = figure(); let done = landed();
		svg.update(SVG, true); svg.render(200); await done;
		done = landed(); svg.render(80); await done;
		expect(svg.debugState().raster).toMatch(/^1248x/); // 78 columns * 16 pixels
	});
	it("coalesces sources arriving during a raster and only publishes the newest", async () => {
		const { svg, landed } = figure(); const done = landed();
		svg.update(SVG, true); svg.render(200);
		svg.update('<svg width="12" height="7"><rect width="12" height="7"/></svg>', true);
		await done;
		expect(svg.debugState().current).toBe(true);
		expect(svg.debugState().raster).toBe("32x36");
	});
	it("clips and caches the fenced-code fallback after invalid final input", async () => {
		const { svg, options, landed } = figure(); Object.assign(options, { maxRows: () => 2 });
		const done = landed(); svg.update("not an SVG\nsecond line\nthird line", true); svg.render(80); await done;
		const rows = svg.render(80); expect(rows.length).toBe(2); expect(svg.render(80)).toBe(rows);
		expect(svg.pending).toBe(false);
	});
	it("falls back without scheduling a raster on terminals without graphics", () => {
		setTerminalImageProtocol(null); const { svg } = figure(); svg.update(SVG, true);
		expect(svg.render(80).join("\n")).toContain("svg"); expect(svg.pending).toBe(false);
	});
	it("renders interleaved prose and SVG without table-chart dependencies", async () => {
		const gate = Promise.withResolvers<void>();
		const figure = new FigureMarkdown(`Before\n\n\`\`\`svg\n${SVG}\n\`\`\`\n\nAfter`, {
			markdown: text => new Markdown(text, 0, 0, getMarkdownTheme()), onChange: gate.resolve,
		}); components.push(figure);
		figure.render(80); await gate.promise;
		const rows = figure.render(80);
		expect(rows.join("\n")).toContain("Before"); expect(rows.join("\n")).toContain("After");
		expect(rows.some(row => TERMINAL.isImageLine(row))).toBe(true);
		expect(figure.leadingProse).toBe("Before");
	});
});
