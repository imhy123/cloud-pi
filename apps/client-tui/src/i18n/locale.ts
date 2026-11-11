// Locale selection for the client: the system's languages (LANGUAGE, LC_ALL,
// LC_MESSAGES, LANG, then the runtime's default) pick the initial language; the
// store swaps the catalog and re-renders subscribers when a setting changes it.
import {
	composeTranslations,
	createLanguage,
	type Language,
	type MessagesOf,
	type MessagesReport,
	resolveLocale,
	type Translator,
} from "@cloud-pi/i18n";

import { messages } from "./messages";

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

/** The client's current language and its messages; `onChange` fires after a switch. */
export interface LanguageStore {
	readonly language: Language;
	/** The client catalog in the current language; read it at render time, never cache its output. */
	readonly t: Translator<"client-tui", ClientMessages>;
	/** Switch to `pick` (a BCP-47 tag such as `zh-CN`); an unavailable tag falls back to `en`. */
	setLocale(pick: string): void;
	/** Observe language switches; returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

let language = createLanguage(resolveLocale(null, systemLocales(), offered), translations, report);
let translator = messages.in(language);
const listeners = new Set<() => void>();

export const locale: LanguageStore = {
	get language() {
		return language;
	},
	get t() {
		return translator;
	},
	setLocale(pick: string): void {
		const next = resolveLocale(pick.replace(/_/g, "-"), [], offered);
		if (next === language.locale) return;
		language = createLanguage(next, translations, report);
		translator = messages.in(language);
		for (const listener of listeners) listener();
	},
	onChange(listener: () => void): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};