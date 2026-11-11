// cloud-pi i18n: adapted copy of pi packages/chord/src/surfaces/messages.ts
// (tag v1.5.2).
// Changes: the Chord contracts dependency and `MessageSchema` are gone (no
// Chord link to carry a message as data), and the namespace check is local.
// Everything else is verbatim.

import { currentLanguage, inLanguage, type Language } from "./language.ts";
import { canonicalLocale, type Translation } from "./translations.ts";

/** Lowercase npm package-name characters, the namespace grammar of a contract name. */
const NAMESPACE = /^[a-z0-9@/._~-]+$/;

/** A message's value: a text, or a function of its arguments returning one. */
export type MessageValue = string | ((...args: never[]) => string);

/** A catalog: the messages of one namespace in one language, by key. */
export type Catalog = { readonly [key: string]: MessageValue };

/** A catalog's shape as other catalogs must match it: its keys, strings as `string`, functions with their signatures. */
export type CatalogShape<M> = { readonly [K in keyof M]: M[K] extends string ? string : M[K] };

/** The arguments of a message: its function's parameters, none for a text. */
export type MessageArgs<V> = V extends (...args: infer A) => string ? A : [];

/** A parameter of a message as data: plain JSON (a date as an ISO string or a number). */
export type MessageParam = string | number | boolean | null;

/**
 * A message as data: its namespace, its key and its parameters; typed by `t.message` (`MessageData<"notes", "saved">`),
 * any namespace and key as `MessageData` carries it across state.
 */
export type MessageData<N extends string = string, K extends string = string> = {
	readonly namespace: N;
	readonly key: K;
	// Not a readonly array: a message can go into mutable state (immutable by convention).
	readonly params: MessageParam[];
};

/** The keys of `M` whose arguments are all `MessageParam`s: those `t.message` can build. */
export type DataKeys<M> = {
	[K in keyof M & string]: MessageArgs<M[K]> extends readonly MessageParam[] ? K : never;
}[keyof M & string];

/** A message of namespace `N`, or one of any namespace (`string`, from a schema): another literal namespace is refused. */
type OfNamespace<G extends MessageData, N extends string> = string extends G["namespace"]
	? unknown
	: { readonly namespace: N };

/** Renders the messages of namespace `N` with catalog shape `M` in one language. */
export type Translator<N extends string, M> = {
	/** The message `key` with its arguments. */
	<K extends keyof M & string>(key: K, ...args: MessageArgs<M[K]>): string;
	/** A message as data; a foreign namespace or an unknown key shows the key (and is reported). */
	render<G extends MessageData>(message: G & OfNamespace<G, N>): string;
};

/** A namespace's messages: `t` itself (in the current language), its namespace, its catalogs as contributions, `message`. */
export type Messages<N extends string, M> = Translator<N, M> & {
	readonly namespace: N;
	/** Its catalogs as `Translation` entries: a host contributing catalogs collects them. */
	readonly translations: readonly Translation[];
	/** The message `key` with its arguments as data, for state that clients render. */
	message<K extends DataKeys<M>>(key: K, ...args: MessageArgs<M[K]>): MessageData<N, K>;
	/** `t` in `language` (`undefined`: the first catalog). */
	in(language: Language | undefined): Translator<N, M>;
};

/** The catalog shape of a namespace's messages: what a translation fills (`const fr: MessagesOf<typeof t> = {...}`). */
export type MessagesOf<T> = T extends Messages<string, infer M> ? M : never;

/**
 * The messages of `namespace` (a name like a type's, `[a-z0-9@/._~-]`) in `catalogs` by locale; the first catalog
 * defines the keys and signatures, the others match it.
 */
export function defineMessages<const N extends string, M extends Catalog>(
	namespace: N,
	catalogs: { readonly [locale: string]: CatalogShape<M> },
): Messages<N, CatalogShape<M>> {
	// Declaration policy: a namespace is a name, a catalog's key a language tag (both reachable from JavaScript).
	if (!NAMESPACE.test(namespace)) {
		throw new Error(`A messages namespace ${JSON.stringify(namespace)}: expected lowercase [a-z0-9@/._~-]`);
	}
	const own = new Map<string, Catalog>();
	for (const [locale, catalog] of Object.entries(catalogs)) {
		const canonical = canonicalLocale(locale);
		if (canonical === undefined) throw new Error(`${namespace}: "${locale}" is no language tag`);
		own.set(canonical, catalog);
	}
	const first = own.values().next().value;
	if (first === undefined) throw new Error(`${namespace}: defineMessages needs a catalog`);
	const source: Source = { namespace, own, first };
	const translations = [...own].map(([locale, messages]) => ({ namespace, locale, messages }));
	// The overloads `Messages` types are these functions', keyed by the catalog's shape.
	return Object.assign(translator<N, CatalogShape<M>>(source, currentLanguage), {
		namespace,
		translations,
		message: (key: string, ...params: MessageParam[]) => ({ namespace, key, params }),
		in: (language: Language | undefined) => translator<N, CatalogShape<M>>(source, () => language),
	}) as Messages<N, CatalogShape<M>>;
}

/** A namespace's own catalogs, by canonical locale, and its first. */
type Source = { readonly namespace: string; readonly own: ReadonlyMap<string, Catalog>; readonly first: Catalog };

/** A translator of `source`'s messages in the language `language` reads at each call. */
function translator<N extends string, M>(source: Source, language: () => Language | undefined): Translator<N, M> {
	const t = (key: string, ...args: unknown[]): string => renderKey(source, language(), key, args);
	const render = (message: MessageData): string => renderData(source, language(), message);
	// The overloads `Translator` types are this one function's, keyed by the catalog's shape.
	return Object.assign(t, { render }) as unknown as Translator<N, M>;
}

/**
 * `key` of `source` in `language`: down its chain, at each locale the host's contributed catalog, then the namespace's
 * own; else the first catalog.
 */
function renderKey(source: Source, language: Language | undefined, key: string, args: readonly unknown[]): string {
	if (language === undefined) return call(source.first[key]!, args);
	return inLanguage(language, () => {
		for (const [index, locale] of language.chain.entries()) {
			const contributed = language.translations.catalogs.get(source.namespace)?.get(locale);
			if (contributed !== undefined && Object.hasOwn(contributed.messages, key)) {
				try {
					return found(language, source, key, index, call(contributed.messages[key]!, args));
				} catch (error) {
					// A contributed catalog is foreign code: reported, and the chain goes on.
					language.report({ kind: "failed", namespace: source.namespace, locale, key, error });
				}
			}
			const own = source.own.get(locale);
			if (own !== undefined && own !== contributed?.messages && Object.hasOwn(own, key)) {
				return found(language, source, key, index, call(own[key]!, args));
			}
		}
		return found(language, source, key, language.chain.length, call(source.first[key]!, args));
	});
}

/** `text`, found at `index` in `language`'s chain (its length: the first catalog), a fallback reported past the first. */
function found(language: Language, source: Source, key: string, index: number, text: string): string {
	if (index > 0) {
		const used = language.chain[index];
		language.report({ kind: "fallback", namespace: source.namespace, locale: language.locale, key, used });
	}
	return text;
}

/** A message's text: the text, or the function called with `args` (typed by the catalog's signature). */
function call(value: MessageValue, args: readonly unknown[]): string {
	return typeof value === "string" ? value : (value as (...params: readonly unknown[]) => string)(...args);
}

/**
 * A message as data in `language`. Checked first (state input): another namespace, a key the first catalog lacks or
 * params that are no list show the key, reported; so does a message that throws.
 */
function renderData(source: Source, language: Language | undefined, message: MessageData): string {
	const { namespace, key, params } = message;
	const known = namespace === source.namespace && Object.hasOwn(source.first, key) && Array.isArray(params);
	if (!known) {
		language?.report({ kind: "unknown", namespace, key, expected: source.namespace });
		return key;
	}
	try {
		return renderKey(source, language, key, params);
	} catch (error) {
		language?.report({ kind: "failed", namespace: source.namespace, locale: language.locale, key, error });
		return key;
	}
}