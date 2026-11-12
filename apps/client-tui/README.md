# @cloud-pi/client-tui

The terminal client currently shows a welcome banner, an editor and a local
transcript. Submitted ordinary text is echoed; the client is not connected to
the durable server yet.

From the repository root, after `npm install`:

```sh
npm run client
npm run client -- --version
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

Both commands take no arguments. Unknown commands and invocations with arguments
such as `/clear extra` remain ordinary text. Commands are case-sensitive;
leading/trailing whitespace is ignored for dispatch. No `/language` command is
registered.

The command framework is adapted from oh-my-pi v18.18.7. See
[PATCHES.md](./PATCHES.md) and [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
