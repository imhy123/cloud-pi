import {
	Container,
	getTerminalInfo,
	initTheme,
	matchesKey,
	NotifyProtocol,
	ProcessTerminal,
	ProgressBar,
	type ProgressBarStyle,
	TERMINAL,
	TERMINAL_ID,
	Text,
	TUI,
	theme,
} from "@cloud-pi/tui";

await initTheme();

const TICK_MS = 80;
const STEP = 0.04;

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 09-notify", 1, 1);
const hint = new Text("s start/restart build · n send a test notification · Ctrl+C quits", 1, 0);
const log = new Container();
const status = new Text("", 1, 1);

hint.setStyleFn(text => theme.fg("dim", text));
status.setStyleFn(text => theme.fg("muted", text));

const barStyle: ProgressBarStyle = {
	filled: "█",
	empty: "░",
	styleFilled: text => theme.fg("success", text),
	styleEmpty: text => theme.fg("dim", text),
};

const bar = new ProgressBar(0, {
	min: 0,
	max: 1,
	minWidth: 24,
	maxWidth: 40,
	prefix: "build ",
	showPercentage: true,
	style: barStyle,
});

const protocolName =
	TERMINAL.notifyProtocol === NotifyProtocol.Osc99
		? "OSC 99"
		: TERMINAL.notifyProtocol === NotifyProtocol.Osc9
			? "OSC 9"
			: "BEL";

const send = (title: string, body: string): void => {
	getTerminalInfo(TERMINAL_ID).sendNotification({ title, body });
};

let timer: NodeJS.Timeout | undefined;
let value = 0;

const stopTimer = (): void => {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
};

const startBuild = (): void => {
	stopTimer();
	log.disposeChildren();
	value = 0;
	bar.setValue(0);
	status.setText(`building… notifications go out through ${protocolName}`);
	log.addChild(new Text(theme.fg("muted", "Compiling 128 modules…"), 1, 0));
	tui.requestRender();

	timer = setInterval(() => {
		value = Math.min(1, value + STEP);
		bar.setValue(value);
		tui.requestRender();
		if (value < 1) return;

		stopTimer();
		log.addChild(new Text(theme.fg("success", "Build finished. A terminal notification was sent."), 1, 0));
		status.setText(`done · ${protocolName} · press s to build again`);
		send("@cloud-pi/tui", "Build finished in 2.0s");
		tui.requestRender();
	}, TICK_MS);
};

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		stopTimer();
		tui.stop();
		process.exit(0);
	}
	if (data === "s") {
		startBuild();
		return { consume: true };
	}
	if (data === "n") {
		send("@cloud-pi/tui", "Test notification");
		status.setText(`test notification sent through ${protocolName}`);
		tui.requestRender();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
tui.addChild(log);
tui.addChild(bar);
tui.addChild(status);
tui.start();

startBuild();
