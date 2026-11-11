# @cloud-pi/i18n

Typed message catalogs, languages and locale-aware formatting for every
cloud-pi client (terminal, web, desktop). It has no runtime dependencies; all
locale data and formatting come from `Intl`.

## Provenance

Vendored from [pi](https://github.com/badlogic/pi-mono)'s
[`@earendil-works/chord`](https://github.com/badlogic/pi-mono/tree/main/packages/chord)
client surfaces, which are MIT-licensed:

- Source: `packages/chord/src/surfaces/{messages,language,translations,format}.ts`
- Upstream: pi tag `v1.5.2` (chord `1.5.2`)
- License: MIT (see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md))

The published chord package does export these through its root entry, but the
root entry also carries the whole app framework (hosts, registries, store,
links). Clients only render messages, so the four files are vendored instead of
pulling the framework in.

Deliberate deviations (recorded in each file's header):

- `messages.ts`: the Chord contracts dependency and `MessageSchema` are gone
  (there is no Chord link carrying a message as data), and the namespace check
  is local.
- `translations.ts`: the `Translations` registry and its facet are gone; catalogs
  compose from a plain list with `composeTranslations`.
- `language.ts` / `format.ts`: the `plugin` attribution in reports is gone;
  otherwise verbatim.

## API

```ts
import { composeTranslations, createLanguage, defineMessages, formatNumber, inLanguage, resolveLocale } from "@cloud-pi/i18n";

const t = defineMessages("client-tui", {
	en: {
		"welcome.tip": "Tip: Ctrl+C exits Cloud-Pi.",
		"chat.youSaid": (text: string) => `You said: ${text}`,
	},
	"zh-CN": {
		"welcome.tip": "提示：Ctrl+C 退出 Cloud-Pi。",
		"chat.youSaid": (text: string) => `你说：${text}`,
	},
});

const language = createLanguage("zh-CN", composeTranslations([...t.translations]), report => console.warn(report));
console.log(inLanguage(language, () => t("welcome.tip")));
console.log(inLanguage(language, () => t("chat.youSaid", "hi")));
```

- `defineMessages(namespace, catalogs)` — the first catalog defines the keys and
  their argument types; every other catalog must match it (missing key, unknown
  key or wrong arguments are type errors). Values may be functions, so plurals
  and word order live in the catalog rather than in a parser.
- `createLanguage(locale, translations, report)` — a locale, its fallback chain
  (`pt-BR`, `pt`), its direction and the catalogs' overrides. `report` receives
  `fallback` / `failed` / `unknown` events.
- `resolveLocale(pick, preferred, offered)` / `matchLocale(...)` — pick the
  first offered locale from a user choice or the device's preference list.
- `inLanguage(language, render)` / `currentLanguage()` — synchronous render
  scope; `t` reads the current language at call time, so a catalog must never be
  evaluated at module top level and cached.
- `composeTranslations(list, report?)` — merge catalogs from several modules;
  first wins, `override: true` wins over a catalog without it.
- `formatTime(value, options?)` / `formatNumber(value, options?)` — `Intl`
  formatters of the current language.

## Consumption

The package exposes TypeScript source (`exports` points at `src/index.ts`), so a
client needs no build step:

```jsonc
// apps/<client>/package.json
"dependencies": { "@cloud-pi/i18n": "0.0.0" }
```

```jsonc
// tsconfig.base.json
"paths": { "@cloud-pi/i18n": ["packages/i18n/src/index.ts"] }
```

Keep `@cloud-pi/tui` locale-agnostic: locale and catalogs belong to the clients,
so the library's output never drifts with the host's environment.

Internal imports carry `.ts` extensions, so the package also loads in plain
Node 24 (native type stripping) without a bundler. A TypeScript consumer needs
`allowImportingTsExtensions` in its compiler options; `tsconfig.base.json`
already sets it, together with the `@cloud-pi/i18n` path mapping.

`npm install` links the workspace (`node_modules/@cloud-pi/i18n`), which is what
makes the bare specifier resolve at runtime.

## Rules

- Catalogs hold plain text only — never ANSI escapes. Colors and widths are
  applied later by `theme.fg()` / `visibleWidth()`.
- Do not translate identifiers: command names and aliases, theme names, model
  ids, key ids, `SelectItem.value`. Translate `label`/`description`/`hint`.
- A component that caches rendered lines must invalidate them on a language
  change, exactly like a theme change.