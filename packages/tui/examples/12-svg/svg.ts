import { FigureMarkdown, Markdown, ProcessTerminal, TUI, closeMediaWorkers, getMarkdownTheme } from "@cloud-pi/tui";

const tui = new TUI(new ProcessTerminal());
const source = [
	"# SVG figures",
	"SVG is rasterized in a worker and displayed through Kitty/iTerm2. Terminals without graphics show the source.",
	"```svg",
	'<svg viewBox="0 0 440 110"><rect width="440" height="110" rx="12" fill="var(--surface)"/><circle cx="55" cy="55" r="32" fill="var(--accent)"/><text x="105" y="64" font-size="24" fill="var(--fg)">SVG in a Node worker</text></svg>',
	"```",
	"Resize the terminal to redraw the SVG at the new pixel size. Press q or Ctrl+C to quit.",
].join("\n\n");
const document = new FigureMarkdown(source, {
	markdown: text => new Markdown(text, 1, 0, getMarkdownTheme()),
	budget: tui.imageBudget,
	onChange: () => tui.requestRender(),
});
tui.addChild(document);
tui.addInputListener(data => {
	if (data === "q" || data === "\x03") {
		tui.stop();
		document.dispose();
		closeMediaWorkers();
		return { consume: true };
	}
	return undefined;
});
tui.start();
