// cloud-pi client-tui: adapted copy of oh-my-pi packages/coding-agent/src/slash-commands/builtin-registry.ts
// (commit e325ffc73ab8; v18.18.7). Injected client specs in a registry factory; retained name/alias dispatch and generic completions; removed omp command groups, ACP adaptation, collaboration and plugin/session operations. Dispatch is synchronous for local client handlers.
// See ../../PATCHES.md for the migration scope.
import type { SlashCommand } from "@cloud-pi/tui";
import { buildArgumentCompletions, buildStaticInlineHint, buildSubcommandInlineHint } from "./builtin-completions";
import { parseSlashCommand } from "./helpers/parse";
import type { SlashCommandRuntime, SlashCommandSpec } from "./types";

/** Build one startup snapshot for both completion and execution. */
export function createBuiltinSlashCommandRegistry(commands: readonly SlashCommandSpec[]) {
	const lookup = new Map<string, SlashCommandSpec>();
	for (const command of commands) {
		lookup.set(command.name, command);
		for (const alias of command.aliases ?? []) lookup.set(alias, command);
	}

	function buildTuiBuiltinSlashCommands(): SlashCommand[] {
		return commands.map(command => {
			const materialized: SlashCommand = {
				name: command.name,
				aliases: command.aliases,
				description: command.description,
				allowArgs: command.allowArgs === true,
			};
			if (command.subcommands) {
				const options = { optional: command.subcommandOptional };
				materialized.getArgumentCompletions = buildArgumentCompletions(command.subcommands, options);
				materialized.getInlineHint = buildSubcommandInlineHint(command.subcommands, options);
			} else if (command.inlineHint) {
				materialized.getInlineHint = buildStaticInlineHint(command.inlineHint);
			}
			return materialized;
		});
	}

	/** False means ordinary input; true consumes it; a string replaces it. */
	function executeBuiltinSlashCommand(text: string, runtime: SlashCommandRuntime): string | boolean {
		// omp normalizes submitted text in its input controller before dispatch.
		const parsed = parseSlashCommand(text.trim());
		if (!parsed) return false;
		const command = lookup.get(parsed.name);
		if (!command || (parsed.args.length > 0 && !command.allowArgs)) return false;
		const result = command.handle(parsed, runtime);
		if (result && "prompt" in result) return result.prompt;
		return true;
	}

	return {
		buildTuiBuiltinSlashCommands,
		executeBuiltinSlashCommand,
		lookupBuiltinSlashCommand: (name: string) => lookup.get(name),
	};
}
