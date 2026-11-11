// cloud-pi-tui: new file. Worker entry for Mermaid layout and SVG WASM rasterization; imports companion contracts as types only.
// See PATCHES.md.
import { parentPort } from "node:worker_threads";
import { createRequire } from "node:module";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { RenderTask, RenderReply, MermaidRenderOptions, SvgFontOptions } from "./render-worker";

/** Rewrite only top-level state directions; nested composite directions stay intact. */
function withMermaidDirection(source: string, direction?: MermaidRenderOptions["direction"]): string {
	if (!direction) return source;
	if (/^\s*(?:graph|flowchart)\s+/i.test(source)) return source.replace(/^(\s*(?:graph|flowchart)\s+)(?:TD|TB|LR|RL|BT)\b/i, `$1${direction}`);
	const lines = source.split(/\r?\n/);
	const header = lines.findIndex(line => /^\s*stateDiagram(?:-v2)?\s*$/i.test(line));
	if (header < 0) return source;
	let depth = 0;
	for (let i = header + 1; i < lines.length; i++) {
		const line = lines[i]!;
		if (depth === 0 && /^\s*direction\s+(?:TD|TB|LR|RL|BT)\s*$/i.test(line)) lines[i] = "";
		// State composites use braces outside quoted labels and comments.
		const structural = line.replace(/"(?:\\.|[^"\\])*"/g, "").replace(/%%.*$/, "");
		depth += (structural.match(/\{/g)?.length ?? 0) - (structural.match(/\}/g)?.length ?? 0);
	}
	lines.splice(header + 1, 0, `direction ${direction}`);
	return lines.join("\n");
}

let wasm: Promise<typeof import("@resvg/resvg-wasm")> | undefined;
function resvg() {
	return wasm ??= (async () => {
		const mod = await import("@resvg/resvg-wasm");
		const require = createRequire(import.meta.url);
		await mod.initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
		return mod;
	})();
}
let fontRevision = -1;
let fonts: Uint8Array[] = [];
async function loadFonts(options: SvgFontOptions, revision: number): Promise<Uint8Array[]> {
	if (revision === fontRevision) return fonts;
	const files = new Set(options.fontFiles?.slice(0, 128) ?? []);
	const roots = [...(options.fontDirs?.slice(0, 32) ?? [])];
	if (options.loadSystemFonts !== false) roots.push(...(process.platform === "darwin"
		? ["/System/Library/Fonts", "/Library/Fonts", join(homedir(), "Library/Fonts")]
		: process.platform === "win32" ? [join(process.env.WINDIR ?? "C:\\Windows", "Fonts")]
		: ["/usr/share/fonts", "/usr/local/share/fonts", join(homedir(), ".fonts"), join(homedir(), ".local/share/fonts")]));
	const visit = async (directory: string, depth = 0): Promise<void> => {
		if (depth > 8 || files.size >= 128) return;
		try {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				if (files.size >= 128) break;
				const name = join(directory, entry.name);
				if (entry.isDirectory()) await visit(name, depth + 1);
				else if (/\.(?:ttf|otf|ttc)$/i.test(entry.name)) files.add(name);
			}
		} catch { /* An absent platform directory is expected. */ }
	};
	for (const root of roots) await visit(root);
	const loaded = [...(options.fontBuffers ?? [])];
	let bytes = loaded.reduce((total, font) => total + font.byteLength, 0);
	for (const file of files) {
		try {
			const info = await stat(file);
			if (bytes + info.size > 64 * 1024 * 1024) continue;
			const buffer = await readFile(file);
			if (bytes + buffer.byteLength > 64 * 1024 * 1024) continue;
			loaded.push(buffer); bytes += buffer.byteLength;
		} catch { /* Unreadable optional system fonts are skipped. */ }
	}
	fontRevision = revision;
	fonts = loaded;
	return fonts;
}
async function execute(task: RenderTask): Promise<string | Uint8Array> {
	if (task.kind === "mermaid") {
		if (!task.source.trim()) throw new Error("Empty mermaid diagram");
		if (task.source.length > 256 * 1024) throw new Error("Mermaid source exceeds 256 KiB");
		// Layout algorithms are not suitable for unbounded graphs. Bound graph size before parsing.
		if (task.source.split(/\r?\n/).length > 2000 || (task.source.match(/-->|->>|--|->/g)?.length ?? 0) > 1000) throw new Error("Mermaid graph exceeds layout limits");
		const { renderMermaidASCII } = await import("beautiful-mermaid");
		const { direction, ...options } = task.options ?? {};
		for (const value of [options.paddingX, options.paddingY, options.boxBorderPadding]) {
			if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 64)) throw new Error("Mermaid padding exceeds layout limits");
		}
		const result = renderMermaidASCII(withMermaidDirection(task.source, direction), { ...options, colorMode: options.colorMode ?? "none" });
		if (result.length > 4 * 1024 * 1024) throw new Error("Mermaid output exceeds 4 MiB");
		return result;
	}
	let { input, maxWidthPx, maxHeightPx, scale, cell } = task;
	if (input.byteLength > 4 * 1024 * 1024) throw new Error("SVG source exceeds 4 MiB");
	if (input[0] === 0x1f && input[1] === 0x8b) input = gunzipSync(input, { maxOutputLength: 4 * 1024 * 1024 });
	if (![maxWidthPx, maxHeightPx].every(value => Number.isInteger(value) && value > 0) || !Number.isFinite(scale) || scale <= 0) throw new Error("Invalid SVG render limits or scale");
	if (cell) {
		if (![cell.widthPx, cell.heightPx].every(value => Number.isInteger(value) && value > 0)) throw new Error("Invalid SVG cell size");
		maxWidthPx = Math.max(1, Math.floor(maxWidthPx / cell.widthPx)) * cell.widthPx;
		maxHeightPx = Math.max(1, Math.floor(maxHeightPx / cell.heightPx)) * cell.heightPx;
	}
	if (maxWidthPx * maxHeightPx > 16 * 1024 * 1024) throw new Error("SVG render limits exceed 16 megapixels");
	const { Resvg } = await resvg();
	const fontBuffers = await loadFonts(task.fonts, task.fontRevision);
	const options = { font: { fontBuffers, defaultFontFamily: task.fonts.defaultFontFamily ?? "sans-serif" } };
	const original = new Resvg(input, options);
	let renderer: InstanceType<typeof Resvg> | undefined;
	let rendered: ReturnType<InstanceType<typeof Resvg>["render"]> | undefined;
	try {
		const fit = Math.min(scale, maxWidthPx / original.width, maxHeightPx / original.height);
		renderer = new Resvg(input, { ...options, fitTo: { mode: "zoom", value: fit } });
		// External hrefs are deliberately unresolved; embedded data images remain supported.
		rendered = renderer.render();
		const png = rendered.asPng();
		if (!cell) return Uint8Array.from(png);
		const { PNG } = await import("pngjs");
		const raster = PNG.sync.read(Buffer.from(png));
		const width = Math.min(maxWidthPx, Math.ceil(raster.width / cell.widthPx) * cell.widthPx);
		const height = Math.min(maxHeightPx, Math.ceil(raster.height / cell.heightPx) * cell.heightPx);
		const canvas = new PNG({ width, height });
		canvas.data.fill(0);
		for (let row = 0; row < Math.min(height, raster.height); row++) raster.data.copy(canvas.data, row * width * 4, row * raster.width * 4, (row * raster.width + Math.min(width, raster.width)) * 4);
		return PNG.sync.write(canvas);
	} finally { rendered?.free(); renderer?.free(); original.free(); }
}
function reply(message: RenderReply, transfer: ArrayBuffer[] = []): void {
	parentPort!.postMessage(message, transfer);
}
// Register once: a worker handles one request at a time, including async initialization.
parentPort?.on("message", ({ id, task }: { id: number; task: RenderTask }) => {
	void execute(task).then(result => {
		if (typeof result === "string") reply({ id, ok: true, result });
		else { const bytes = Uint8Array.from(result); reply({ id, ok: true, result: bytes }, [bytes.buffer]); }
	}, error => reply({ id, ok: false, error: String(error instanceof Error ? error.message : error) }));
});
