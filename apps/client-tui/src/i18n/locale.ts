// Locale selection for the client: the system's languages (LANGUAGE, LC_ALL,
// LC_MESSAGES, LANG, then the runtime's default) select the language at startup.
// Language changes take effect after restarting the client.
import {
	composeTranslations,
	createLanguage,
	type Language,
	type MessagesOf,
	type MessagesReport,
	resolveLocale,
	type Translator,
} from "@cloud-pi/common";

import { messages } from "@cloud-pi/common";

/** The client catalog's shape, as its first locale declared it. */
type ClientMessages = MessagesOf<typeof messages>;

/** Every locale the client ships, canonical (`en`, `zh-CN`). */
const offered = messages.translations.map(translation => translation.locale);

/** The composed catalogs; the client ships no contributions beyond its own. */
const translations = composeTranslations(messages.translations);

/** Rendering reports (`fallback`, `failed`, `unknown`), newest last; bounded, for debug surfaces. */
export const reports: MessagesReport[] = [];
const REPORT_LIMIT = 32;

/** The system's languages: `LANGUAGE` (a colon list), `LC_ALL`, `LC_MESSAGES`, `LANG`, then the runtime default. */
export function systemLocales(env: NodeJS.ProcessEnv = process.env): readonly string[] {
	const { LANGUAGE, LC_ALL, LC_MESSAGES, LANG } = env;
	const named = [...(LANGUAGE ?? "").split(":"), LC_ALL, LC_MESSAGES, LANG].flatMap(value => {
		// `de_DE.UTF-8` is `de-DE`; `C` and `POSIX` name no language.
		const tag = value?.replace(/[.@].*$/, "").replace(/_/g, "-");
		return tag === undefined || tag === "" || tag === "C" || tag === "POSIX" ? [] : [tag];
	});
	return [...new Set([...named, Intl.DateTimeFormat().resolvedOptions().locale])];
}

function report(entry: MessagesReport): void {
	reports.push(entry);
	if (reports.length > REPORT_LIMIT) reports.shift();
}

/** The client's language and translator, selected once at startup. */
export interface ClientLocale {
	readonly language: Language;
	readonly t: Translator<"client-tui", ClientMessages>;
}

export function createClientLocale(preferred?: string): ClientLocale {
	const language = createLanguage(resolveLocale(preferred ?? null, systemLocales(), offered), translations, report);
	return {
		language,
		t: messages.in(language),
	};
}
