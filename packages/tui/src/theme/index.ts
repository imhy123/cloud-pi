// cloud-pi-tui: adapted from oh-my-pi packages/tui/src/theme/index.ts (commit
// 83de60ad99). Highlighting APIs now come from `compat/natives` instead of the
// native addon. See PATCHES.md.
// Theme runtime: active-theme singleton, loading, appearance detection, and pi-tui adapters.
export type { HighlightColors, Highlighter, HighlighterStream } from "../compat/natives";
export { setHighlighter, supportsLanguage } from "../compat/natives";
export * from "../lang-from-path";
export * from "./session-color";
export * from "./shimmer";
export * from "./theme";
