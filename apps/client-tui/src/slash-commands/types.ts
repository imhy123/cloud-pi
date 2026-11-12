// cloud-pi client-tui: adapted copy of oh-my-pi packages/coding-agent/src/slash-commands/types.ts
// (commit e325ffc73ab8; v18.18.7). Retained command metadata and results; replaced omp session/ACP/TUI runtimes with client operations; omitted icons and live descriptions.
// See ../../PATCHES.md for the migration scope.

/** Declarative subcommand definition for commands with argument completion. */
export interface SubcommandDef {
	name: string;
	description: string;
	/** Usage hint shown as dim ghost text. */
	usage?: string;
}

/** Declarative builtin metadata shared by completion and dispatch. */
export interface BuiltinSlashCommand {
	name: string;
	aliases?: string[];
	description: string;
	allowArgs?: boolean;
	subcommands?: SubcommandDef[];
	/** The bare command is complete; suggest optional subcommands only after a prefix. */
	subcommandOptional?: boolean;
	inlineHint?: string;
}

/** Parsed slash-command text after stripping the leading "/". */
export interface ParsedSlashCommand {
	name: string;
	args: string;
	text: string;
}

/** Undefined consumes the input; a prompt result replaces the submitted text. */
export type SlashCommandResult = undefined | { consumed: true } | { prompt: string };

/** Operations owned by the client; commands have no dependency on a server session. */
export interface SlashCommandRuntime {
	clearTranscript(): void;
	quit(): void;
}

export interface SlashCommandSpec extends BuiltinSlashCommand {
	handle: (command: ParsedSlashCommand, runtime: SlashCommandRuntime) => SlashCommandResult | void;
}
