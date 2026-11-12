// cloud-pi client-tui: new file. Local commands and their startup-localized descriptions.
import type { ClientLocale } from "../i18n/locale";
import type { SlashCommandSpec } from "./types";

export function buildClientSlashCommands(t: ClientLocale["t"]): SlashCommandSpec[] {
	return [
		{
			name: "clear",
			description: t("commands.clear.description"),
			handle: (_command, runtime) => runtime.clearTranscript(),
		},
		{
			name: "quit",
			description: t("commands.quit.description"),
			handle: (_command, runtime) => runtime.quit(),
		},
	];
}
