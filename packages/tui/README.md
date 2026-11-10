# @cloud-pi/tui

A self-contained Node.js terminal UI library extracted from
[oh-my-pi](https://github.com/can1357/oh-my-pi)'s TUI. It provides the immutable
frame renderer, themes, components, inline images (Kitty / iTerm2), and terminal
notifications as a reusable package with no FFI, no native addon, and no Bun
runtime dependency.

- **Node.js 24+**, ESM only.
- **Immutable render contract**: `render(width)` returns `readonly string[]`.
  Rows are owned by the component and never mutated by the engine.
- **Differential painting**: synchronized output, history vs. viewport, overlays,
  resize reflow, and a paint listener for host integration.
- **Pure TypeScript text engine**: ANSI-aware width, wrapping, truncation, and
  Kitty keyboard parsing without native bindings.

## Install

`@cloud-pi/tui` is not published to the registry. Inside this monorepo, depend on
the workspace package by name; npm links the local copy:

```json
{
	"dependencies": {
		"@cloud-pi/tui": "^0.1.0"
	}
}
```

Outside the monorepo, install it from the package directory:

```sh
npm install ../cloud-pi/packages/tui
```

The package ships `dist/` compiled from `src/`; run `npm run build -w @cloud-pi/tui`
from the repository root before consuming the built output.

## Quick start

```ts
import { ProcessTerminal, Text, TUI } from "@cloud-pi/tui";

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

tui.addChild(new Text("Hello from @cloud-pi/tui", 1, 1));
tui.start();

process.on("SIGINT", () => {
	tui.stop();
	process.exit(0);
});
```

`TUI.start()` starts the terminal, enables raw input, and schedules the first
paint. `TUI.stop()` restores the terminal. Components are added with
`addChild()` / `removeChild()` (or constructed into a `Container`), and a component
whose content changed must call `invalidate()` (or return a new array from
`render`) so the engine repaints.

### Input and focus

```ts
const tui = new TUI(new ProcessTerminal());
const unsubscribe = tui.addInputListener(data => {
	if (data === "q") {
		tui.stop();
		return { consume: true };
	}
	return undefined;
});

tui.addChild(editor);
tui.setFocus(editor); // editor implements handleInput
tui.start();
```

`setFocus()` routes input to a focusable component; a listener can consume a
sequence before it reaches the focused component. `tui.start({ deferInput: true })`
paints while leaving stdin in cooked mode until `tui.enableInput()`.

### Overlays

```ts
const overlay = tui.showOverlay(new Text("Confirm?", 1, 1), {
	anchor: "center",
	width: 30,
});
overlay.hide();
```

`row` / `col` accept an absolute cell offset or a percentage string; `anchor`
positions the overlay relative to its own size.

## Themes

Themes use a process-wide singleton, matching oh-my-pi's behavior. Bundled themes
are `dark` and `light`; custom themes load from the user theme directory.

```ts
import { Text } from "@cloud-pi/tui";
import { getThemeByName } from "@cloud-pi/tui/theme";

const theme = await getThemeByName("dark");
const label = new Text("", 1, 1).setStyleFn(text => theme!.fg("accent", text));
label.setText("Accent text");
```

- `Theme.fg(color, text)` / `Theme.bg(color, text)` return ANSI-wrapped strings;
  `getFgAnsi()` / `getBgAnsi()` return the raw codes.
- Colorful Markdown is on by default: headings, strong/emphasis, inline code and
  table headers take hues from the theme's 16-slot `terminal.ansi` palette
  (`Theme.ansiFg(slot, text)`). `setMarkdownColorful(false)` restores the
  single heading color and plain bold/italic.
- `initTheme()`, `setTheme()`, `previewTheme()`, and `onThemeChange()` manage the
  active singleton.
- The theme color keys (accent, border, mdHeading, syntaxKeyword, …) are listed
  in `src/theme/schema-validation.ts` and validated on load.

### Syntax highlighting

Highlighting is pluggable and off by default. `Markdown` and `highlightCode()`
render plain text until a host installs an engine:

```ts
import { setHighlighter } from "@cloud-pi/tui/theme";

setHighlighter({
	supportsLanguage: lang => lang === "ts",
	highlightCode: (code, lang, colors) => {
		// colors.keyword/comment/string/... are ANSI SGR strings from the theme
		return myHighlighter(code, lang, colors);
	},
});
```

## Components

Exported from `@cloud-pi/tui/components` (and `@cloud-pi/tui`):

`Text`, `Box`, `Container`, `Input`, `Editor`, `Form` / `FormField`,
`Markdown`, `Loader`, `CancellableLoader`, `ProgressBar`, `Table`, `Sparkline`,
`SelectList`, `SettingsList`, `TreeView`, `TruncatedText`, `KeyValueList`,
`Section`, `TabBar`, `Spacer`, `Metric`, `WizardStep`, `Image`, plus layout
containers in `components/layout`.

Every component implements:

```ts
interface Component {
	render(width: number): readonly string[];
	invalidate?(): void;
	handleInput?(data: string): void;
}
```

`setFocus()` expects a `Focusable`: any component with a `focused` boolean.

Renderers for tool output and code cells live in `@cloud-pi/tui/render` (`renderOutputBlock`,
`formatOutputPaneLines`, `renderCodeCell`, `renderFileList`, `renderTreeList`,
`renderToolCard`, hyperlink helpers).

## Images

Kitty and iTerm2 inline-image protocols are supported; SIXEL is not. Protocol
detection comes from environment variables and terminal replies, and can be
overridden with `setTerminalImageProtocol()`.

```ts
import { readFile } from "node:fs/promises";
import { Image, getImageDimensions } from "@cloud-pi/tui";
import { getThemeByName } from "@cloud-pi/tui/theme";

const bytes = await readFile("logo.png");
const data = bytes.toString("base64");
const theme = await getThemeByName("dark");
const image = new Image(
	data,
	"image/png",
	{ fallbackColor: text => theme!.fg("muted", text) },
	{ maxWidthCells: 40, filename: "logo.png" },
);
```

`ImageBudget` caps how many images render as live graphics; the rest fall back to
a themed text placeholder. Lower-level helpers (`renderImage`, `encodeKittyTransmit`,
`encodeITerm2`, `getPngDimensions`, …) are exported from `@cloud-pi/tui/image`.

## Notifications

```ts
import { getTerminalInfo, TERMINAL_ID } from "@cloud-pi/tui";

getTerminalInfo(TERMINAL_ID).sendNotification({
	title: "Build",
	body: "Finished in 12s",
});
```

Notifications use OSC 9, OSC 99, or BEL according to terminal capability.
`routeTerminalMultiplexerNotification()` forwards through tmux, screen, zellij,
and other multiplexers when they would swallow the sequence. On a Linux desktop
session, `sendDesktopNotification()` falls back to `notify-send` / `gdbus`.
`isNotificationSuppressed()` and `setOsc99Supported()` control delivery.

## Keys

`@cloud-pi/tui/keys` exports `matchesKey`, `parseKey`, `Key`, `parseKittySequence`,
`isKeyRelease`, `decodePrintableKey`, and the Kitty-protocol state setters. Both
legacy VT sequences and the Kitty keyboard protocol are supported.

## Subpath exports

| Specifier | Contents |
| --- | --- |
| `@cloud-pi/tui` | Core TUI, terminal, components, theme, keys, utilities |
| `@cloud-pi/tui/theme` | Theme singleton, loaders, adapters, `setHighlighter` |
| `@cloud-pi/tui/components` | Components only |
| `@cloud-pi/tui/render` | Output/code/tool render helpers and hyperlinks |
| `@cloud-pi/tui/image` | `Image`, Kitty graphics, image encoding/dimensions |
| `@cloud-pi/tui/notifications` | Notification protocols, routing, desktop toasts |
| `@cloud-pi/tui/multiplexers` | tmux, screen, zellij, cmux, herdr, orca, wmux adapters |
| `@cloud-pi/tui/keys` | Key matching/parsing |

## Differences from oh-my-pi

- **No Tern Surface Protocol (TSP)**: the native `describe()` surface, native
  overlays/sheets, and native UI events are removed; `render()` is the only
  contract.
- **No SIXEL**.
- **No FFI / native addon**: pure-JS text and key engines; Windows AltGr has no
  layout layer; the stderr fd guard is inert; macOS appearance detection shells
  out to `defaults`.
- **No Bun runtime**: a small shim supplies the `Bun` APIs the sources use, and
  the bundle injects it at build time.
- **No CLI product modules**: apps, chat transcript, tool renderers, overlays,
  status line, setup wizard, and debug server are not included.
- **Pluggable highlighting**: no built-in syntax-highlighting engine is shipped.

Every file under `src/` starts with a provenance header naming its upstream file
and baseline commit, and marking it as verbatim, adapted, or new. See
[PATCHES.md](./PATCHES.md) for the file-by-file modification log.

## Development

```sh
npm install
npm run typecheck -w @cloud-pi/tui   # tsc --noEmit
npm run build -w @cloud-pi/tui       # tsup (ESM + d.ts, 8 entry points)
npm run test -w @cloud-pi/tui        # Vitest over src/
npm run test:dist -w @cloud-pi/tui   # node --test against the built bundle
npm run verify                       # all of the above
```

`test/setup.ts` installs the Bun shim on `globalThis` so the vendored sources run
unmodified under Vitest. Tests are plain Node: they must pass with no Bun
installed.

## License

MIT. @cloud-pi/tui is derived from oh-my-pi and pi; see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) and [LICENSE](./LICENSE).
