// cloud-pi-tui: adapted from oh-my-pi packages/tui/src/ttyid.ts (commit
// 83de60ad99). FFI `ttyname` replaced with Node-based resolution
// (`/proc/self/fd/0`, `readlink /dev/fd/0`, `ps -o tty=`). See PATCHES.md.
// Resolve the controlling terminal path using Node APIs (FFI-free port).

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

/** Resolve the TTY device path for stdin (fd 0). */
export function getTtyPath(): string | null {
	if (os.platform() === "win32") return null;

	if (os.platform() === "linux") {
		try {
			const ttyPath = fs.readlinkSync("/proc/self/fd/0");
			return ttyPath.startsWith("/dev/") ? ttyPath : null;
		} catch {
			return null;
		}
	}

	// BSD/macOS: /dev/fd/0 does not always resolve, so ask the process table.
	try {
		const direct = fs.readlinkSync("/dev/fd/0");
		if (direct.startsWith("/dev/")) return direct;
	} catch {
		// Fall through to `ps`.
	}
	try {
		const result = spawnSync("ps", ["-o", "tty=", "-p", String(process.pid)], {
			encoding: "utf8",
			timeout: 500,
			stdio: ["ignore", "pipe", "ignore"],
		});
		const name = result.stdout?.trim();
		return name && name !== "?" && name !== "??" ? `/dev/${name}` : null;
	} catch {
		return null;
	}
}
/**
 * Get a stable identifier for the current terminal.
 * Uses the TTY device path (e.g., /dev/pts/3), falling back to environment
 * variables for terminal multiplexers or terminal emulators.
 * Returns null if no terminal can be identified (e.g., piped input).
 */
export function getTerminalId(): string | null {
	// TTY device path — most reliable, unique per terminal tab
	if (process.stdin.isTTY) {
		try {
			const ttyPath = getTtyPath();
			if (ttyPath?.startsWith("/dev/")) {
				return ttyPath.slice(5).replace(/\//g, "-"); // /dev/pts/3 -> pts-3
			}
		} catch {}
	}

	// Fallback to terminal-specific env vars
	// Prefer inner multiplexers over host terminal emulators when stdin has no TTY path.
	const zellijPane = process.env.ZELLIJ_PANE_ID;
	if (zellijPane) {
		// Session names are user-chosen (`zellij -s …`) and the id is used as a
		// breadcrumb filename — normalize path separators like the TTY branch does.
		const zellijSession = process.env.ZELLIJ_SESSION_NAME?.replace(/[\\/]/g, "-");
		return zellijSession ? `zellij-${zellijSession}-${zellijPane}` : `zellij-${zellijPane}`;
	}

	const tmuxPane = process.env.TMUX_PANE;
	if (tmuxPane) return `tmux-${tmuxPane}`;

	const cmuxSurface = process.env.CMUX_SURFACE_ID;
	if (cmuxSurface) return `cmux-${cmuxSurface}`;

	// Kitty before WezTerm/others, matching terminal-capabilities.ts detection
	// order. Inherited env makes either order wrong for some nesting; staying
	// consistent with the capability detector keeps the two answers aligned.
	const kittyId = process.env.KITTY_WINDOW_ID;
	if (kittyId) return `kitty-${kittyId}`;

	const weztermPane = process.env.WEZTERM_PANE;
	if (weztermPane) return `wezterm-${weztermPane}`;

	const terminalSessionId = process.env.TERM_SESSION_ID; // macOS Terminal.app
	if (terminalSessionId) return `apple-${terminalSessionId}`;

	const wtSession = process.env.WT_SESSION; // Windows Terminal
	if (wtSession) return `wt-${wtSession}`;

	return null;
}
