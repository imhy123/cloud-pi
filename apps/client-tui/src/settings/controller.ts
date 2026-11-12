// cloud-pi: new file. Connect settings metadata to host bindings and localization.
import {
	LocalizedError,
	messages,
	type Language,
	type LocalizedText,
} from "@cloud-pi/common";
import type { ClientSettings } from "./store";
import { buildSettingsDefinitions, type SettingDefinition, type SettingsCategory, type SettingOption, type SettingOptionsProvider } from "./definitions";

import { createSettingsBindings, settingsOptionsProviders, type SettingBinding } from "./bindings";

/** Connect settings definitions to persistent state and theme behavior. */
export class SettingsController {
	readonly categories: readonly SettingsCategory[] = buildSettingsDefinitions();
	readonly t: ReturnType<typeof messages.in>;
	readonly #bindings: Record<string, SettingBinding>;
	readonly #providers: Record<string, SettingOptionsProvider>;
	readonly #choices = new Map<string, readonly SettingOption[]>();

	constructor(
		private readonly settings: ClientSettings,
		private readonly language: Language,
		bindings?: Record<string, SettingBinding>,
		providers?: Record<string, SettingOptionsProvider>,
	) {
		this.t = messages.in(language);
		this.#bindings = bindings ?? createSettingsBindings(settings, language);
		this.#providers = providers ?? settingsOptionsProviders;
		for (const item of this.categories.flatMap(category => category.groups).flatMap(group => group.items)) {
			if (item.type === "mock") continue;
			if (!item.configPath || !this.#bindings[item.configPath]) throw new Error(`Missing setting binding: ${item.id}`);
			if (item.options?.source === "dynamic" && !this.#providers[item.options.provider]) throw new Error(`Missing options provider: ${item.id}`);
		}
	}

	localize(text: LocalizedText): string {
		if (!text.message) {
			return text.defaultText;
		}
		const translator = text.message.namespace === messages.namespace
			? messages.in(this.language)
			: undefined;
		if (!translator) {
			return text.defaultText;
		}
		const rendered = translator.render(text.message);
		return rendered === text.message.key ? text.defaultText : rendered;
	}

	errorText(error: unknown): string {
		if (error instanceof LocalizedError) {
			if (error.messageData.namespace !== messages.namespace) {
				return error.message;
			}
			const translated = messages.in(this.language).render(error.messageData);
			return translated === error.messageData.key ? error.message : translated;
		}
		return messages.in(this.language)("settings.error.saveFailed");
	}

	get loadError(): string | undefined {
		return this.settings.error ? this.t("settings.loadError", this.errorText(this.settings.error)) : undefined;
	}

	value(item: SettingDefinition): string {
		return item.configPath ? this.#bindings[item.configPath]?.read() ?? item.defaultValue ?? "" : "mock";
	}

	displayValue(item: SettingDefinition): string {
		const value = this.value(item);
		const options = item.options?.source === "static" ? item.options.items : this.#choices.get(item.id);
		const option = options?.find(option => option.value === value);
		return option ? this.localize(option.label) : value;
	}

	async choices(item: SettingDefinition, signal: AbortSignal): Promise<readonly SettingOption[]> {
		let options: readonly SettingOption[];
		try {
			options = item.options?.source === "static"
			? item.options.items
			: item.options?.source === "dynamic"
				? await this.#providers[item.options.provider]!({ item, currentValue: this.value(item), signal })
				: [];
		} catch (error) {
			if (signal.aborted) throw error;
			throw new LocalizedError("Could not load setting options", messages.message("settings.error.optionsFailed"), { cause: error });
		}
		signal.throwIfAborted();
		const values = new Set<string>();
		for (const option of options) {
			if (values.has(option.value)) throw new Error(`Duplicate option value: ${option.value}`);
			values.add(option.value);
		}
		this.#choices.set(item.id, options);
		return options;
	}

	async save(item: SettingDefinition, value: string): Promise<string> {
		if (item.type === "mock") return this.t("settings.mock");
		const options = item.options?.source === "static" ? item.options.items : this.#choices.get(item.id);
		if (!options?.some(option => option.value === value)) throw new Error("Invalid setting option");
		const binding = this.#bindings[item.configPath!]!;
		await binding.write(value);
		return this.t(binding.restart ? "settings.restart" : "settings.saved");
	}
}
