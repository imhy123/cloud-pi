// cloud-pi-tui: adapted copy of oh-my-pi packages/utils/src/index.ts
// (commit e325ffc73ab8; v18.18.7). Curated facade instead of the full upstream barrel.
// See PATCHES.md.
/**
 * Curated facade over the vendored `@oh-my-pi/pi-utils` modules.
 *
 * Only what the vendored TUI sources import is re-exported: the upstream
 * package barrel also pulls in session, worker and stream helpers that drag
 * runtime dependencies cloud-pi-tui does not ship. Each subpath stays importable
 * through `@oh-my-pi/pi-utils/<module>` for the same reason.
 */

export {
	hexToHsv,
	hexToOklch,
	hexToRgb,
	hslToHex,
	hsvToHex,
	hsvToRgb,
	hueDistance,
	oklabDistance,
	oklchCusp,
	oklchToHex,
	paletteToRgb,
	relativeLuminance,
	rgbToHex,
	rgbToHsv,
} from "./color";
export { getProjectDir } from "./dirs";
export { $env } from "./env";
export { formatAge, formatBytes, formatCount, formatDuration, formatNumber, pluralize } from "./format";
export { isEnoent, isFsError } from "./fs-error";
export * as logger from "./logger";
export {
	popLoopPhase,
	pushLoopPhase,
	resetLoopPhaseWindow,
	takeLoopPhaseAttribution,
} from "./loop-phase";
export { sanitizeText } from "./sanitize-text";
export { slugify } from "./slugify";
export { DEFAULT_TAB_WIDTH } from "./tab-spacing";
export { isRecord } from "./type-guards";
export { $which } from "./which";
