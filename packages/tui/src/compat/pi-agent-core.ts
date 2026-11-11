// cloud-pi-tui: new file. Structural stand-in for `@oh-my-pi/pi-agent-core` (`ThinkingLevel`).
// See PATCHES.md.
/**
 * Structural stand-in for `@oh-my-pi/pi-agent-core`. The TUI only needs the
 * `ThinkingLevel` enum-shaped constant; keeping the values identical preserves
 * theme lookups keyed by level string.
 */

export const ThinkingLevel = {
	Inherit: "inherit",
	Off: "off",
	Minimal: "minimal",
	Low: "low",
	Medium: "medium",
	High: "high",
	XHigh: "xhigh",
	Max: "max",
} as const;

export type ThinkingLevel = (typeof ThinkingLevel)[keyof typeof ThinkingLevel];
