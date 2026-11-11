import { Markdown, ProcessTerminal, TUI, closeMediaWorkers, getMarkdownTheme, matchesKey } from "@cloud-pi/tui";

const tui = new TUI(new ProcessTerminal());
const source = [
	"# Mermaid diagrams",
	"Layout runs in a worker. Markdown shows fenced code until the result arrives, then requests a repaint.",
	"```mermaid",
	"stateDiagram-v2",
	"direction LR",
	"Queued --> Rendering",
	"Rendering --> Ready",
	"```",
	"Resize the terminal to see the state diagram choose a fitting orientation. Press q or Ctrl+C to quit.",
].join("\n\n");
const markdown = new Markdown(source, 1, 0, getMarkdownTheme());
markdown.onChange = () => tui.requestRender();
tui.addChild(markdown);
tui.addInputListener(data => {
	if (data === "q" || matchesKey(data, "ctrl+c")) {
		tui.stop();
		markdown.dispose();
		closeMediaWorkers();
		process.exit(0);
	}
	return undefined;
});
tui.start();
