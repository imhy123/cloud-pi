import { initTheme, Input, TUI, ProcessTerminal, Text, matchesKey, type SelectItem, SelectList, getSelectListTheme } from "@cloud-pi/tui";


await initTheme();

const COMMANDS: SelectItem[] = [
	{ value: "new", label: "New session", description: "Start a fresh conversation" },
	{ value: "resume", label: "Resume session", description: "Reopen an earlier conversation" },
	{ value: "model", label: "Change model", description: "Pick a different model" },
	{ value: "theme", label: "Change theme", description: "Switch dark / light" },
	{ value: "quit", label: "Quit", description: "Exit @cloud-pi/tui" },
];

class FilterInput extends Input {
  onChange?: (value: string) => void;

  override handleInput(data: string): boolean {
    const handled = super.handleInput(data);
    this.onChange?.(this.getValue());
    return handled;
  }
}


const tui = new TUI(new ProcessTerminal(), true);
const header = new Text("@cloud-pi/tui / 03-list", 1, 1);
const filter = new FilterInput();
const status = new Text("", 1, 0);

filter.prompt = "filter:";

const list = new SelectList(COMMANDS, 6, getSelectListTheme(), {
  search: "never",
  emptyText: "No commands",
  noMatchText: "No matches",
});

const applyFilter = (query: string): void => {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? COMMANDS.filter(item => `${item.label} ${item.description ?? ""}`.toLowerCase().includes(needle))
    : COMMANDS;

  list.setItems(visible);
  status.setText(`${visible.length} / ${COMMANDS.length} command(s)`);
  tui.requestRender();
};

filter.onChange = applyFilter;
filter.onEscape = () => {
	filter.setValue("");
	applyFilter("");
};

// Enter in the input hands focus to the list; Esc in the list hands it back.
filter.onSubmit = () => {
	tui.setFocus(list);
	tui.requestRender();
};
list.onCancel = () => {
	tui.setFocus(filter);
	tui.requestRender();
};

list.onSelectionChange = item => {
	status.setText(`Focused: ${item.label}`);
	tui.requestRender();
};
list.onSelect = item => {
	status.setText(`Selected: ${item.label} (${item.value})`);
	tui.setFocus(filter);
	tui.requestRender();
};

// TUI only sends keys to the focused component, so Tab must be intercepted in
// an application-level listener.
let focusOnList = false;
tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	if (matchesKey(data, "tab")) {
		focusOnList = !focusOnList;
		tui.setFocus(focusOnList ? list : filter);
		tui.requestRender();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(header);
tui.addChild(filter);
tui.addChild(list);
tui.addChild(status);
tui.setFocus(filter);
tui.start();
