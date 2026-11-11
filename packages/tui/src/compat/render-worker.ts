// cloud-pi-tui: new file. Typed SVG/Mermaid calls and contracts, font configuration and bounded lazy worker lifecycle.
// See PATCHES.md.
import { Worker } from "node:worker_threads";

export interface MermaidRenderOptions {
	useAscii?: boolean;
	paddingX?: number;
	paddingY?: number;
	boxBorderPadding?: number;
	direction?: "TD" | "TB" | "LR" | "BT" | "RL";
	colorMode?: "none" | "auto" | "ansi16" | "ansi256" | "truecolor" | "html";
	theme?: {
		fg?: string;
		border?: string;
		line?: string;
		arrow?: string;
		accent?: string;
		corner?: string;
		junction?: string;
	};
}
export interface SvgCell {
	widthPx: number;
	heightPx: number;
}
export interface SvgFontOptions {
	/** Configuration copies these bytes; rendering does not depend on browser/native font APIs. */
	fontBuffers?: Uint8Array[];
	fontFiles?: string[];
	fontDirs?: string[];
	/** Search common macOS, Linux and Windows font directories. Defaults to true. */
	loadSystemFonts?: boolean;
	defaultFontFamily?: string;
}
export type RenderTask =
	| { kind: "mermaid"; source: string; options?: MermaidRenderOptions }
	| {
		kind: "svg";
		input: Uint8Array;
		maxWidthPx: number;
		maxHeightPx: number;
		scale: number;
		cell?: SvgCell;
		fonts: SvgFontOptions;
		fontRevision: number;
	};
type RenderKind = RenderTask["kind"];
type Task<K extends RenderKind> = Extract<RenderTask, { kind: K }>;
type Result<K extends RenderKind> = K extends "mermaid" ? string : Uint8Array;
export type RenderReply =
	| { id: number; ok: true; result: string | Uint8Array }
	| { id: number; ok: false; error: string };
interface Job<K extends RenderKind> {
	id: number;
	task: Task<K>;
	resolve: (value: Result<K>) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

/** One instance per renderer, so SVG work cannot delay Mermaid layout. */
export class RenderWorker<K extends RenderKind> {
	#worker?: Worker;
	#queue: Job<K>[] = [];
	#active?: Job<K>;
	#nextId = 0;

	constructor(readonly kind: K, readonly timeoutMs = 15_000, readonly queueLimit = 32) {}

	run(task: Task<K>): Promise<Result<K>> {
		if (task.kind !== this.kind) return Promise.reject(new Error("Wrong render worker kind"));
		if (this.#queue.length + Number(!!this.#active) >= this.queueLimit) {
			return Promise.reject(new Error("Render worker queue is full"));
		}
		return new Promise((resolve, reject) => {
			const job: Job<K> = {
				id: this.#nextId++, task, resolve, reject,
				timer: setTimeout(() => {
					if (this.#active === job) this.#fail(new Error("Rendering timed out"));
					else {
						this.#queue = this.#queue.filter(other => other !== job);
						job.reject(new Error("Rendering timed out in queue"));
					}
				}, this.timeoutMs),
			};
			this.#queue.push(job);
			this.#pump();
		});
	}

	#pump(): void {
		if (this.#active || !this.#queue.length) return;
		try {
			if (!this.#worker) {
				const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
				// Host eval/stdin flags are not valid for the worker's file entry.
				const execArgv = process.execArgv.filter((arg, index, args) =>
					!arg.startsWith("--input-type=") && arg !== "--input-type" && args[index - 1] !== "--input-type",
				);
				const worker = new Worker(new URL(`./render-worker-entry.${extension}`, import.meta.url), {
					execArgv,
					name: `cloud-pi-${this.kind}`,
					resourceLimits: { maxOldGenerationSizeMb: 128 },
				});
				this.#worker = worker;
				worker.on("message", (reply: RenderReply) => {
					if (this.#worker !== worker || reply.id !== this.#active?.id) return;
					const job = this.#active;
					this.#active = undefined;
					clearTimeout(job.timer);
					try { job.resolve(this.#result(reply)); }
					catch (error) { job.reject(error instanceof Error ? error : new Error(String(error))); }
					worker.unref();
					this.#pump();
				});
				worker.on("error", error => { if (this.#worker === worker) this.#fail(error); });
				worker.on("exit", () => {
					if (this.#worker === worker) this.#fail(new Error("Render worker exited"));
				});
			}
			this.#active = this.#queue.shift()!;
			this.#worker.ref();
			this.#worker.postMessage({ id: this.#active.id, task: this.#active.task });
		} catch (error) {
			this.#fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	#result(reply: RenderReply): Result<K> {
		if (!reply.ok) throw new Error(reply.error);
		const result = reply.result;
		if (this.kind === "mermaid" ? typeof result !== "string" : !(result instanceof Uint8Array)) {
			throw new Error("Invalid render worker result");
		}
		// The kind-specific runtime check above establishes this request/result relationship.
		return result as Result<K>;
	}

	#fail(error: Error): void {
		const worker = this.#worker;
		this.#worker = undefined;
		if (worker) void worker.terminate();
		const jobs = this.#active ? [this.#active, ...this.#queue] : this.#queue;
		this.#active = undefined;
		this.#queue = [];
		for (const job of jobs) {
			clearTimeout(job.timer);
			job.reject(error);
		}
	}

	/** Reject outstanding work; the next request lazily starts a fresh worker. */
	close(): void { this.#fail(new Error("Render worker closed")); }
}

const mermaidWorker = new RenderWorker("mermaid");
const svgWorker = new RenderWorker("svg");
export function closeMediaWorkers(): void {
	mermaidWorker.close();
	svgWorker.close();
}

/** Run layout in the renderer worker; never perform graph layout in the compositor. */
export async function renderMermaidAscii(text: string, options?: MermaidRenderOptions | null): Promise<string> {
	return mermaidWorker.run({ kind: "mermaid", source: text, options: options ?? undefined });
}

let svgFonts: SvgFontOptions = {};
let svgFontRevision = 0;
/** Configure worker fonts; buffers and lists are copied so later mutations cannot change a render. */
export function setSvgFontOptions(options: SvgFontOptions): void {
	const total = options.fontBuffers?.reduce((sum, font) => sum + font.byteLength, 0) ?? 0;
	if (total > 64 * 1024 * 1024) throw new Error("SVG font data exceeds 64 MiB");
	svgFonts = {
		...options,
		fontBuffers: options.fontBuffers?.map(font => Uint8Array.from(font)),
		fontFiles: options.fontFiles?.slice(),
		fontDirs: options.fontDirs?.slice(),
	};
	svgFontRevision++;
}
/** Bounded SVG/SVGZ to PNG conversion, including whole-cell transparent padding. */
export async function rasterizeSvg(input: Uint8Array, maxWidthPx: number, maxHeightPx: number, scale = 1, cell?: SvgCell): Promise<Uint8Array> {
	return svgWorker.run({
		kind: "svg", input, maxWidthPx, maxHeightPx, scale, cell,
		fonts: svgFonts,
		fontRevision: svgFontRevision,
	});
}

