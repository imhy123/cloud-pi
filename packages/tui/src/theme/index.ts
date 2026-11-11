// cloud-pi-tui: adapted copy of oh-my-pi packages/tui/src/theme/index.ts
// (commit e325ffc73ab8; v18.18.7). Added public highlighting hook types, HighlightStream, setHighlighter and supportsLanguage.
// See PATCHES.md.
// Theme runtime: active-theme singleton, loading, appearance detection, and pi-tui adapters.
export type { HighlightColors, Highlighter, HighlighterStream } from "../compat/natives";
export { HighlightStream, setHighlighter, supportsLanguage } from "../compat/natives";
export * from "../lang-from-path";
export * from "./session-color";
export * from "./shimmer";
export * from "./theme";
