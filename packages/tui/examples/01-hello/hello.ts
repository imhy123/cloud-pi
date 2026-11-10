import {
  Container,
	Editor,
	getEditorTheme,
	initTheme,
	matchesKey,
	ProcessTerminal,
	Text,
	TUI,
} from "@cloud-pi/tui";

await initTheme();

// Second argument: draw the caret with the terminal's hardware cursor instead of
// printing a cursor glyph into the frame, which would stay in scrollback on exit.
const tui = new TUI(new ProcessTerminal(), true);
const transcript = new Container();
const editor = new Editor(getEditorTheme());

tui.addChild(new Text("Welcome to @cloud-pi/tui!", 1, 1));
tui.addChild(transcript);
tui.addChild(editor);
tui.setFocus(editor);

editor.setBorderStyle("claude");
editor.onSubmit = text => {
	transcript.addChild(new Text(`You said: ${text}`, 1, 0));
	tui.requestRender();
};


tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	return undefined;
});

tui.start();
