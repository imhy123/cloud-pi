import { getMarkdownTheme, initTheme, Markdown, matchesKey, ProcessTerminal, ScrollView, Text, TUI, theme } from "@cloud-pi/tui";
import { setHighlighter } from "@cloud-pi/tui/theme";

// Highlighting is off until the host installs an engine. This tiny regex-based
// tokenizer only understands TypeScript, which is enough for the fenced block below.
const TOKEN =
	/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|of|in|new|async|await|import|from|export|type|interface|class|extends|implements|true|false|null|undefined|this)\b|\b(\d+(?:\.\d+)?)\b/g;

setHighlighter({
	supportsLanguage: lang => lang === "ts",
	highlightCode: (code, _lang, colors) =>
		code.replace(TOKEN, (match, comment, string, keyword, number) => {
			const color = comment ? colors.comment : string ? colors.string : keyword ? colors.keyword : colors.number;
			return `${color}${match}\x1b[0m`;
		}),
});

await initTheme();

const SOURCE = [
	"# Streaming markdown",
	"",
	"The transcript grows character by character, and the **markdown renderer**",
	"re-parses the partial source on every tick.",
	"",
	"```ts",
	"interface Greeting {",
	"  readonly name: string;",
	"}",
	"",
	"function greet(input: Greeting): string {",
	"  // build the greeting",
	"  return `Hello, ${input.name}!`;",
	"}",
	"",
	"const total = 40 + 2;",
	"```",
	"",
	"> Tip: press `s` to finish immediately or `r` to stream again.",
].join("\n");

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 06-markdown", 1, 1);
const hint = new Text("r restart · s finish · Ctrl+C quits", 1, 0);
const status = new Text("", 1, 1);
const markdown = new Markdown("", 1, 0, getMarkdownTheme());
markdown.onChange = () => tui.requestRender();

hint.setStyleFn(text => theme.fg("dim", text));
status.setStyleFn(text => theme.fg("muted", text));

const view = new ScrollView(markdown, { height: 14, scrollbar: "auto", followTail: true });

let shown = 0;
let timer: NodeJS.Timeout | undefined;

const stopTimer = (): void => {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
};

const updateStatus = (): void => {
	const state = shown >= SOURCE.length ? "complete" : timer ? "streaming" : "paused";
	status.setText(`${shown} / ${SOURCE.length} chars · ${state}`);
};

const push = (next: number): void => {
	shown = Math.min(SOURCE.length, next);
	markdown.setText(SOURCE.slice(0, shown));
	updateStatus();
	tui.requestRender();
};

const start = (): void => {
	stopTimer();
	shown = 0;
	markdown.setText("");
	timer = setInterval(() => {
		const step = 4 + Math.floor(Math.random() * 8);
		push(shown + step);
		if (shown >= SOURCE.length) {
			stopTimer();
			updateStatus();
		}
	}, 40);
	updateStatus();
	tui.requestRender();
};

const finish = (): void => {
	stopTimer();
	push(SOURCE.length);
};

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		stopTimer();
		tui.stop();
		process.exit(0);
	}
	if (data === "r") {
		start();
		return { consume: true };
	}
	if (data === "s") {
		finish();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
tui.addChild(view);
tui.addChild(status);
tui.start();

start();
