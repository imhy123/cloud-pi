// cloud-pi-tui: adapted from oh-my-pi packages/tui/src/components/section.ts
// (commit 83de60ad99). Removed the TSP `describe()` implementation; the
// `render()` path is unchanged. See PATCHES.md.
import type { Component } from "../tui";
import { Ellipsis, finiteWidth, getWidthConfigEpoch, singleLine, truncateToWidth, visibleWidth } from "../utils";

function isComponent(body: Component | readonly string[]): body is Component {
	return !Array.isArray(body);
}

function fillCells(glyph: string, width: number): string {
	const cleanGlyph = singleLine(glyph);
	const glyphWidth = visibleWidth(cleanGlyph);
	if (glyphWidth <= 0) return " ".repeat(width);
	const count = Math.floor(width / glyphWidth);
	return `${cleanGlyph.repeat(count)}${" ".repeat(width - count * glyphWidth)}`;
}

/** Explicit heading/rule/spacing policy for a data section. */
export interface SectionOptions {
	readonly title: string;
	readonly body: Component | readonly string[];
	readonly titleStyle?: (text: string) => string;
	readonly ruleStyle?: (text: string) => string;
	readonly ruleGlyph: string;
	readonly ruleWidth: number | "fill";
	readonly blankAfter?: boolean;
}

/** Compose a width-bounded heading, rule, child rows, and optional trailing blank line. */
export class Section implements Component {
	readonly #options: SectionOptions;
	#cache: { width: number; epoch: number; child: readonly string[]; lines: readonly string[] } | undefined;
	#disposed = false;

	constructor(options: SectionOptions) {
		this.#options = options;
	}

	invalidate(): void {
		if (isComponent(this.#options.body)) this.#options.body.invalidate?.();
		this.#cache = undefined;
	}

	releaseRenderCaches(): void {
		this.#cache = undefined;
		if (isComponent(this.#options.body)) this.#options.body.releaseRenderCaches?.();
	}

	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		if (isComponent(this.#options.body)) this.#options.body.dispose?.();
	}

	render(width: number): readonly string[] {
		const renderWidth = finiteWidth(width);
		const epoch = getWidthConfigEpoch();
		const child = isComponent(this.#options.body) ? this.#options.body.render(renderWidth) : this.#options.body;
		if (this.#cache?.width === renderWidth && this.#cache.epoch === epoch && this.#cache.child === child) {
			return this.#cache.lines;
		}
		const desiredRuleWidth = this.#options.ruleWidth === "fill" ? renderWidth : finiteWidth(this.#options.ruleWidth);
		const rawTitle = singleLine(this.#options.title);
		const styledTitle = this.#options.titleStyle?.(rawTitle) ?? rawTitle;
		const rawRule = fillCells(this.#options.ruleGlyph, Math.min(renderWidth, desiredRuleWidth));
		const styledRule = this.#options.ruleStyle?.(rawRule) ?? rawRule;
		const lines = [
			truncateToWidth(singleLine(styledTitle), renderWidth, Ellipsis.Omit),
			truncateToWidth(singleLine(styledRule), renderWidth, Ellipsis.Omit),
			...child.map(line => truncateToWidth(singleLine(line), renderWidth, Ellipsis.Omit)),
		];
		if (this.#options.blankAfter === true) lines.push("");
		this.#cache = { width: renderWidth, epoch, child, lines };
		return lines;
	}
}
