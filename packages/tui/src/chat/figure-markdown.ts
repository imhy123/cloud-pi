// cloud-pi-tui: adapted copy of oh-my-pi packages/tui/src/chat/figure-markdown.ts
// (commit e325ffc73ab8; v18.18.7). SVG-only integration without table charts, asynchronous Markdown repaint callbacks and lifecycle handling.
// See PATCHES.md.
import type { ImageBudget } from "../components/image";
import { type Markdown, streamingMarkdownSource, type TableLocks } from "../components/markdown";
import { TERMINAL } from "../terminal-capabilities";
import { Spacer } from "../components/spacer";
import { Container } from "../tui";
import { SvgFigure, svgFigureRendering } from "./svg-figure";
import { type FigureSegment, splitSvgFences } from "./svg-source";

export interface FigureMarkdownOptions {
	/** Markdown for one prose run (and a failed figure's code fallback); FigureMarkdown drives its transience. */
	markdown: (text: string) => Markdown;
	/**
	 * Table locks for the leading prose run (see {@link Markdown.tableLocks}),
	 * the only run a transcript publishes stable rows from.
	 */
	tableLocks?: TableLocks;
	/** Shared inline-image budget for the figures. */
	budget?: ImageBudget;
	/** Rows each figure may fill, read on every render; callers reserve prose, chrome and separators themselves. Unset or `undefined` takes a share of the terminal viewport. */
	maxRows?: () => number | undefined;
	/** A figure's rows changed outside a text update (raster landed, fell back to code). */
	onChange: () => void;
}

type Part =
	| { readonly kind: "markdown"; readonly md: Markdown; text: string }
	| { readonly kind: "svg"; readonly figure: SvgFigure; source: string; closed: boolean };

/**
 * Assistant Markdown whose top-level ```svg fences are lifted out of the prose
 * and drawn as images ({@link SvgFigure}), with ordinary {@link Markdown}
 * for the prose between them. Stands in for Markdown on an assistant text
 * block that holds an svg fence: {@link setText} streams
 * in place, reusing every part whose kind is unchanged, and
 * {@link transientRenderCache} marks the block's tail as still streaming — the
 * last prose run renders transient, the last figure throttles its rasters
 * until its fence closes.
 */
export class FigureMarkdown extends Container {
	readonly #options: FigureMarkdownOptions;
	#text = "";
	#transient = false;
	#parts: Part[] = [];

	constructor(text: string, options: FigureMarkdownOptions) {
		super();
		this.#options = options;
		this.setText(text);
	}

	/** Replace the source; returns whether it changed. */
	setText(text: string): boolean {
		if (text === this.#text) return false;
		this.#text = text;
		this.#reconcile();
		return true;
	}

	get transientRenderCache(): boolean {
		return this.#transient;
	}

	set transientRenderCache(value: boolean) {
		if (this.#transient === value) return;
		this.#transient = value;
		// Finalizing lets the last SVG render immediately.
		this.#reconcile();
	}

	/**
	 * The trimmed prose ahead of the first figure, or "" when the block opens
	 * with one. These are the only rows plain Markdown reproduces byte for
	 * byte, so they are all a transcript may publish ahead of the figure. While
	 * that prose is still the streaming tail (no figure follows it yet), only
	 * its settled prefix ({@link Markdown.getLastRenderStableText}) qualifies:
	 * the rest is still being written. Both forms are in
	 * {@link streamingMarkdownSource} form, so the settled prefix stays a byte
	 * prefix of the whole run once a figure splits it off.
	 */
	get leadingProse(): string {
		const first = this.#parts[0];
		if (first?.kind !== "markdown") return "";
		if (first.md.pendingMermaid) return first.md.getLastRenderStableText().trim();
		if (this.#transient && this.#parts.length === 1) return first.md.getLastRenderStableText().trim();
		return streamingMarkdownSource(first.text);
	}

	/** Whether {@link leadingProse} ends inside a locked table that is still streaming. */
	get leadingProseEndsInOpenTable(): boolean {
		const first = this.#parts[0];
		return (
			first?.kind === "markdown" &&
			this.#transient &&
			this.#parts.length === 1 &&
			first.md.lastRenderStableTextEndsInOpenTable()
		);
	}

	/** Lock a table streaming at the tail of the leading prose; see {@link Markdown.lockOpenTable}. */
	lockOpenTable(): boolean {
		const first = this.#parts[0];
		return first?.kind === "markdown" && this.#transient && this.#parts.length === 1 && first.md.lockOpenTable();
	}

	/** Whether final SVG or Mermaid output still awaits its worker. */
	get pending(): boolean {
		return this.#parts.some(part => part.kind === "markdown" ? part.md.pendingMermaid : part.figure.pending);
	}

	/** Rebuild the prose runs through the Markdown factory after its theme changed; figures keep their rasters. */
	restyle(): void {
		for (const part of this.#parts) if (part.kind === "markdown") part.md.dispose();
		this.#parts = this.#parts.map((part, index) =>
			part.kind === "markdown" ? { kind: "markdown", md: this.#proseRun(part.text, index), text: part.text } : part,
		);
		this.#mount();
		this.#syncTails();
	}

	override dispose(): void {
		for (const part of this.#parts) { if (part.kind === "markdown") part.md.dispose(); else part.figure.dispose(); }
		this.#parts = [];
		this.clear();
	}

	#proseRun(text: string, index: number): Markdown {
		const md = this.#options.markdown(text);
		md.onChange = this.#options.onChange;
		if (index === 0) md.tableLocks = this.#options.tableLocks;
		return md;
	}

	#reconcile(): void {
		const previous = this.#parts;
		const segments = this.#segments();
		let reshaped = previous.length !== segments.length;
		this.#parts = segments.map((segment, index): Part => {
			const old = previous[index];
			if (segment.kind === "markdown") {
				const text = segment.text.trim();
				if (old?.kind === "markdown") {
					old.md.setText(text);
					old.text = text;
					return old;
				}
				reshaped = true;
				return { kind: "markdown", md: this.#proseRun(text, index), text };
			}
			if (old?.kind === "svg") {
				old.source = segment.source;
				old.closed = segment.closed;
				return old;
			}
			reshaped = true;
			const { markdown, budget, maxRows, onChange } = this.#options;
			return {
				kind: "svg",
				figure: new SvgFigure({ markdown, budget, maxRows, onChange }),
				source: segment.source,
				closed: segment.closed,
			};
		});
		if (reshaped) {
			for (const old of previous) {
				if (!this.#parts.includes(old)) { if (old.kind === "markdown") old.md.dispose(); else old.figure.dispose(); }
			}
			this.#mount();
		}
		this.#syncTails();
	}

	/**
	 * The block as prose and SVG fences; only the last run can still stream.
	 */
	#segments(): FigureSegment[] {
		return svgFigureRendering() && TERMINAL.imageProtocol !== null ? splitSvgFences(this.#text) : [{ kind: "markdown", text: this.#text }];
	}

	/** Mount the parts as children, a blank row between neighbours. */
	#mount(): void {
		this.clear();
		this.#parts.forEach((part, index) => {
			if (index > 0) this.addChild(new Spacer(1));
			this.addChild(part.kind === "markdown" ? part.md : part.figure);
		});
	}

	/** Push sources and streaming state down: only the last part can still be streaming. */
	#syncTails(): void {
		const last = this.#parts.length - 1;
		this.#parts.forEach((part, index) => {
			const streaming = this.#transient && index === last;
			if (part.kind === "markdown") part.md.transientRenderCache = streaming;
			else if (part.kind === "svg") part.figure.update(part.source, part.closed || !streaming);
		});
	}
}
