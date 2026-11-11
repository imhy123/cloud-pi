// cloud-pi-tui: adapted copy of oh-my-pi packages/utils/src/mermaid-ascii.ts
// (commit e325ffc73ab8; v18.18.7). Promise-based worker rendering and async safe fallback; removed unused extractMermaidBlocks.
// See PATCHES.md.
import { type MermaidRenderOptions, renderMermaidAscii } from "@oh-my-pi/pi-natives";

/**
 * Native Mermaid → ASCII/Unicode renderer (flowchart, state, sequence, class,
 * ER, xychart). Asynchronous worker rendering keeps the compositor responsive;
 * throws on empty input, an unknown flowchart header, or an invalid
 * `direction`/`colorMode` value.
 */
export { renderMermaidAscii };

/** Options for {@link renderMermaidAscii}; every field optional. */
export type MermaidAsciiRenderOptions = MermaidRenderOptions;

/** {@link renderMermaidAscii}, returning `null` instead of throwing. */
export async function renderMermaidAsciiSafe(source: string, options?: MermaidAsciiRenderOptions): Promise<string | null> {
	try {
		return await renderMermaidAscii(source, options);
	} catch {
		return null;
	}
}
