# Adaptations from oh-my-pi

The slash-command framework uses oh-my-pi tag `v18.18.7`, commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`, as its baseline. Paths below are
relative to this application; upstream paths are relative to
`packages/coding-agent/src/`. Each adapted file has a provenance header.

| Local file | Upstream file | Changes and reason |
| --- | --- | --- |
| `src/slash-commands/types.ts` | `slash-commands/types.ts` | Keep metadata, parsed commands and local execution results. Replace session/settings/ACP/TUI runtimes with `clearTranscript`, `showSettings` and `quit`; omit icons, live descriptions and asynchronous handlers, which the local commands do not need. |
| `src/slash-commands/helpers/parse.ts` | `slash-commands/helpers/parse.ts` | Keep `parseSlashCommand` and `parseSubcommand` with their upstream parsing behavior; remove scope/usage/error helpers and use local types. |
| `src/slash-commands/builtin-completions.ts` | `slash-commands/builtin-completions.ts` | Keep generic subcommand completions and static/subcommand inline hints, including their shared helper/options. Remove model, MCP and path-specific dependencies; use local types and `@cloud-pi/tui`. |
| `src/slash-commands/builtin-registry.ts` | `slash-commands/builtin-registry.ts` | Inject specs through a factory; retain name/alias lookup, generic completion materialization and dispatch. Replace omp command aggregation, session adapters, collaboration and plugin operations with synchronous client handlers. Trim submitted input here instead of in omp's input controller. |

New client code:

- `src/slash-commands/builtin-client.ts` defines `/clear`, `/settings` and `/quit`, with
  descriptions translated once when the client starts.
- `src/main.ts` connects the registry to the existing TUI autocomplete provider
  and submission callback. `/clear` clears only the local transcript; `/quit`
  and Ctrl+C share cleanup of the intro animation, appearance polling and TUI.
- `packages/common/src/i18n/client-messages.ts` supplies the TUI catalog; shared
  localized text, errors and i18n live in `@cloud-pi/common`.
- `src/i18n/locale.ts` creates a locale from supplied preferences; `main.ts` loads
  settings explicitly before creating it, with no setter or
  change subscriptions. The banner receives its tip at construction; its unused
  language-switch setter has been removed.
- `test/slash-commands.test.ts` verifies parsing, dispatch, scope of clearing,
  localized completions/search, aliases and generic hint builders.

- `src/settings/store.ts` adapts the YAML configuration concept from
  `coding-agent/src/config/settings.ts` to Node, a single client-shared file,
  validation and atomic writes; agent/project settings layers are omitted.
- `src/settings/definitions.ts` validates and converts the unified `settings.json`
  category/group/setting tree;
  `src/settings/controller.ts` connects them to storage and themes.
- `src/tui/components/settings-selector.ts` adapts the terminal settings list and
  fullscreen interaction from `tui/src/overlays/settings-selector.ts`; language and dark/light theme settings are functional. Other settings are read-only
  mock entries generated from upstream metadata. Tab and status text are localized;
  mock labels and descriptions retain upstream English.
- `src/settings/settings.json` records mock metadata extracted from
  upstream `coding-agent/src/**/*.ts` registry declarations.
- `test/settings.test.ts` checks storage, error handling and the panel.

The TUI `SettingsList` exposes localized search text through an optional API.
No coding-agent configuration system, file-command loader, ACP dispatcher or
omp builtin handlers are included.

`src/settings/bindings.ts` owns language fallback, theme discovery and save effects.
The controller consumes generic definitions and provider callbacks. The component
handles loading, empty/error states and cancellation for dynamic option menus.

`src/cli-options.ts` parses temporary `--language` overrides; `main.ts` exposes
`startClient` so the CLI passes startup options without mutating configuration.
