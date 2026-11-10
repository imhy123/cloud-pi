// cloud-pi-tui: adapted from oh-my-pi packages/tui/src/tmux.ts (commit
// 83de60ad99). Removed the TSP session helpers and SIXEL client detection.
// See PATCHES.md.
import { $which } from "@oh-my-pi/pi-utils";
import { isBunTestRuntime } from "@oh-my-pi/pi-utils/env";
import { tmuxMultiplexer, wrapTmuxPassthrough } from "./multiplexers/tmux";

export { wrapTmuxPassthrough } from "./multiplexers/tmux";

/** Pass a control sequence through tmux, leaving direct-terminal output unchanged. */
export function wrapTmuxPassthroughIfNeeded(payload: string, env: NodeJS.ProcessEnv = Bun.env): string {
	return tmuxMultiplexer.isInside(env) ? wrapTmuxPassthrough(payload) : payload;
}

const CLIENT_TERMTYPE_NAME = /^([A-Za-z][A-Za-z0-9._+-]*)(?=\s|\(|$)/u;
// One `tmux display-message` round trip over the server socket, which answers in
// single-digit milliseconds when healthy. 500ms kept losing the race on a loaded
// machine (fork/exec of the tmux client alone can exceed it on a saturated box),
// and a lost race is indistinguishable from "not tmux": the process then falls
// back to the true-color profile for the whole session. 2s bounds the startup
// stall only when tmux is genuinely wedged.
const CLIENT_TERMINAL_TIMEOUT_MS = 2_000;
/** Client `TERM` values that name their emulator; tmux records this on every version. */
const CLIENT_TERMNAME_PROGRAMS: ReadonlyArray<readonly [RegExp, string]> = [
	[/^xterm-kitty$/u, "kitty"],
	[/^xterm-ghostty$/u, "ghostty"],
	[/^xterm-rex$/u, "rex"],
	[/^wezterm$/u, "wezterm"],
];
let cachedClientTerminalNames: readonly string[] | undefined;

/**
 * Emulator name candidates from a `#{client_termtype}<TAB>#{client_termname}`
 * line, best first: the terminal-type reply (tmux 3.4+, XTVERSION), then the
 * emulator the client's `TERM` names when it ships its own terminfo entry. Both
 * are kept because the reply can name an unrecognized program (a nested tmux
 * answers `tmux 3.4`) while `TERM` still identifies the emulator.
 */
export function tmuxClientProgramsFromReport(report: string): string[] {
	// Split before trimming: an empty terminal type leaves the line starting with the tab.
	const [termtype = "", termname = ""] = report.split("\t");
	const programs: string[] = [];
	const program = CLIENT_TERMTYPE_NAME.exec(termtype.trim())?.[1];
	if (program) programs.push(program);
	const term = termname.trim().toLowerCase();
	const termProgram = CLIENT_TERMNAME_PROGRAMS.find(([pattern]) => pattern.test(term))?.[1];
	if (termProgram) programs.push(termProgram);
	return programs;
}

function queryTmuxClientTerminalNames(env: NodeJS.ProcessEnv): readonly string[] {
	const tmux = $which("tmux", { PATH: env.PATH });
	if (!tmux) return [];
	try {
		const result = Bun.spawnSync([tmux, "display-message", "-p", "#{client_termtype}\t#{client_termname}"], {
			env,
			stdout: "pipe",
			stderr: "ignore",
			timeout: CLIENT_TERMINAL_TIMEOUT_MS,
			killSignal: "SIGKILL",
		});
		if (result.exitCode !== 0) return [];
		return tmuxClientProgramsFromReport(result.stdout.toString());
	} catch {
		return [];
	}
}

const TMUX_COMMAND_TIMEOUT_MS = 500;

/** Run a tmux command against the current server; its stdout, or null on failure. */
function runTmux(args: string[], env: NodeJS.ProcessEnv): string | null {
	const tmux = $which("tmux", { PATH: env.PATH });
	if (!tmux) return null;
	try {
		const result = Bun.spawnSync([tmux, ...args], {
			env,
			stdout: "pipe",
			stderr: "ignore",
			timeout: TMUX_COMMAND_TIMEOUT_MS,
			killSignal: "SIGKILL",
		});
		return result.exitCode === 0 ? result.stdout.toString() : null;
	} catch {
		return null;
	}
}

/**
 * Resolve the terminal emulator names recorded for this tmux client, best first.
 *
 * tmux overwrites pane identity variables with its own values, but retains the
 * attached client's terminal-type reply in `#{client_termtype}` and its `TERM`
 * in `#{client_termname}` (see {@link tmuxClientProgramsFromReport}). The local
 * IPC query runs once per process and degrades to `[]` when unavailable.
 */
export function resolveTmuxClientTerminalNames(env: NodeJS.ProcessEnv = Bun.env): readonly string[] {
	if (!tmuxMultiplexer.isInside(env) || isBunTestRuntime()) return [];
	cachedClientTerminalNames ??= queryTmuxClientTerminalNames(env);
	return cachedClientTerminalNames;
}

let cachedPanePassthrough: { key: string; allowed: boolean } | undefined;

function queryTmuxPaneAllowsPassthrough(env: NodeJS.ProcessEnv): boolean {
	const pane = env.TMUX_PANE;
	const target = pane ? ["-t", pane] : [];
	const value = runTmux(["show-options", "-Apqv", ...target, "allow-passthrough"], env)?.trim();
	if (value === undefined) return false;
	// tmux before 3.3 has no `allow-passthrough` option (`-q` prints nothing)
	// and always forwards DCS passthrough.
	return value === "" || value === "on" || value === "all";
}

/**
 * Whether tmux forwards this pane's `\x1bPtmux;…\x1b\\` passthrough envelopes
 * to the attached client. tmux 3.3+ defaults `allow-passthrough` to `off` and
 * then silently drops every wrapped sequence, so Kitty graphics sent through
 * the envelope never reach a Kitty-capable outer terminal. Resolves the
 * effective pane value (pane → window → global). Queried once per pane;
 * `false` outside tmux or when the query fails.
 */
export function tmuxPaneAllowsPassthrough(env: NodeJS.ProcessEnv = Bun.env): boolean {
	const tmux = env.TMUX;
	if (!tmux) return false;
	const key = `${tmux}\0${env.TMUX_PANE ?? ""}`;
	if (cachedPanePassthrough?.key !== key) {
		cachedPanePassthrough = { key, allowed: queryTmuxPaneAllowsPassthrough(env) };
	}
	return cachedPanePassthrough.allowed;
}
