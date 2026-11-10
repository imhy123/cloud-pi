import { CancellableLoader, Container, initTheme, Loader, matchesKey, ProcessTerminal, Text, TUI, theme } from "@cloud-pi/tui";

await initTheme();

const TOTAL_FILES = 24;
const INDEX_TICK_MS = 90;

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 07-loader", 1, 1);
const hint = new Text("Esc cancels the cancellable loader · r restarts · Ctrl+C quits", 1, 0);
const transcript = new Container();
const slot = new Container();
const status = new Text("", 1, 1);

hint.setStyleFn(text => theme.fg("dim", text));
status.setStyleFn(text => theme.fg("muted", text));

const accent = (text: string): string => theme.fg("accent", text);
const muted = (text: string): string => theme.fg("muted", text);

let indexTimer: NodeJS.Timeout | undefined;
let warmTimer: NodeJS.Timeout | undefined;
let indexed = 0;

const stopIndexTimer = (): void => {
	if (indexTimer) {
		clearInterval(indexTimer);
		indexTimer = undefined;
	}
};

const stopWarmTimer = (): void => {
	if (warmTimer) {
		clearTimeout(warmTimer);
		warmTimer = undefined;
	}
};

const resetSlot = (): void => {
	stopWarmTimer();
	slot.disposeChildren();
};

const warmCache = (): void => {
	const warm = new Loader(tui, accent, muted, "Warming cache…");
	slot.addChild(warm);
	tui.requestRender();
	warmTimer = setTimeout(() => {
		warmTimer = undefined;
		slot.removeChild(warm);
		warm.dispose();
		transcript.addChild(new Text(theme.fg("success", "Cache warm. Press r to run again."), 1, 0));
		status.setText("Idle.");
		tui.requestRender();
	}, 900);
};

const restart = (): void => {
	stopIndexTimer();
	resetSlot();
	transcript.disposeChildren();
	indexed = 0;

	const job = new CancellableLoader(tui, accent, muted, `Indexing files… 0/${TOTAL_FILES} (Esc cancels)`);

	job.onAbort = () => {
		stopIndexTimer();
		if (slot.children.includes(job)) slot.removeChild(job);
		job.dispose();
		transcript.addChild(new Text(theme.fg("warning", `Cancelled after ${indexed}/${TOTAL_FILES} files.`), 1, 0));
		status.setText("Cancelled. Press r to restart.");
		tui.setFocus(null);
		tui.requestRender();
	};

	slot.addChild(job);
	tui.setFocus(job);
	status.setText("Indexing. Esc cancels; the loader owns the keyboard while it runs.");
	tui.requestRender();

	indexTimer = setInterval(() => {
		indexed += 1;
		job.setMessage(`Indexing files… ${indexed}/${TOTAL_FILES} (Esc cancels)`);
		if (indexed < TOTAL_FILES) return;

		stopIndexTimer();
		slot.removeChild(job);
		job.dispose();
		transcript.addChild(new Text(theme.fg("success", `Indexed ${TOTAL_FILES} files.`), 1, 0));
		status.setText("Indexing complete. Warming the cache…");
		tui.setFocus(null);
		tui.requestRender();
		warmCache();
	}, INDEX_TICK_MS);
};

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		stopIndexTimer();
		stopWarmTimer();
		slot.disposeChildren();
		tui.stop();
		process.exit(0);
	}
	if (data === "r") {
		restart();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
tui.addChild(transcript);
tui.addChild(slot);
tui.addChild(status);
tui.start();

restart();
