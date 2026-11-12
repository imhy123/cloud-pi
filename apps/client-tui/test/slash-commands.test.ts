import assert from "node:assert/strict";
import { test } from "node:test";
import { CombinedAutocompleteProvider, Container, Text } from "@cloud-pi/tui";
import { composeTranslations, createLanguage } from "@cloud-pi/i18n";
import { messages } from "../src/i18n/messages";
import { buildClientSlashCommands } from "../src/slash-commands/builtin-client";
import { createBuiltinSlashCommandRegistry } from "../src/slash-commands/builtin-registry";
import { parseSlashCommand, parseSubcommand } from "../src/slash-commands/helpers/parse";
import type { SlashCommandRuntime } from "../src/slash-commands/types";

function registry(locale = "en") {
	const language = createLanguage(locale, composeTranslations(messages.translations), () => {});
	return createBuiltinSlashCommandRegistry(buildClientSlashCommands(messages.in(language)));
}

test("parses the upstream whitespace/colon syntax and subcommands", () => {
	assert.equal(parseSlashCommand("hello"), null);
	assert.equal(parseSlashCommand("/"), null);
	assert.deepEqual(parseSlashCommand("/clear"), { name: "clear", args: "", text: "/clear" });
	for (const text of ["/example:one two", "/example\tone two"]) {
		assert.deepEqual(parseSlashCommand(text), { name: "example", args: "one two", text });
	}
	assert.deepEqual(parseSubcommand("  LIST\t remaining text "), { verb: "list", rest: "remaining text" });
});

test("clear only detaches transcript entries and quit invokes the host exit operation", () => {
	const root = new Container();
	const welcome = new Container();
	const transcript = new Container();
	const editor = new Container();
	root.addChild(welcome); root.addChild(transcript); root.addChild(editor);
	transcript.addChild(new Text("first")); transcript.addChild(new Text("second"));
	let renders = 0, exits = 0;
	const runtime: SlashCommandRuntime = {
		clearTranscript() { transcript.clear(); renders++; },
		quit() { exits++; },
	};
	const commands = registry();
	assert.equal(commands.executeBuiltinSlashCommand("  /clear \n", runtime), true);
	assert.equal(transcript.children.length, 0);
	assert.deepEqual(root.children, [welcome, transcript, editor]);
	assert.equal(renders, 1);
	assert.equal(exits, 0);
	assert.equal(commands.executeBuiltinSlashCommand("/quit", runtime), true);
	assert.equal(exits, 1);
	for (const text of ["hello", "/", "/unknown", "/language", "/clear extra", "/quit:extra", "/CLEAR"]) {
		assert.equal(commands.executeBuiltinSlashCommand(text, runtime), false, text);
	}
	assert.equal(renders, 1);
	assert.equal(exits, 1);
});

test("localizes descriptions and description search while keeping insertion values English", () => {
	for (const locale of ["en", "zh-CN"]) {
		const commands = registry(locale);
		const provider = new CombinedAutocompleteProvider(commands.buildTuiBuiltinSlashCommands());
		const all = provider.trySyncSlashCompletion("/")!;
		assert.deepEqual(all.items.map(item => item.value).sort(), ["clear", "quit"]);
		const quit = all.items.find(item => item.value === "quit")!;
		assert.equal(quit.description, locale === "en" ? "Exit Cloud-Pi" : "退出 Cloud-Pi");
		assert.equal(provider.trySyncSlashCompletion("/cl")!.items[0].value, "clear");
		assert.equal(provider.trySyncSlashCompletion(locale === "en" ? "/Exit" : "/退出")!.items[0].value, "quit");
		const applied = provider.applyCompletion(["/cl"], 0, 3, all.items.find(item => item.value === "clear")!, "/cl");
		assert.equal(applied.lines[0].trimEnd(), "/clear");
	}
});

test("dispatches aliases and preserves generic argument completions, optional hints and prompt results", () => {
	const commands = createBuiltinSlashCommandRegistry([
		{
			name: "example", aliases: ["ex"], description: "Example", allowArgs: true,
			subcommands: [{ name: "list", description: "List entries", usage: "<name>" }],
			subcommandOptional: true,
			handle: command => ({ prompt: command.args }),
		},
		{ name: "static", description: "Static", inlineHint: "<value>", handle() {} },
	]);
	const runtime: SlashCommandRuntime = { clearTranscript() {}, quit() {} };
	assert.equal(commands.lookupBuiltinSlashCommand("ex"), commands.lookupBuiltinSlashCommand("example"));
	assert.equal(commands.executeBuiltinSlashCommand("/ex:list", runtime), "list");
	const [example, plain] = commands.buildTuiBuiltinSlashCommands();
	assert.equal(example!.getArgumentCompletions!(""), null);
	const items = example!.getArgumentCompletions!("li");
	assert.deepEqual(items, [{ value: "list ", label: "list", description: "List entries", hint: "st <name>" }]);
	assert.equal(example!.getInlineHint!("li"), "st <name>");
	assert.equal(example!.getInlineHint!("list "), "<name>");
	assert.equal(plain!.getInlineHint!(""), "<value>");
	assert.equal(plain!.getInlineHint!("typed"), null);
});
