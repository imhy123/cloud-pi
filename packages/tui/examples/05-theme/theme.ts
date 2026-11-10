import { getCurrentThemeName, initTheme, matchesKey, onThemeChange, previewTheme, ProcessTerminal, setTheme, Text, TUI, theme } from "@cloud-pi/tui";

await initTheme();

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 05-theme", 1, 1);
const hint = new Text("d dark · l light · p preview light for 2s · Ctrl+C quits", 1, 0);
const status = new Text("", 1, 1);

hint.setStyleFn(text => theme.fg("dim", text));
status.setStyleFn(text => theme.fg("muted", text));

// Each row resolves its color at render time, so invalidating it after a
// theme change is enough to repaint with the new palette.
const swatch = (label: string, style: (text: string) => string): Text => {
	const row = new Text("", 1, 0);
	row.setStyleFn(style);
	row.setText(label);
	return row;
};

const rows: readonly Text[] = [
	swatch("accent      theme.fg(\"accent\")", text => theme.fg("accent", text)),
	swatch("success     theme.fg(\"success\")", text => theme.fg("success", text)),
	swatch("warning     theme.fg(\"warning\")", text => theme.fg("warning", text)),
	swatch("error       theme.fg(\"error\")", text => theme.fg("error", text)),
	swatch("muted       theme.fg(\"muted\")", text => theme.fg("muted", text)),
	swatch("dim         theme.fg(\"dim\")", text => theme.fg("dim", text)),
	swatch("mdHeading   theme.fg(\"mdHeading\")", text => theme.fg("mdHeading", text)),
	swatch("mdCode      theme.fg(\"mdCode\")", text => theme.fg("mdCode", text)),
	swatch("selectedBg  theme.bg(\"selectedBg\")", text => theme.bg("selectedBg", theme.fg("text", text))),
	swatch("bold + accent", text => theme.bold(theme.fg("accent", text))),
];

const updateStatus = (): void => {
	status.setText(`active theme: ${getCurrentThemeName() ?? "unknown"}`);
};

let previewTimer: NodeJS.Timeout | undefined;

const cancelPreview = (): void => {
	if (previewTimer) {
		clearTimeout(previewTimer);
		previewTimer = undefined;
	}
};

const cleanup = (): void => {
	cancelPreview();
	tui.stop();
};

onThemeChange(() => {
	for (const row of rows) row.invalidate();
	updateStatus();
	tui.requestRender();
});

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		cleanup();
		process.exit(0);
	}
	if (data === "d") {
		cancelPreview();
		void setTheme("dark");
		return { consume: true };
	}
	if (data === "l") {
		cancelPreview();
		void setTheme("light");
		return { consume: true };
	}
	if (data === "p") {
		const previous = getCurrentThemeName() ?? "dark";
		cancelPreview();
		void previewTheme("light");
		previewTimer = setTimeout(() => {
			previewTimer = undefined;
			void setTheme(previous);
		}, 2000);
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
for (const row of rows) tui.addChild(row);
tui.addChild(status);

updateStatus();
tui.start();
