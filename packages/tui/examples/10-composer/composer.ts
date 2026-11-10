import {
	BUILTIN_EDITOR_BORDER_STYLES,
	claudeComposerStyle,
	Container,
	Editor,
	getEditorTheme,
	getSelectListTheme,
	initTheme,
	matchesKey,
	ProcessTerminal,
	registerComposerStyle,
	SelectList,
	type SelectItem,
	Text,
	TUI,
	theme,
	visibleWidth,
} from "@cloud-pi/tui";

await initTheme();

// An extension style keeps the claude rules but stays on the editor's normal
// foreground instead of a filled surface. Built-in ids cannot be replaced, so a
// variant needs its own id and a one-time registration.
const disposeVariant = registerComposerStyle({
	...claudeComposerStyle,
	id: "claude-soft",
	filledSurface: false,
});

const STYLES: readonly string[] = [...BUILTIN_EDITOR_BORDER_STYLES, "claude-soft"];

const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 10-composer", 1, 1);
const hint = new Text("Type then Enter to submit · Tab moves focus · Ctrl+B toggles the border · Ctrl+C quits", 1, 0);
const transcript = new Container();
const status = new Text("", 1, 1);

hint.setStyleFn(text => theme.fg("dim", text));
status.setStyleFn(text => theme.fg("muted", text));

const editor = new Editor(getEditorTheme());
const items: SelectItem[] = STYLES.map(id => ({
	value: id,
	label: id,
	description: id === "claude-soft" ? "registered extension variant" : "built-in composer style",
}));
const list = new SelectList(items, 5, getSelectListTheme(), {
	search: "never",
	emptyText: "No styles",
	noMatchText: "No matches",
});

let currentStyle = "box";
let borderVisible = true;
let listFocused = false;

const updateStatus = (): void => {
	status.setText(
		`style: ${currentStyle} · border: ${borderVisible ? "on" : "off"} · focus: ${listFocused ? "list" : "editor"}`,
	);
};

const applyStyle = (id: string): void => {
	if (currentStyle !== id) {
		currentStyle = id;
		editor.setBorderStyle(id);
		editor.invalidate();
	}
	updateStatus();
	tui.requestRender();
};

// The provider runs once per painted editor frame. It docks a status chip on the
// claude top rule and returns nothing for the other shapes, so switching styles
// never needs a separate code path.
editor.setTopBorderProvider(availableWidth => {
	if (!currentStyle.startsWith("claude")) return undefined;
	const chip = theme.bg("selectedBg", theme.fg("text", ` ${currentStyle} `));
	const width = visibleWidth(chip);
	return width <= availableWidth ? { content: chip, width } : undefined;
});

editor.onSubmit = text => {
	transcript.addChild(new Text(`You said: ${text}`, 1, 0));
	tui.requestRender();
};

list.onSelectionChange = item => applyStyle(item.value);
list.onSelect = item => {
	applyStyle(item.value);
	listFocused = false;
	tui.setFocus(editor);
	updateStatus();
	tui.requestRender();
};
list.onCancel = () => {
	listFocused = false;
	tui.setFocus(editor);
	updateStatus();
	tui.requestRender();
};

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		disposeVariant();
		tui.stop();
		process.exit(0);
	}
	if (matchesKey(data, "ctrl+b")) {
		borderVisible = !borderVisible;
		editor.setBorderVisible(borderVisible);
		editor.invalidate();
		updateStatus();
		tui.requestRender();
		return { consume: true };
	}
	// The editor owns Tab for indentation, so focus switching happens before the
	// key reaches it.
	if (matchesKey(data, "tab")) {
		listFocused = !listFocused;
		tui.setFocus(listFocused ? list : editor);
		updateStatus();
		tui.requestRender();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(hint);
tui.addChild(list);
tui.addChild(transcript);
tui.addChild(editor);
tui.addChild(status);

editor.setBorderStyle(currentStyle);
tui.setFocus(editor);
updateStatus();
tui.start();
