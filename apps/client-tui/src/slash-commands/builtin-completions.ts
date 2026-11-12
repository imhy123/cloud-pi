// cloud-pi client-tui: adapted copy of oh-my-pi packages/coding-agent/src/slash-commands/builtin-completions.ts
// (commit e325ffc73ab8; v18.18.7). Retained generic subcommand and static hint builders; removed model/MCP/path completers.
// See ../../PATCHES.md for the migration scope.
import type { AutocompleteItem } from "@cloud-pi/tui";
import type { SubcommandDef } from "./types";

/** Options shared by the declarative subcommand completers. */
interface SubcommandCompletionOptions {
	/** Mirrors `BuiltinSlashCommand.subcommandOptional`. */
	optional?: boolean;
}

/** Ghost text completing `prefix` to `sub`: its remaining name characters, then its usage. */
function subcommandRemainderHint(sub: SubcommandDef, prefix: string): string | undefined {
	const hint = sub.name.slice(prefix.length) + (sub.usage ? ` ${sub.usage}` : "");
	return hint || undefined;
}

/**
 * Build getArgumentCompletions from declarative subcommand definitions.
 * Returns subcommand names filtered by prefix in the dropdown; each item's
 * hint is the ghost text the editor shows while that item is selected.
 * An optional subcommand offers nothing until a prefix is typed, so Enter on
 * the bare `/name ` submits it instead of accepting the first subcommand.
 */
export function buildArgumentCompletions(
	subcommands: SubcommandDef[],
	options: SubcommandCompletionOptions = {},
): (prefix: string) => AutocompleteItem[] | null {
	return (argumentPrefix: string) => {
		if (argumentPrefix.includes(" ")) return null; // past the subcommand
		if (options.optional && argumentPrefix.length === 0) return null;
		const lower = argumentPrefix.toLowerCase();
		const matches = subcommands
			.filter(s => s.name.startsWith(lower))
			.map(s => ({
				value: `${s.name} `,
				label: s.name,
				description: s.description,
				hint: subcommandRemainderHint(s, lower),
			}));
		return matches.length > 0 ? matches : null;
	};
}

/**
 * Build getInlineHint from declarative subcommand definitions.
 * Shows remaining completion + usage as dim ghost text after cursor; an
 * optional subcommand advertises its choices before anything is typed, since
 * {@link buildArgumentCompletions} opens no dropdown there.
 */
export function buildSubcommandInlineHint(
	subcommands: SubcommandDef[],
	options: SubcommandCompletionOptions = {},
): (argumentText: string) => string | null {
	return (argumentText: string) => {
		const trimmed = argumentText.trimStart();
		const spaceIndex = trimmed.indexOf(" ");

		if (spaceIndex === -1) {
			// Still typing subcommand name — show remaining chars + usage
			const prefix = trimmed.toLowerCase();
			if (prefix.length === 0) {
				return options.optional ? `[${subcommands.map(s => s.name).join("|")}]` : null;
			}
			const match = subcommands.find(s => s.name.startsWith(prefix));
			return match ? (subcommandRemainderHint(match, prefix) ?? null) : null;
		}

		// Subcommand typed — show remaining usage params
		const subName = trimmed.slice(0, spaceIndex).toLowerCase();
		const afterSub = trimmed.slice(spaceIndex + 1);
		const sub = subcommands.find(s => s.name === subName);
		if (!sub?.usage) return null;

		if (afterSub.length > 0) {
			const usageParts = sub.usage.split(" ");
			const inputParts = afterSub.trim().split(/\s+/);
			const remaining = usageParts.slice(inputParts.length);
			return remaining.length > 0 ? remaining.join(" ") : null;
		}

		return sub.usage;
	};
}

/**
 * Build getInlineHint for commands with a simple static hint string.
 * Shows the hint only when no arguments have been typed yet.
 */
export function buildStaticInlineHint(hint: string): (argumentText: string) => string | null {
	return (argumentText: string) => (argumentText.trim().length === 0 ? hint : null);
}
