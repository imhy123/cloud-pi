// cloud-pi: new file. Host-specific configuration bindings and option providers.
import { getAvailableThemes, setAutoThemeMapping } from "@cloud-pi/tui";
import type { Language } from "@cloud-pi/common";
import type { ClientSettings } from "./store";
import type { SettingOptionsProvider } from "./definitions";

export interface SettingBinding {
	read(): string | undefined;
	write(value: string): Promise<void>;
	readonly restart?: boolean;
}

export function createSettingsBindings(settings: ClientSettings, language: Language): Record<string, SettingBinding> {
	return {
		"client-tui.language": {
			read: () => settings.language ?? (language.locale === "zh-CN" ? "zh-CN" : "en"),
			write: value => settings.setLanguage(value as "en" | "zh-CN"),
			restart: true,
		},
		...Object.fromEntries((["dark", "light"] as const).map(mode => [
			`client-tui.theme.${mode}`,
			{
				read: () => mode === "dark" ? settings.darkTheme : settings.lightTheme,
				async write(value: string) {
					await settings.setTheme(mode, value);
					setAutoThemeMapping(mode, value);
				},
			},
		])),
	};
}

export const settingsOptionsProviders: Record<string, SettingOptionsProvider> = {
	async themes({ signal }) {
		const names = await getAvailableThemes();
		signal.throwIfAborted();
		return names.map(value => ({ value, label: { defaultText: value } }));
	},
};
