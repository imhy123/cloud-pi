import { describe, expect, it, vi } from "vitest";
import { Box } from "../src/components/box";
import { Editor, type EditorTheme } from "../src/components/editor";
import { ProgressBar } from "../src/components/progress-bar";
import { SettingsList, type SettingsListTheme } from "../src/components/settings-list";
import { renderSparkline } from "../src/components/sparkline";
import { Table } from "../src/components/table";
import { Text } from "../src/components/text";
import { getSymbolTheme } from "../src/theme/tui-adapters";
import { visibleWidth } from "../src/utils";

describe("Text", () => {
	it("wraps, pads horizontally, and surrounds content with vertical padding", () => {
		const text = new Text("hello", 1, 1);
		const lines = text.render(10);
		expect(lines).toEqual(["          ", " hello    ", "          "]);
		for (const line of lines) expect(visibleWidth(line)).toBe(10);
	});

	it("hard-wraps long content at the content width", () => {
		const lines = new Text("abcdefghij", 0, 0).render(4);
		expect(lines).toEqual(["abcd", "efgh", "ij  "]);
	});

	it("renders nothing when the text is empty or blank", () => {
		expect(new Text("", 0, 0).render(10)).toEqual([]);
		expect(new Text("   \n ", 0, 0).render(10)).toEqual([]);
	});

	it("returns the cached row array until the text changes", () => {
		const text = new Text("hello", 0, 0);
		const first = text.render(20);
		expect(text.render(20)).toBe(first);

		expect(text.setText("world")).toBe(true);
		const second = text.render(20);
		expect(second).not.toBe(first);
		expect(second[0]?.trim()).toBe("world");
		expect(text.setText("world")).toBe(false);
	});
});

describe("Box", () => {
	it("draws a border sized to the requested width and pads the interior", () => {
		const box = new Box(0, 0, undefined, {
			chars: { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" },
		});
		box.addChild(new Text("hi", 0, 0));
		expect(box.render(6)).toEqual(["┌────┐", "│hi  │", "└────┘"]);
	});

	it("applies horizontal padding inside the border", () => {
		const box = new Box(1, 0, undefined, {
			chars: { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" },
		});
		box.addChild(new Text("x", 0, 0));
		expect(box.render(6)).toEqual(["+----+", "| x  |", "+----+"]);
	});

	it("drops the border when the interior cannot hold padding and content", () => {
		const box = new Box(2, 0, undefined, {
			chars: { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" },
		});
		box.addChild(new Text("x", 0, 0));
		const lines = box.render(4);
		expect(lines).toHaveLength(1);
		expect(lines[0]?.startsWith("+")).toBe(false);
	});
});

describe("ProgressBar", () => {
	const style = { filled: "#", empty: "-" };

	it("renders the filled fraction plus a percentage label within the width", () => {
		const bar = new ProgressBar(0.5, { style, showPercentage: true });
		const line = bar.render(10)[0];
		expect(line).toBe("###--- 50%");
		expect(visibleWidth(line!)).toBe(10);
	});

	it("renders an indeterminate row when no value is supplied", () => {
		const bar = new ProgressBar(undefined, { style, maxWidth: 4 });
		expect(bar.render(4)[0]).toBe("----");
	});

	it("invalidate drops the memoized rows", () => {
		const bar = new ProgressBar(0.25, { style });
		const first = bar.render(4);
		expect(bar.render(4)).toBe(first);
		bar.invalidate();
		expect(bar.render(4)).not.toBe(first);
	});
});

describe("Table", () => {
	const columns = [
		{ width: 4, align: "left" as const, overflow: "truncate" as const },
		{ width: 4, align: "right" as const, overflow: "truncate" as const },
	];

	it("aligns cells to their column widths", () => {
		const table = new Table([[{ text: "ab" }, { text: "1" }]], columns);
		expect(table.render(9)).toEqual(["ab      1"]);
	});

	it("truncates overflowing cells to the column width", () => {
		const table = new Table([[{ text: "abcdef" }, { text: "123456" }]], columns);
		const row = table.render(9)[0]!;
		expect(visibleWidth(row)).toBe(9);
		expect(row).toContain("…");
	});
});

describe("renderSparkline", () => {
	it("maps values across the domain onto block glyphs", () => {
		expect(renderSparkline([0, 4, 8], { min: 0, max: 8 })).toBe("▁▅█");
		expect(renderSparkline([1, undefined, 8], { min: 0, max: 8 })).toBe("▂ █");
	});
});

function plainEditorTheme(): EditorTheme {
	const style = (text: string) => text;
	const symbols = getSymbolTheme();
	return {
		borderColor: style,
		symbols,
		selectList: {
			selectedPrefix: style,
			selectedText: style,
			description: style,
			scrollInfo: style,
			noMatch: style,
			symbols,
			icon: style,
			hovered: style,
		},
	};
}

describe("Editor", () => {
	it("places the caret at the start of multi-row text when asked", () => {
		const editor = new Editor(plainEditorTheme());
		editor.setText("first\nsecond", { cursor: "start" });
		expect(editor.getText()).toBe("first\nsecond");
		expect(editor.getCursor()).toEqual({ line: 0, col: 0 });

		editor.setText("first\nsecond");
		expect(editor.getCursor()).toEqual({ line: 1, col: 6 });
	});

	it("keeps single-row text careted at the end even with cursor start", () => {
		const editor = new Editor(plainEditorTheme());
		editor.setText("one line", { cursor: "start" });
		expect(editor.getCursor()).toEqual({ line: 0, col: 8 });
	});

	it("refreshes a model mention from the synchronous hook when a colon extends the token", async () => {
		const editor = new Editor(plainEditorTheme());
		const prefixes: string[] = [];
		editor.setAutocompleteProvider({
			async getSuggestions(lines, line, col) {
				const text = lines[line]!.slice(0, col);
				return text.startsWith("^") ? { items: [{ value: "^gpt", label: "^gpt" }], prefix: text } : null;
			},
			applyCompletion: lines => ({ lines, cursorLine: 0, cursorCol: 0 }),
			trySyncModelMentionCompletion(lines, line, col) {
				const text = lines[line]!.slice(0, col);
				prefixes.push(text);
				return text.startsWith("^gpt:")
					? {
							kind: "matched",
							suggestions: { items: [{ value: "^gpt:high", label: "^gpt:high" }], prefix: "^gpt:" },
						}
					: { kind: "unhandled" };
			},
		});

		editor.handleInput("^");
		editor.handleInput("g");
		await vi.waitFor(() => expect(editor.isAutocompleteActive()).toBe(true));
		editor.handleInput("p");
		editor.handleInput("t");
		editor.handleInput(":");

		expect(prefixes.at(-1)).toBe("^gpt:");
		expect(editor.isAutocompleteActive()).toBe(true);
		expect(editor.render(40).join("\n")).toContain("^gpt:high");
	});
});

describe("SettingsList", () => {
	const theme: SettingsListTheme = {
		label: text => text,
		value: text => text,
		description: text => text,
		cursor: "> ",
		hint: text => text,
	};

	it("opens a cycling row's menu, applies the pick, and keeps Enter cycling", () => {
		const changes: Array<[string, string]> = [];
		let seeded: string | undefined;
		let done: ((value?: string) => void) | undefined;
		const list = new SettingsList(
			[
				{
					id: "effort",
					label: "Effort",
					currentValue: "low",
					values: ["low", "high"],
					menu: (current, close) => {
						seeded = current;
						done = close;
						return { render: () => [] };
					},
				},
			],
			5,
			theme,
			(id, value) => changes.push([id, value]),
			() => {},
		);

		expect(list.openSubmenuFor("effort")).toBeDefined();
		expect(seeded).toBe("low");
		expect(list.openSubmenu?.id).toBe("effort");

		done?.("high");
		expect(changes).toEqual([["effort", "high"]]);
		expect(list.openSubmenu).toBeUndefined();
		expect(list.getSelectedItem()?.currentValue).toBe("high");

		list.handleInput("\n");
		expect(changes.at(-1)).toEqual(["effort", "low"]);
	});
});
