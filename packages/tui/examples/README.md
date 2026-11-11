# @cloud-pi/tui examples

Hands-on guide for writing demos against `@cloud-pi/tui`.

The directory ships working demos for every step below, plus the
`11-welcome/` banner. The tutorial follows the shape of the pi-tui walkthrough
in the cloud-pi repository (`demo/pi-tui/README.md`) but uses
`@cloud-pi/tui`'s actual API, so most copy-pasted pi-tui snippets will not run
unchanged.

## 0. Before you start

### 0.1 Nothing to install or build

Examples import `@cloud-pi/tui` and resolve it to `src/`, not `dist/`:

```bash
# from the repository root
npm install
cd packages/tui/examples
npm run 01-hello   # node --import ./register.mjs 01-hello/hello.ts
```

`package.json` and three small files next to this README make that work:

- `register.mjs` — preloaded with `--import`. It installs the loader and sets
  `globalThis.Bun` to the same shim tsup injects into the bundle.
- `ts-loader.mjs` — a `module.registerHooks()` pair. `resolve` maps
  `@cloud-pi/tui` and `@cloud-pi/tui/<subpath>` to `src/`, maps the
  `@oh-my-pi/*` build aliases, and fills in the `.ts` / `/index.ts` extensions
  the sources omit. `load` transpiles `.ts` files with the repository's
  TypeScript install: Node 26 strips types but no longer transforms enums, and
  the sources use them.
- `tsconfig.json` — maps the same specifiers for tsserver/vtsls, so the editor
  matches the runtime.

No build step and no `file:..` dependency are involved. `npm run build` is only
needed when something consumes `dist/` (published package, `test/bundle`); source
edits are picked up on the next demo run.

### 0.2 Requirements

**Node.js 24+**; the package is ESM-only and `examples/package.json` declares
`"type": "module"`. Demos are TypeScript and must be started through
`node --import ./register.mjs <file>.ts` so the loader sees them.

### 0.3 Pitfalls

**1. `package.json` must declare ESM.** Without `"type": "module"` Node emits
`MODULE_TYPELESS_PACKAGE_JSON` or refuses the imports.

**2. Types need `import type`; runtime values do not.** Node's type stripping
only removes imports explicitly marked as types. `TUI`, `ProcessTerminal`,
`Text`, `Editor` are runtime classes. `Component`, `EditorTheme`, `Focusable`,
`SelectItem`, `MarkdownTheme`, `OverlayHandle` are interfaces that do not exist
at runtime:

```ts
// Runtime values
import { Editor, ProcessTerminal, Text, TUI } from "@cloud-pi/tui";
// Types
import type { Component, Focusable } from "@cloud-pi/tui";
```

**3. `Editor` takes a theme, not a `TUI`.** pi-tui's `new Editor(tui, theme)`
signature does not exist here. @cloud-pi/tui adapts its singleton theme for you:

```ts
import { Editor, getEditorTheme, initTheme } from "@cloud-pi/tui";

await initTheme();
const editor = new Editor(getEditorTheme());
```

`getEditorTheme()` has an unstyled fallback, but call `initTheme()` (or
`initThemeSync()`) first if you want real colors. The constructor has no optional
theme, so `new Editor(undefined)` is a type error.

**4. `addInputListener` must return a result.** The callback returns
`{ consume?: boolean; data?: string } | undefined`. A body that only performs
work returns `void`, which does not type-check; end it with `return undefined;`
(or return `{ consume: true }` to stop propagation).

**5. TypeScript-only syntax is fine in demos.** The loader transpiles every
`.ts` file, so enums, parameter properties, and `namespace` work in example
code:

```ts
class Picker {
	constructor(private readonly tui: TUI) {}
}
```

Plain `node demo.ts` (without `--import ./register.mjs`) falls back to Node's
strip-only mode and rejects that syntax; that path is not supported here.

**6. `@types/node` comes from the repository install.** `process` is a Node
global and works at runtime regardless, but tsserver/vtsls reports
`Cannot find name 'process'` without the types. `examples/tsconfig.json`
requests them from the parent `node_modules`, so no local install is needed.

**7. `start()` is meant for a real TTY.** Raw mode is enabled only when stdin
exposes `setRawMode`; with piped stdin that step is skipped, while the escape
sequences still go to a non-terminal stdout, so a piped run produces garbage
instead of an interface. To check that code builds without a terminal, construct
`new TUI(new ProcessTerminal())` and stop there; do not call `start()`.

**8. In raw mode Ctrl+C does not raise SIGINT.** The terminal hands you the
byte; the application must handle it. Register an input listener (see §1) before
relying on Ctrl+C to exit.

**9. Repaint explicitly.** Adding, removing, or mutating a component does not
schedule a render. Call `invalidate()` on the component whose content changed
and then `tui.requestRender()`. A component should never write to `stdout`
itself.

**10. Source edits need no rebuild.** Examples read `src/` directly; restart
the demo to pick up a change. Run `npm run build` only when validating `dist/`.

## 1. Minimal application

`01-hello/hello.ts` (the shipped demo):

```ts
import {
	Editor,
	getEditorTheme,
	initTheme,
	matchesKey,
	ProcessTerminal,
	Text,
	TUI,
} from "@cloud-pi/tui";

await initTheme();

// Second argument: draw the caret with the terminal's hardware cursor instead of
// printing a cursor glyph into the frame, which would stay in scrollback on exit.
const tui = new TUI(new ProcessTerminal(), true);

tui.addChild(new Text("Welcome to @cloud-pi/tui!", 1, 1));

const editor = new Editor(getEditorTheme());
editor.onSubmit = (text) => {
	tui.addChild(new Text(`You said: ${text}`, 1, 0));
	tui.requestRender();
};
tui.addChild(editor);
tui.setFocus(editor); // route keyboard input to the editor

// Raw mode: Ctrl+C arrives as input, not SIGINT. The callback type requires a
// return value; `void` is not assignable to it.
tui.addInputListener((data) => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	return undefined;
});

tui.start();
```

```bash
cd packages/tui/examples
npm run 01-hello
# or: node --import ./register.mjs 01-hello/hello.ts
```

The editor clears its buffer before `onSubmit` runs, so the host does not have
to reset it. `tui.start()` enables raw input and schedules the first paint;
`tui.stop()` restores the terminal. If you see `process is not defined`, you are
not running under Node: `process` is a Node global, not a browser one.

The second `TUI` argument enables the hardware cursor. Left at its default
(`false`), the editor renders the caret as an ordinary glyph — `symbols.inputCursor`,
usually `▏` — inside the frame. That glyph is real frame content, so after
`tui.stop()` it remains visible in the terminal as a stray mark. With `true` the
frame contains no caret glyph and the engine parks the real terminal cursor after
the last rendered row, which is what oh-my-pi does.

## 2. Rendering model

`@cloud-pi/tui` has a single renderer class, `TUI`. There is no separate
`TuiMainScreen`/`TuiAltScreen` pair as in pi-tui.

- The transcript is painted on the terminal's normal screen, so native
  scrollback keeps earlier output.
- The first paint anchors at the top of the visible screen and repaints that
  region, so the shell output that was on screen is overwritten (oh-my-pi
  behaves the same). This is not a scrollback erase: content above the viewport
  survives. Pass `clearScrollback: true` to `tui.start()` to also erase native
  scrollback.
- Rendering is differential: `render(width)` produces rows, and the engine
  writes only the rows that changed. Synchronized output (`?2026`) is used when
  the terminal supports it.
- Overlays draw over the transcript. Passing `fullscreen: true` to
  `showOverlay()` borrows the alternate screen for that overlay's lifetime.
- Resize reflow is handled by the engine; use
  `tui.setResizeScrollback("append" | "rebuild" | "preserve")` to choose how
  settled resizes affect retained history.
- For an in-app viewport, wrap content in `ScrollView` or use the layout
  containers (`Stack`, `Row`, `SplitPane`).

To paint before taking over stdin, start deferred and enable input later:

```ts
tui.start({ deferInput: true });
// ... later, when the app is ready for keys
tui.enableInput();
```

While deferred, printable typing still edits the focused component through
kernel echo; other keys are held and replayed by `enableInput()`.

## 3. The component contract

```ts
interface Component {
	render(width: number): readonly string[];
	invalidate?(): void;
	handleInput?(data: string): void;
}
```

Rules:

1. **Width.** Every returned line must fit in `width` visible cells. Use
   `truncateToWidth()`, `wrapTextWithAnsi()`, and `visibleWidth()` instead of
   hand-rolled width math; they account for ANSI escapes, CJK wide characters,
   and emoji.
2. **Immutability.** The returned array and its rows belong to the component.
   The engine never mutates them. Return the same array reference while the
   content is unchanged — the engine uses reference equality as proof that rows
   are byte-identical. Return a fresh array as soon as anything changes.
3. **Caching.** Cache by width, and clear the cache in `invalidate()`.
4. **Rendering is pull-based.** Do not write to `stdout`. After changing state,
   call `invalidate()` and then `tui.requestRender()`.

A custom component:

```ts
import type { Component, TUI } from "@cloud-pi/tui";
import { matchesKey, truncateToWidth } from "@cloud-pi/tui";

class Picker implements Component {
	private index = 0;
	private readonly items = ["alpha", "beta", "gamma"];
	private readonly tui: TUI;
	private cachedWidth?: number;
	private cachedLines?: readonly string[];

	constructor(tui: TUI) {
		this.tui = tui;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "up")) {
			this.index = Math.max(0, this.index - 1);
		} else if (matchesKey(data, "down")) {
			this.index = Math.min(this.items.length - 1, this.index + 1);
		} else {
			return;
		}
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): readonly string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		this.cachedWidth = width;
		this.cachedLines = this.items.map((item, i) =>
			truncateToWidth(`${i === this.index ? "> " : "  "}${item}`, width),
		);
		return this.cachedLines;
	}
}
```

Mount it with:

```ts
const picker = new Picker(tui);
tui.addChild(picker);
tui.setFocus(picker);
```

## 4. Built-in components

Content: `Text`, `TruncatedText`, `Markdown`, `Image`.

Layout: `Container`, `Box`, `Spacer`, `Stack`, `Row`, `SplitPane`, `ScrollView`.

Input: `Input`, `Editor`, `Form` / `FormField` (`TextFormField`,
`SelectFormField`).

Selection: `SelectList`, `SettingsList`, `MenuSelection`, `TreeView`, `TabBar`.

Feedback: `Loader`, `CancellableLoader`, `ProgressBar`, `Sparkline`,
`MetricRow`.

Structure: `Section`, `KeyValueList`, `Table`, `Disclosure`, `WizardStep`.

Constructors worth knowing:

```ts
new Text("hello", 1, 1);                          // text, paddingX, paddingY
new TruncatedText("one long line", 0, 0);
new Markdown(source, 1, 0, getMarkdownTheme());    // theme is required
new Editor(getEditorTheme());
new Input();                                       // then input.prompt = "> "
new SelectList(items, 8, getSelectListTheme());    // items, visible rows, theme
new Loader(tui, s => theme.fg("accent", s), s => theme.fg("muted", s), "Loading…");
new ScrollView(componentOrLines, { height: 12, scrollbar: "auto" });
```

Theme adapters (`getEditorTheme`, `getMarkdownTheme`, `getSelectListTheme`,
`getSettingsListTheme`, `getSymbolTheme`) are exported from
`@cloud-pi/tui` and `@cloud-pi/tui/theme`. `Loader` needs the `TUI` instance so it
can request repaints on every spinner frame; it starts ticking when constructed
and stops on `dispose()`/`stop()`.

### Composer styles

The editor's chrome — top/bottom rows, side borders, padding, prompt gutter —
comes from a `ComposerStyle`. The editor resolves it by id:

```ts
import { Editor, getEditorTheme, initTheme, theme, visibleWidth } from "@cloud-pi/tui";

await initTheme();
const editor = new Editor(getEditorTheme());
editor.setBorderStyle("claude");

const status = theme.fg("muted", "claude mode");
editor.setTopBorder({ content: status, width: visibleWidth(status) });
```

Built-in ids (`BUILTIN_EDITOR_BORDER_STYLES`): `box` (default), `band`,
`claude`, `pi`, `borderless`, `rule`, `field`, `rail`. An unknown id falls back
to `box`; `setBorderVisible(false)` collapses any shape to `borderless`.

`claude` (`claudeComposerStyle`) draws a full-width rule above and below a
borderless input with a `❯ ` gutter. Its `verticalChrome` is 2, so it costs one
row above and one below. Status content rides the top rule as a right-docked
chip and is truncated on narrow terminals; the width you pass must be the
content's visible width. `setTopBorder()` caches what you pass — for values
that change constantly, use `setTopBorderProvider(width => ...)`, which runs
once per painted frame; `getTopBorderAvailableWidth(terminalWidth)` gives the
available chip width. Override the gutter or padding with `setPromptGutter()`
and `setPaddingX()`.

To keep a variant, register it once and select it by the new id. Built-in ids
cannot be replaced:

```ts
import { claudeComposerStyle, registerComposerStyle } from "@cloud-pi/tui";

const dispose = registerComposerStyle({
	...claudeComposerStyle,
	id: "claude-soft",
	filledSurface: false, // keep the editor's normal text color, like the built-in
});
editor.setBorderStyle("claude-soft");
dispose(); // removes the registration; the id resolves to "box" again
```

## 5. Focus and IME

A component that accepts typing implements `Focusable`:

```ts
interface Focusable {
	focused: boolean;
	setUseTerminalCursor?(useTerminalCursor: boolean): void;
}
```

- `tui.setFocus(component)` sets `focused` and routes `handleInput` there.
- While focused, emit `CURSOR_MARKER` (`\x1b_pi:c\x07`) at the text cursor.
  The engine finds and strips the marker, then places the hardware cursor
  there. That position is what makes the IME candidate window (for Chinese,
  Japanese, etc.) appear in the right place.
- A container embedding an `Input`/`Editor` must implement `Focusable` and
  forward `focused` to the child input; otherwise IME placement breaks.

`Input` and `Editor` already implement this. Custom single-line widgets should
copy the marker/`focused` pattern rather than positioning the cursor by writing
escape sequences.

## 6. Overlays

```ts
const overlay = tui.showOverlay(new Text("Confirm?", 1, 1), {
	anchor: "center",                 // center, top-left, bottom-right, ...
	width: "80%",                     // number of columns or a percentage
	maxHeight: 20,
	margin: 1,
	visible: (width, height) => width >= 80, // hide on narrow terminals
});

overlay.setHidden(true); // temporary
overlay.setHidden(false);
overlay.hide();          // permanent
```

Other options: `minWidth`, `offsetX`/`offsetY`, absolute `row`/`col` (numbers
or percentages), and `fullscreen` (borrow the alternate screen). Overlays are
focusable; `tui.setFocus()` on an overlay component works, and keyboard input
goes to the topmost visible overlay.

## 7. Keys

```ts
import { Key, matchesKey, parseKey } from "@cloud-pi/tui";

matchesKey(data, Key.enter);
matchesKey(data, Key.ctrl("c"));
matchesKey(data, "shift+tab");
matchesKey(data, "ctrl+shift+left");
```

`matchesKey` supports legacy VT sequences and the Kitty keyboard protocol. The
Kitty protocol can distinguish Enter / Shift+Enter / Ctrl+Enter, but requires
terminal support and is negotiated at startup; on old terminals and under tmux
it degrades. `parseKey()`, `isKeyRelease()`, `isKeyRepeat()`, and
`parseKittySequence()` are available for lower-level handling.

Component shortcuts should go through the keybindings manager instead of
hard-coded strings:

```ts
import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "@cloud-pi/tui";

const bindings = new KeybindingsManager(TUI_KEYBINDINGS, {
	"tui.input.copy": "ctrl+shift+c",
});
setKeybindings(bindings);

// Later, in handleInput:
// bindings.matches(data, "tui.input.copy")
```

`TUI_KEYBINDINGS` documents the built-in editor/input/selection actions and
their default keys. Use `setUserBindings()` to remap them at runtime, and
`getConflicts()` to detect two actions claiming the same key. Application-level
defaults (paste-image keys, pager keys, …) live in `src/app-keybindings.ts`;
that module is not part of the public barrel yet.

## 8. Themes

The theme is a process-wide singleton, exported as a live binding:

```ts
import { initTheme, onThemeChange, setTheme, theme } from "@cloud-pi/tui";

await initTheme();                 // load the default (dark/light) theme

const label = new Text("", 1, 0);
label.setStyleFn(text => theme.fg("accent", text)); // follows theme switches
label.setText("Accent text");

onThemeChange(() => tui.requestRender());
await setTheme("light");           // the listener repaints with the new colors
```

- `theme.fg(color, text)` / `theme.bg(color, text)` wrap text in ANSI codes;
  `theme.getFgAnsi()` / `getBgAnsi()` return the raw codes.
- `initTheme(enableWatcher?, symbolPreset?, colorBlindMode?, darkTheme?, lightTheme?)`
  loads the active theme and optionally starts file watching.
- `setTheme(name, enableWatcher?)` switches at runtime, `previewTheme(name)`
  applies a temporary preview, and `onThemeChange(callback)` notifies listeners.
  Theme changes do not repaint the TUI by themselves; subscribe with
  `onThemeChange` and call `tui.requestRender()`.
- `getThemeByName(name)` loads a theme object without activating it.
- Bundled themes are `dark` and `light`; custom themes load from the user theme
  directory. Color keys (accent, border, mdHeading, syntaxKeyword, …) are listed
  in `src/theme/schema-validation.ts`.
- `getMarkdownTheme()`, `getEditorTheme()`, `getSelectListTheme()`, and
  `getSettingsListTheme()` snapshot the current theme for components that take
  an explicit theme object.

Syntax highlighting is pluggable and **off by default**. `Markdown` renders
plain text until the host installs an engine:

```ts
import { setHighlighter } from "@cloud-pi/tui/theme";

setHighlighter({
	supportsLanguage: lang => lang === "ts",
	highlightCode: (code, lang, colors) => {
		// colors.keyword / comment / string / ... are ANSI SGR strings
		return myHighlighter(code, lang, colors);
	},
});
```

## 9. Images and notifications

Inline images support Kitty and iTerm2 protocols (not SIXEL):

```ts
import { readFile } from "node:fs/promises";
import { Image, theme } from "@cloud-pi/tui";

tui.setMaxInlineImages(4);
const budget = tui.imageBudget;
const bytes = await readFile("logo.png");
const image = new Image(
	bytes.toString("base64"),
	"image/png",
	{ fallbackColor: text => theme.fg("muted", text) },
	{ maxWidthCells: 40, filename: "logo.png", budget },
);
tui.addChild(image);
```

`tui.imageBudget` caps how many images render as live graphics; the rest fall
back to a text placeholder. Use the TUI's own budget: it drains the queued `a=t`
transmits each frame, and a separately constructed `ImageBudget` would emit
Kitty placements with no image data. `getImageDimensions(base64, mimeType)`
returns pixel dimensions without decoding through the terminal.

Notifications:

```ts
import { getTerminalInfo, TERMINAL_ID } from "@cloud-pi/tui";

getTerminalInfo(TERMINAL_ID).sendNotification({
	title: "Build",
	body: "Finished in 12s",
});
```

Delivery uses OSC 9, OSC 99, or BEL according to terminal capabilities, and is
routed through tmux/screen/zellij when a multiplexer would swallow it.

## 10. Debugging and testing

```bash
# Capture the raw ANSI stream written to the terminal
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log node --import ./register.mjs 01-hello/hello.ts
```

Engine hooks:

- `tui.addPaintListener(paint => ...)` observes completed paints.
- `tui.getDebugDocument()` returns the current frame as rows.
- `tui.injectDebugInput(data)` feeds bytes through the normal input path.
- `tui.addFrameWriteListener(data => ...)` sees each frame written.

Component hooks (`invalidate`, `debugState`, `debugChildren`) are used by the
repository's tests. Tests run under Vitest with a Bun shim installed by
`test/setup.ts`:

```bash
# from the repository root
npm run test -w @cloud-pi/tui        # Vitest over src/
npm run test:dist -w @cloud-pi/tui   # plain node --test against the built bundle
npm run verify                       # typecheck + build + both test suites
```

Engine and component tests live in `test/`; they run with the Bun shim and do
not need a real terminal. Demos in this directory are not part of the test
suite.

## 11. Suggested demos

A progression that exercises most of the surface. Each demo is a directory with
an entry file, matching `01-hello/hello.ts`:

1. `01-hello/hello.ts` — `Text` + `Editor`, Ctrl+C to quit.
2. `02-picker/picker.ts` — custom `Component`, cached rows, arrow-key
   navigation.
3. `03-list/list.ts` — `SelectList` + `Input` filter, focus switching.
4. `04-overlay/overlay.ts` — confirmation dialog, percentage sizing,
   narrow-terminal hiding.
5. `05-theme/theme.ts` — `setTheme`/`previewTheme`, `onThemeChange` repaint,
   styled `Text`.
6. `06-markdown/markdown.ts` — streaming `Markdown` with a custom highlighter.
7. `07-loader/loader.ts` — `Loader`/`CancellableLoader` around async work.
8. `08-image/image.ts` — `Image` with `ImageBudget` and a fallback.
9. `09-notify/notify.ts` — terminal notification after a background task.
10. `10-composer/composer.ts` — switch `setBorderStyle` between built-ins, dock
    a status chip on the `claude` top rule, register a variant.

Every demo already has a matching script in `examples/package.json`, for
example `npm run 02-picker`, which runs
`node --import ./register.mjs 02-picker/picker.ts`.

Keep each demo a single file where possible, and share a small
`createTui()` helper only when a demo would otherwise repeat the theme/terminal
setup.

## 12. Relationship to pi and oh-my-pi

`@cloud-pi/tui` is extracted from oh-my-pi's `packages/tui` (which descends from
pi). The render engine, components, themes, keys, images, and notifications are
kept close to upstream, with these deliberate differences:

- **Single `TUI` class**, no main-screen/alt-screen pair.
- **No TSP** (Tern Surface Protocol) and no native `describe()` surface.
- **No SIXEL**; Kitty and iTerm2 only.
- **No FFI or native addons**; text measurement and key parsing are pure
  TypeScript.
- **No Bun runtime**; a small shim supplies the Bun APIs the sources use, and
  the bundle injects it at build time.
- **No CLI product modules** (chat transcript, tool renderers, status line,
  setup wizard, debug server).
- **Pluggable highlighting**, with no engine shipped by default.

For the full API tour, see [../README.md](../README.md); for the file-by-file
provenance and changes, see [../PATCHES.md](../PATCHES.md).

## SVG figures

`npm run 12-svg` runs `12-svg/svg.ts`: an SVG figure is rasterized in a worker
and displayed through Kitty/iTerm2. FigureMarkdown forwards completion through
onChange; terminals without inline graphics show fenced source instead.

## Mermaid diagrams

`npm run 13-mermaid` runs `13-mermaid/mermaid.ts`: a state diagram renders through
Markdown with `markdown.onChange = () => tui.requestRender()`. Resize to exercise
layout selection. This example requires no image protocol or SVG renderer.

Both examples run from source without a build. Dispose removed components and
call closeMediaWorkers on shutdown. Custom package subpaths resolve through
`entries/components.ts`, `entries/image.ts`, `entries/notifications.ts` and
`entries/multiplexers.ts`; implementation modules remain under `src/`.
