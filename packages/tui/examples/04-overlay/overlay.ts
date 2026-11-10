import type { Component, OverlayHandle } from "@cloud-pi/tui";
import {
	initTheme,
	matchesKey,
	ProcessTerminal,
	Text,
	TUI,
	theme,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@cloud-pi/tui";

await initTheme();

const MIN_OVERLAY_WIDTH = 50;

const CONFIRM_OPTIONS = {
	anchor: "center" as const,
	width: "60%" as const,
	minWidth: 36,
	maxHeight: 12,
	margin: 1,
	// The overlay stays mounted but is hidden on narrow terminals. Focus is only
	// handed to it while it is visible, so the status line explains how to reopen it.
	visible: (width: number) => width >= MIN_OVERLAY_WIDTH,
};

class ConfirmDialog implements Component {
	#tui: TUI;
	#title: string;
	#message: string;
	#resolve: (confirmed: boolean) => void;
	#selected = 0;
	#done = false;
	#cachedWidth?: number;
	#cachedLines?: readonly string[];

	constructor(tui: TUI, title: string, message: string, resolve: (confirmed: boolean) => void) {
		this.#tui = tui;
		this.#title = title;
		this.#message = message;
		this.#resolve = resolve;
	}

	invalidate(): void {
		this.#cachedWidth = undefined;
		this.#cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "left") || matchesKey(data, "shift+tab") || data === "h") {
			this.#select(0);
		} else if (matchesKey(data, "right") || matchesKey(data, "tab") || data === "l") {
			this.#select(1);
		} else if (matchesKey(data, "enter")) {
			this.#finish(this.#selected === 0);
		} else if (matchesKey(data, "escape") || data === "n") {
			this.#finish(false);
		} else if (data === "y") {
			this.#finish(true);
		}
	}

	#select(index: number): void {
		if (this.#selected === index) return;
		this.#selected = index;
		this.invalidate();
		this.#tui.requestRender();
	}

	#finish(confirmed: boolean): void {
		if (this.#done) return;
		this.#done = true;
		this.#resolve(confirmed);
	}

	#button(label: string, active: boolean): string {
		const padded = `  ${label}  `;
		return active ? theme.bg("selectedBg", theme.fg("text", padded)) : theme.fg("muted", padded);
	}

	render(width: number): readonly string[] {
		if (this.#cachedLines && this.#cachedWidth === width) {
			return this.#cachedLines;
		}

		if (width < 10) {
			this.#cachedWidth = width;
			this.#cachedLines = [truncateToWidth(this.#title, width)];
			return this.#cachedLines;
		}

		const inner = width - 4;
		const row = (content: string): string => {
			const text = truncateToWidth(content, inner);
			return `${theme.fg("border", "│")} ${text}${" ".repeat(Math.max(0, inner - visibleWidth(text)))} ${theme.fg("border", "│")}`;
		};

		const lines = [
			theme.fg("border", `┌${"─".repeat(width - 2)}┐`),
			row(""),
			row(theme.bold(theme.fg("accent", this.#title))),
			row(""),
			...wrapTextWithAnsi(this.#message, inner).map(row),
			row(""),
			row(`${this.#button("No", this.#selected === 0)}   ${this.#button("Yes", this.#selected === 1)}`),
			row(theme.fg("dim", "←/→ switch · Enter confirm · Esc cancel")),
			row(""),
			theme.fg("border", `└${"─".repeat(width - 2)}┘`),
		];

		this.#cachedWidth = width;
		this.#cachedLines = lines;
		return lines;
	}
}

const terminal = new ProcessTerminal();
const tui = new TUI(terminal, true);
const header = new Text("@cloud-pi/tui / 04-overlay", 1, 1);
const hint = new Text("Confirming opens a centered dialog sized as 60% of the terminal width.", 1, 0);
const status = new Text("", 1, 1);
const transcript = new Text("background task: waiting for confirmation", 1, 0);

status.setStyleFn(text => theme.fg("muted", text));
hint.setStyleFn(text => theme.fg("dim", text));

let dialog: OverlayHandle | null = null;

const closeDialog = (confirmed: boolean): void => {
	dialog?.hide();
	dialog = null;
	transcript.setText(confirmed ? "background task: confirmed, continuing" : "background task: cancelled");
	status.setText("Press o to open the dialog again. Ctrl+C quits.");
	tui.requestRender();
};

const openDialog = (): void => {
	if (terminal.columns < MIN_OVERLAY_WIDTH) {
		status.setText(`Terminal is ${terminal.columns} columns wide; widen it to ${MIN_OVERLAY_WIDTH} to show the dialog.`);
		tui.requestRender();
		return;
	}

	dialog?.hide();
	status.setText("Use ←/→ and Enter, or y / n / Esc. Ctrl+C quits.");
	dialog = tui.showOverlay(
		new ConfirmDialog(tui, "Deploy to production?", "This restarts every worker. Continue?", closeDialog),
		CONFIRM_OPTIONS,
	);
	tui.requestRender();
};

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	if (data === "o") {
		openDialog();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
tui.addChild(transcript);
tui.addChild(status);
tui.start();

openDialog();
