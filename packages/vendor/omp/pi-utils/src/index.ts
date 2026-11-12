// cloud-pi-vendor: adapted copy of oh-my-pi packages/utils/src/index.ts
// (commit e325ffc73ab8; v18.18.7). Curated TUI + catalog facade, including explicit host environment initialization.
// See PATCHES.md.
/**
 * Curated facade over the vendored `@oh-my-pi/pi-utils` modules.
 *
 * Only what the vendored TUI and catalog sources import is re-exported. Each
 * subpath stays importable through `@oh-my-pi/pi-utils/<module>`.
 */

export { once } from "./abortable";
export { hashString } from "./bun-compat";
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
export { getInstallId, getModelDbPath, getProjectDir, USER_AGENT, VERSION } from "./dirs";
export { $env, $pickenv, initializeEnvironment, type EnvironmentOptions } from "./env";
export { type FetchWithRetryOptions, fetchWithRetry, type RetryHintOptions } from "./fetch-retry";
export { formatAge, formatBytes, formatCount, formatDuration, formatNumber, pluralize } from "./format";
export { isEnoent, isFsError } from "./fs-error";
export * as logger from "./logger";
export {
	popLoopPhase,
	pushLoopPhase,
	resetLoopPhaseWindow,
	takeLoopPhaseAttribution,
} from "./loop-phase";
export { LRUCache } from "./lru";
export { sanitizeText } from "./sanitize-text";
export { slugify } from "./slugify";
export {
	Database,
	isSqliteCorruptionError,
	openSqliteDatabaseSync,
	type Statement,
} from "./sqlite";
export { DEFAULT_TAB_WIDTH } from "./tab-spacing";
export { removeSyncWithRetries, removeWithRetries, TempDir } from "./temp";
export { type FetchImpl, wrapFetchForExtraCa } from "./tls-fetch";
export { isRecord } from "./type-guards";
export { $which } from "./which";
