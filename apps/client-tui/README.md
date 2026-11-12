# @cloud-pi/client-tui

The terminal client currently shows a welcome banner, an editor and a local
transcript. Submitted ordinary text is echoed; the client is not connected to
the durable server yet.

From the repository root, after `npm install`:

```sh
npm run client
npm run client -- --version
npm run client -- --language zh-CN
npm run typecheck -w @cloud-pi/client-tui
npm run test -w @cloud-pi/client-tui
```

The client runs from source using the TUI examples' TypeScript loader.

## Slash commands

Type `/` to browse commands; use the editor's completion keys to select one.
Names remain English. Descriptions and description search use the startup
language selected by `src/i18n/locale.ts`. The banner and commands share this
read-only locale; language changes require restarting the client.

| Command | Behavior |
| --- | --- |
| `/clear` | Clear only the displayed transcript; keep the welcome banner and editor. No server or persisted conversation data is deleted. |
| `/quit` | Stop the welcome animation, terminal appearance polling and TUI, then exit. Ctrl+C uses the same exit function. |
| `/settings` | Open the fullscreen settings panel. `Language` offers `English` and `中文（简体）`; saving takes effect after restart. |

All three commands take no arguments. Unknown commands and invocations with arguments
such as `/clear extra` remain ordinary text. Commands are case-sensitive;
leading/trailing whitespace is ignored for dispatch. No `/language` command is
registered.

The command framework is adapted from oh-my-pi v18.18.7. See
[PATCHES.md](./PATCHES.md) and [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## Client configuration

Clients share `~/.cloud-pi/client/config.yml`. The YAML setting
`client-tui.language` accepts `en` or `zh-CN`; `client-tui.theme.dark` and
`client-tui.theme.light` select themes for each terminal appearance. If the
language is unset, the client uses the
system language and falls back to English. Settings preserve unknown fields and
comments. A malformed file or a detected external change is not overwritten;
fix the file or restart before saving. The panel shows any load or save error.
The default mappings are `titanium` (dark) and `light` (light). Existing
`appearance.language` is read as a legacy value and moved on the next save.
The server configuration is separate. The panel also lists settings from omp
as read-only mock entries; only language and dark/light themes are implemented.
Mock setting labels and descriptions currently retain their upstream English text.

Settings declarations include static options or a dynamic provider name. Each
option has a stored value and localized label/description. `label.messageKey`
and `description.messageKey` explicitly identify translations; language names
without a message key keep their original text.
`configPath` selects the host's read/write binding, independently of localization.
Dynamic providers receive an abort signal; closing their menu cancels the request
and late results are ignored. Host bindings and providers live in
`src/settings/bindings.ts`.

`--language en` or `--language zh-CN` overrides the saved language for this
process only. Priority: CLI option, configuration, system languages, English.
