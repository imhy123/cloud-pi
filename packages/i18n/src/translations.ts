// cloud-pi i18n: adapted copy of pi packages/chord/src/surfaces/translations.ts
// (tag v1.5.2).
// Changes: the Chord Translations registry, its facet and plugin attribution are
// dropped; catalogs compose from a plain list instead of a registry table.
import type { Catalog } from "./messages.ts";

/** One catalog: the messages of `namespace` in `locale`; `override: true` replaces a catalog without it. */
export type Translation = {
	readonly namespace: string;
	readonly locale: string;
	/** Partial allowed: a missing key falls back (the locale's base, then the namespace's first catalog). */
	readonly messages: Catalog;
	readonly override?: true;
};

/** The composed catalogs: the one used per namespace and canonical locale, with every locale offered. */
export type TranslationIndex = {
	readonly catalogs: ReadonlyMap<string, ReadonlyMap<string, Translation>>;
	/** Every locale some catalog offers, canonical (`pt-BR`), sorted. */
	readonly locales: readonly string[];
};

/** No catalogs: what a language has before any catalog is contributed. */
export const NO_TRANSLATIONS: TranslationIndex = { catalogs: new Map(), locales: [] };

/**
 * The index of `translations`: per namespace and canonical locale the winning
 * catalog. The first wins, except that `override: true` wins over one without
 * it; invalid locales and exact duplicates go to `report`.
 */
export function composeTranslations(
	translations: readonly Translation[],
	report: (message: string) => void = () => {},
): TranslationIndex {
	const catalogs = new Map<string, Map<string, Translation>>();
	const locales = new Set<string>();
	for (const translation of translations) {
		const locale = canonicalLocale(translation.locale);
		if (locale === undefined) {
			report(`"${translation.locale}" is no locale (${translation.namespace})`);
			continue;
		}
		locales.add(locale);
		let byLocale = catalogs.get(translation.namespace);
		if (byLocale === undefined) {
			byLocale = new Map();
			catalogs.set(translation.namespace, byLocale);
		}
		const taken = byLocale.get(locale);
		if (taken === undefined || (translation.override === true && taken.override !== true)) {
			byLocale.set(locale, translation);
		} else if ((translation.override === true) === (taken.override === true)) {
			report(`${translation.namespace} in ${locale} is contributed twice`);
		}
	}
	return { catalogs, locales: [...locales].sort() };
}

/** `locale` canonical (`pt-br` is `pt-BR`), or `undefined` when it is no language tag. */
export function canonicalLocale(locale: string): string | undefined {
	try {
		return Intl.getCanonicalLocales(locale)[0];
	} catch {
		return undefined;
	}
}