// cloud-pi: new file. Validate and convert declarative settings metadata.
import { messages, type LocalizedText, type MessageData } from "@cloud-pi/common";
import inventory from "./settings.json" with { type: "json" };

export interface SettingDefinition {
	readonly id: string;
	readonly label: LocalizedText;
	readonly description: LocalizedText;
	readonly type: "select" | "mock";
	readonly configPath?: string;
	readonly defaultValue?: string;
	readonly options?: { readonly source: "static"; readonly items: readonly SettingOption[] }
		| { readonly source: "dynamic"; readonly provider: string };
}

export interface SettingOption {
	readonly value: string;
	readonly label: LocalizedText;
	readonly description?: LocalizedText;
}

export interface SettingOptionsContext {
	readonly item: SettingDefinition;
	readonly currentValue: string;
	readonly signal: AbortSignal;
}

export type SettingOptionsProvider = (context: SettingOptionsContext) =>
	readonly SettingOption[] | Promise<readonly SettingOption[]>;

export interface SettingsGroup {
	readonly id: string;
	readonly label: LocalizedText;
	readonly items: readonly SettingDefinition[];
}

export interface SettingsCategory {
	readonly id: string;
	readonly label: LocalizedText;
	readonly groups: readonly SettingsGroup[];
}

/** Validate the JSON catalog before exposing it to the presentation layer. */
export function buildSettingsDefinitions(): readonly SettingsCategory[] {
	const ids = new Set<string>();
	const catalog = messages.translations.find(item => item.locale === "en")!.messages;
	function unique(id: string): void {
		if (ids.has(id)) throw new Error(`Duplicate setting identifier: ${id}`);
		ids.add(id);
	}
	function text(value: { defaultText: string; messageKey?: string }): LocalizedText {
		const key = value.messageKey;
		if (!key) return { defaultText: value.defaultText };
		if (!Object.hasOwn(catalog, key)) {
			throw new Error(`Unknown settings message: ${key}`);
		}
		const message: MessageData = {
			namespace: messages.namespace,
			key,
			params: [],
		};
		return { defaultText: value.defaultText, message };
	}
	function option(value: {
		value: string;
		label: { defaultText: string; messageKey?: string };
		description?: { defaultText: string; messageKey?: string };
	}): SettingOption {
		return {
			value: value.value,
			label: text(value.label),
			description: value.description ? text(value.description) : undefined,
		};
	}
	return inventory.categories.map(category => {
		unique(`category:${category.id}`);
		return {
			id: category.id,
			label: text(category.label),
			groups: category.groups.map(group => {
				unique(`group:${category.id}:${group.id}`);
				return {
					id: group.id,
					label: text(group.label),
					items: group.settings.map(item => {
						unique(item.id);
						if (!["select", "mock"].includes(item.type)) {
							throw new Error(`Unknown setting type: ${item.type}`);
						}
						if ("options" in item && item.options && "items" in item.options) {
							const values = item.options.items.map(option => option.value);
							if (new Set(values).size !== values.length) throw new Error(`Duplicate option value: ${item.id}`);
							if ("defaultValue" in item && item.defaultValue && !values.includes(item.defaultValue)) throw new Error(`Invalid default value: ${item.id}`);
						}
						return {
							id: item.id,
							type: item.type as SettingDefinition["type"],
							configPath: "configPath" in item ? item.configPath : undefined,
							defaultValue: "defaultValue" in item ? item.defaultValue : undefined,
							options: "options" in item && item.options
								? "items" in item.options
									? { source: "static" as const, items: item.options.items.map(option) }
									: { source: "dynamic" as const, provider: item.options.provider }
								: undefined,
							label: text(item.label),
							description: text(item.description),
						};
					}),
				};
			}),
		};
	});
}
