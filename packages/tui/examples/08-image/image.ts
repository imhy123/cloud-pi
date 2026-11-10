import {
	getImageDimensions,
	Image,
	ImageProtocol,
	initTheme,
	matchesKey,
	ProcessTerminal,
	TERMINAL,
	Text,
	TUI,
	theme,
} from "@cloud-pi/tui";

await initTheme();

// Three 16x16 PNGs. Reusing the same bytes would work too; distinct pixels make
// it obvious which image is live and which ones fell back to text.
const SAMPLES = [
	{
		filename: "blocks.png",
		base64:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAANUlEQVR42mP44X8GjiYnfYEjhttP4EhGwQCOGAahBmIUIRs6GDUQowjF0EGogShFSIYOQg0AyRaJ0DzHSAUAAAAASUVORK5CYII=",
	},
	{
		filename: "checker.png",
		base64:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR4nGNwOLICjsScbOAIlzjDINRAjCJk8cGoYRAG60iMBwDV2CAQYb7oawAAAABJRU5ErkJggg==",
	},
	{
		filename: "stripes.png",
		base64:
			"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKUlEQVR4nGN4t8qBJMQwCDVcKzEiCQ1GDdO81EhCg1GDh5YMSWgQagAAevU6EAV2hRAAAAAASUVORK5CYII=",
	},
];

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 08-image", 1, 1);
const hint = new Text("0-3 set the live-image budget · 0 disables graphics · Ctrl+C quits", 1, 0);
const info = new Text("", 1, 0);
const status = new Text("", 1, 1);

hint.setStyleFn(text => theme.fg("dim", text));
info.setStyleFn(text => theme.fg("muted", text));
status.setStyleFn(text => theme.fg("muted", text));

// Must be the TUI's own budget: it drains the image transmit queue each frame.
// Start with every sample live; the number keys lower the cap to show demotion.
const budget = tui.imageBudget;
tui.setMaxInlineImages(SAMPLES.length);
const imageTheme = { fallbackColor: (text: string) => theme.fg("muted", text) };

const dimensions = getImageDimensions(SAMPLES[0].base64, "image/png");
const protocolName =
	TERMINAL.imageProtocol === ImageProtocol.Kitty
		? "kitty"
		: TERMINAL.imageProtocol === ImageProtocol.Iterm2
			? "iTerm2"
			: "none (text fallback only)";

const updateStatus = (): void => {
	status.setText(`budget cap: ${budget.cap} · protocol: ${protocolName}`);
	tui.requestRender();
};

tui.addChild(header);
tui.addChild(hint);
tui.addChild(
	new Text(
		dimensions
			? `${dimensions.widthPx}x${dimensions.heightPx} px · newest images stay live up to the cap`
			: "pixel size unknown",
		1,
		0,
	),
);
for (const sample of SAMPLES) {
	const label = new Text(sample.filename, 1, 0);
	label.setStyleFn(text => theme.fg("accent", text));
	tui.addChild(label);
	tui.addChild(
		new Image(sample.base64, "image/png", imageTheme, {
			maxWidthCells: 12,
			maxHeightCells: 4,
			filename: sample.filename,
			imageKey: sample.filename,
			budget,
		}),
	);
}
tui.addChild(info);
tui.addChild(status);

info.setText("Anything over the cap renders as [Image: name [mime] WxH] instead of a graphic.");

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	if (data.length === 1 && data >= "0" && data <= "3") {
		tui.setMaxInlineImages(Number(data));
		updateStatus();
		return { consume: true };
	}
	return undefined;
});

tui.start();
updateStatus();
