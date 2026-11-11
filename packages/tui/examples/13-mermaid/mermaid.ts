import { Markdown, ProcessTerminal, TUI, closeMediaWorkers, getMarkdownTheme } from "@cloud-pi/tui";

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
	if (data === "q" || data === "\x03") {
		tui.stop();
		markdown.dispose();
		closeMediaWorkers();
		return { consume: true };
	}
	return undefined;
});
tui.start();
