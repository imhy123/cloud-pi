# Modification log

`@cloud-pi/tui` is a Node.js port of the terminal UI shipped in
[oh-my-pi](https://github.com/can1357/oh-my-pi) (`packages/tui`, plus a subset of
`packages/utils`). oh-my-pi and its ancestor [pi](https://github.com/badlogic/pi-mono)
are MIT-licensed; see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

Baseline: oh-my-pi commit `83de60ad992d12e572ec3ed6fe2dd9e160cdc4a2`
(2026-11-03), `packages/tui/src` and `packages/utils/src`. Selected later changes
were synced from `21f1188cf88` (2026-11-09); see section 10.

This file lists every file that is **not** a verbatim copy. Verbatim copies keep
their upstream paths and contents. Files under `src/vendor/` keep their upstream
paths relative to `packages/utils/src/`; everything else keeps its upstream path
relative to `packages/tui/src/`.

## 0. Provenance headers

Every file under `src/` starts with a header comment that states whether the file
is a verbatim copy, an adapted copy, or a new file. Adapted copies name the
upstream file, the baseline commit, and the changes. The headers are documentation
only; they duplicate this log at the point of use and do not count as substantive
modifications.

To reproduce the inventory against a checkout of the baseline, strip the header
before comparing:

```sh
strip_header() {
	awk 'NR==1 && /^\/\/ cloud-pi-tui:/ {header=1; next}
	     header && /^\/\// {next}
	     header && /^$/ {header=0; next}
	     {print}' "$1"
}

diff -q <oh-my-pi>/packages/tui/src/components/text.ts \
        <(strip_header src/components/text.ts)
```

## 1. Scope of the copy

Kept: the render loop (`tui.ts`), terminal I/O (`terminal*.ts`, `active-terminal.ts`,
`stdin-buffer.ts`), text utilities (`utils.ts`), input (`keys.ts`,
`keybindings.ts`, `mouse.ts`, `bracketed-paste.ts`, `vim.ts`, `space-hold.ts`,
`kill-ring.ts`), components, render helpers, theme runtime, multiplexer adapters,
Kitty graphics, desktop notifications, and the LaTeX/fuzzy/autocomplete helpers
they depend on. `prompt/` keeps only `image-format.ts`,
`image-references.ts`, and `image-source.ts`; `chrome/` keeps only
`keybinding-hints.ts` and `visual-truncate.ts`.

Not copied (product surfaces owned by the CLI, not by a reusable TUI library):

- `src/apps/`, `src/chat/`, `src/tools/`, `src/overlays/`, `src/setup/`,
  `src/status-line/`, `src/charts/` — demos, chat transcript, tool renderers,
  selectors, setup wizard, status line, chart rendering.
- `src/debug-server.ts` — headless debug socket server (also excluded by design;
  it requires the CLI's session model).
- `src/native/`, `src/sixel.ts`, `src/render/sixel.ts` — removed entirely; see
  sections 2 and 3.
- `src/thinking.ts`, `src/hotkeys-markdown.ts` — CLI-facing presentation helpers.
- The rest of `src/prompt/` and `src/chrome/` — composer, editors, overlays,
  message frames, and other CLI-owned chrome.

`src/vendor/pi-utils/` is a subset of `packages/utils/src/` (the modules the TUI
imports). `src/vendor/pi-utils/index.ts` is a curated facade; the upstream barrel
pulls in session, worker, SQLite and stream helpers with dependencies this package
does not ship. `src/vendor/package.json` is the upstream manifest, retained because
`dirs.ts` imports `../package.json` for its version and engine fields.

## 2. Removed: Tern Surface Protocol (TSP)

TSP was an out-of-band semantic protocol: a `describe()` alternative to `render()`
for a native Tern front end, plus native overlays, sheets, screens and UI events.
All of it is removed. Components now have exactly the immutable `render(width)`
contract.

API removed from the public surface:

- `Component.describe?`, `Component.nativeOverlay?`, `Component.nativeSheet?`,
  `Component.describeScreen?`, `Component.handleNativeEvent?`
- `Container.describe`
- `describeWorkingRow` and `WorkingRowSpec`/`WorkingRowVariant`
- `describeShimmer`
- `describeOutputLines`, `NativeOutputOptions`
- `describeFileList`
- `describeOutputBlock`, `NativeOutputBlockSection`
- `describeHeader` (code cell)
- `nativeLayoutChild`, `nativeLayoutGap`, `nativeSlotProps`
- `NativeEditorLayout` and the editor's described decoration pipeline
- `prefsSectionId`, `settingPrefsRow`, `PrefsEditing`, `PrefsOptionSource`,
  `PrefsSectionRef` (native preferences editing)
- `linkedImageSpan`, `fileLinkSpan`, `isNativeLinkEnabled`
- `outputStateTone`, `outputStateStatus`
- `NativeBackend`, `NativeHost`, `assumedTspHello`, `TspFrame`, `TspNode`,
  `TspText`, `TspSpan`, `TspProps`, `TspSpace`, `TspTone`, `TspCardStatus`,
  `TspPreview`, `TspEditorDecoration`, `TspEditorProps`, `TspPrefsControl`,
  `TspPrefsRow`
- `TuiDebugServer` (debug socket integration in `TUI`)
- `setTmuxPaneApcTitles`, `tmuxSessionSpeaksTsp`

Files with non-verbatim copies for this reason:

| File | Change |
| --- | --- |
| `src/tui.ts` | Native backend selection, TSP hello probe, native overlay/sheet paint paths, `Component` native members, container `describe`, debug-server wiring |
| `src/terminal.ts` | TSP hello query/reply handling, APC→OSC rewrite for ConPTY, tmux TSP title handshake, `tspPathBlocker`, `completeTspInput`, `TSP_OSC_PREFIX` |
| `src/components/box.ts`, `disclosure.ts`, `input.ts`, `key-value-list.ts`, `layout/geometry.ts`, `layout/row.ts`, `layout/split-pane.ts`, `layout/stack.ts`, `loader.ts`, `markdown.ts`, `metric.ts`, `progress-bar.ts`, `scroll-view.ts`, `section.ts`, `select-list.ts`, `settings-list.ts`, `spacer.ts`, `tab-bar.ts`, `table.ts`, `text.ts`, `tree-view.ts`, `truncated-text.ts`, `wizard-step.ts` | `describe()` implementations, native child/slot helpers, TSP tokens |
| `src/components/editor.ts` | Described editor layout, decorations, native caret/selection nodes |
| `src/components/form.ts` | Described field tree, picker sheet, TSP span tokens on `StyledText` |
| `src/components/image.ts` | Native image node and openable-image props |
| `src/render/code-cell.ts`, `extension-links.ts`, `file-list.ts`, `hyperlink.ts`, `output-block.ts`, `output-pane.ts`, `tool-card.ts`, `tree-list.ts`, `width-aware-text.ts` | Described variants, native link spans, native rendering branches |
| `src/theme/shimmer.ts` | `describeShimmer` and the native "paint nothing" branch |
| `src/latex-block.ts` | Described LaTeX node |
| `src/prompt/image-references.ts` | Native link spans; `imageLinksEnabled` now reflects OSC 8 support only |
| `src/index.ts` | Native/debug-server exports removed; `glyph-protocol` export moved |

TSP also assumed raw input from the first frame. `TUI` and `ProcessTerminal`
therefore gained `#da1Answered` tracking: when the terminal has answered a DA1
query, a late reply arriving after the idle window is swallowed by `drainInput`
instead of surfacing as typed text (the job TSP mode used to cover).

## 3. Removed: SIXEL

SIXEL support was removed; only Kitty and iTerm2 inline images remain. Removed:

- `ImageProtocol.Sixel` and the `"sixel"` raw protocol value
- `encodeSixel`/`encodeSixelAsync`, `isWindowsTerminalPreviewSixelSupported`
- `getSixelLineMask`, `cropSixelTop`, `ensureSixelRasterWidth`
- `renderForScrollback`, `ImageOptions.requestRender`, the per-image SIXEL encode
  cache, and `uncapSixel`/`hasSixel` output-pane options
- SIXEL payload preservation in `render/output-block.ts`
- SIXEL detection in `tmux.ts` (`tmuxClientRendersSixel`)
- SIXEL probe and top-crop paths in `tui.ts`
- `src/sixel.ts`, `src/render/sixel.ts` (deleted), and the `render/sixel` barrel
  export

Affected files: `src/terminal-capabilities.ts`, `src/components/image.ts`,
`src/render/output-block.ts`, `src/render/output-pane.ts`, `src/render/index.ts`,
`src/terminal.ts`, `src/theme/theme.ts` (comments), `src/tmux.ts`, `src/tui.ts`.

Consequence: a terminal that only supports SIXEL reports no inline-image protocol
and images fall back to text placeholders.

## 4. Removed: FFI and native bindings

`@oh-my-pi/pi-natives` (a Rust addon) and `bun:ffi` are replaced by pure
JavaScript facades.

- `src/compat/natives.ts` (new): the subset of the native package the TUI calls —
  text measurement/wrapping/slicing, key parsing, syntax highlighting
  (pluggable), macOS appearance detection, `TtyWriter`, Mermaid ASCII rendering,
  and fuzzy finding.
- `src/compat/text.ts` (new): pure-TypeScript text engine — `visibleWidth`,
  `stripAnsi`, `wrapTextWithAnsi`, `truncateToWidth`, `sliceWithWidth`,
  `extractSegments`, `extractAnsiCode`, and the 3-cell tab stop.
  Based on the algorithms in `pi` (`packages/tui`), with
  `get-east-asian-width` for UAX #11 tables.
- `src/compat/keys-engine.ts` (new): pure-JS key parsing (`matchesKey`,
  `parseKey`, `parseKittySequence`, release/repeat detection, printable
  decoding).
- `src/compat/natives-path.ts` (new): Windows long/short path helpers that were
  native in oh-my-pi.
- `src/keys.ts`, `src/utils.ts`, `src/theme/tui-adapters.ts`,
  `src/theme/mermaid-cache.ts`, `src/render/render-utils.ts`,
  `src/autocomplete.ts`, `src/key-hint-format.ts`: import the compatible facades
  instead of `@oh-my-pi/pi-natives`.
- `src/windows-altgr.ts`: no `user32.dll` bindings. The injectable `AltGrHost`
  seam and translation logic remain, but `readAltGrLayer` always returns an empty
  layer, so Alt chords stay shortcuts.
- `src/ttyid.ts`: `ttyname` FFI replaced by `/proc/self/fd/0` (Linux),
  `readlink /dev/fd/0` then `ps -o tty=` (macOS/BSD), and `null` on Windows.
- `src/terminal.ts`: the `kernel32.dll` UTF-8 console-codepage guard is removed;
  Node does not require it, and Windows console-mode input falls back to the pure
  TypeScript `win32-input-mode` decoder.
- `src/components/image.ts`: no native image encode; Kitty/iTerm2 payloads are
  built in TypeScript.
- `src/vendor/pi-utils/stderr-guard.ts`: the libc `dup`/`dup2` FFI redirect is
  gone. Every guard entry point is inert, so a native library writing directly to
  fd 2 is no longer redirected away from the viewport.
- `src/theme/theme.ts` imports macOS appearance detection from the compatible
  facade (polling `defaults read -g AppleInterfaceStyle`) instead of FFI.

## 5. Bun → Node.js

Runtime baseline: Node.js 24 (LTS), which provides native `RegExp.escape` and
`Promise.try`.

The sources still reference the free `Bun` identifier (upstream targets Bun).
@cloud-pi/tui does not require a global `Bun` at runtime:

- `src/compat/bun.ts` (new) exports a shim with the APIs the vendored sources use:
  `env`, `stringWidth`, `color`, `hash` (`xxHash64`/`wyhash`/`crc32`), `stripANSI`,
  `isMainThread`, `which`, `spawn`, `spawnSync`, `sleep`, `resolveSync`, `main`,
  `file`, `inspect`, and `Glob`.
- `tsup.config.ts` injects that module for the free identifier, so the bundle
  resolves `Bun` to an imported binding. `test/setup.ts` assigns the same shim to
  `globalThis.Bun` so the TypeScript sources run unmodified under Vitest.
- The shim is intentionally partial and not byte-compatible with Bun:
  `Bun.hash`/`Bun.hash.wyhash` map to the pure-JS xxHash64 (used only for cache
  keys and directory hashes), `Bun.color` covers CSS/named/rgb/hsl and the
  `ansi-16m`/`ansi-256` formats, and `Bun.Glob` supports `*`, `**`, `?`, brace
  expansion, and character classes.

Other runtime adaptations:

| File | Change |
| --- | --- |
| `src/app-keybindings.ts` | Local JSONC parser and the `yaml` package's `parse` replace `Bun.JSONC`/`Bun.YAML` |
| `src/terminal-capabilities.ts` | `Buffer.toBase64()` replaced by `toString("base64")` |
| `src/vendor/pi-utils/dirs.ts` | JSON import with attribute: destructure the default binding (esbuild cannot see named JSON exports) |
| `src/vendor/pi-utils/yaml-config.ts` | `Bun.YAML.stringify` replaced by the `yaml` package |
| `src/vendor/pi-utils/postmortem.ts` | Bun-only `process.reallyExit` replaced with `process.exit`/`SIGKILL` |
| `src/vendor/pi-utils/stderr-guard.ts` | `bun:ffi` import removed (section 4) |
| `src/vendor/pi-utils/index.ts` | Curated facade instead of the full upstream barrel |

## 6. Removed: ArkType theme schema

`src/theme/schema-validation.ts` was rewritten. Upstream validated themes with
`@oh-my-pi/omptype` (an ArkType-compatible runtime); @cloud-pi/tui uses a structural
validator with the same purpose:

- `REQUIRED_THEME_COLORS` / `OPTIONAL_THEME_COLORS` enumerate the documented
  contract; every required key must be a string or number.
- Shape checks cover the theme's non-color fields (name, symbols, spinner
  overrides, and nested maps) that rendering consumes.
- Unknown extra properties are ignored, so themes written for newer oh-my-pi
  releases still load.
- Invalid input throws `Invalid theme: <path> must be <expected>`; callers keep
  their existing fallback-to-dark behavior.

`src/theme/theme.ts`, `src/theme/loader.ts`, and `src/theme/theme-class.ts` are
otherwise verbatim, minus the TSP/SIXEL cleanups noted above.

## 7. Local reimplementations of removed helpers

Small helpers lived under `src/native/` and were needed without TSP:

| Location | Change |
| --- | --- |
| `src/components/wizard-step.ts` | Element-wise array comparison replaces `sameItems` from `native/memo` |
| `src/render/output-pane.ts` | Local `Memo` class replaces `native/memo.Memo`; output-pane options lose the SIXEL fields |
| `src/render/extension-links.ts` | The link-marker policy no longer consults native rendering state; markers are always emitted for a registered scheme and stripped by the TUI |
| `src/prompt/image-references.ts` | `imageLinksEnabled` is the resolved OSC 8 policy |
| `src/components/image.ts` | Cache invalidation no longer has a scrollback/SIXEL branch |

No other behavior was changed. Comment-only edits (for example the
`src/theme/theme.ts` background-fallback note) are included in `diff -rq` output
but do not affect semantics.

## 8. Added modules with no upstream counterpart

- `src/components/index.ts` — public component barrel.
- `src/multiplexers/index.ts` — public multiplexer barrel.
- `src/image.ts` — image-focused entry point (component, Kitty graphics,
  terminal image helpers).
- `src/notifications.ts` — notification entry point (OSC formatting, multiplexer
  routing, desktop toasts).
- `src/compat/bun.ts`, `bun-globals.d.ts`, `text.ts`, `keys-engine.ts`,
  `natives.ts`, `natives-path.ts`, `pi-ai.ts`, `pi-agent-core.ts` — runtime
  facades described in sections 4 and 5. `pi-ai.ts` and `pi-agent-core.ts` are
  structural stand-ins for types the TUI consumes, keeping the provider client
  and agent runtime out of the dependency graph.
- `src/vendor/package.json` and `src/vendor/pi-utils/` — vendored utilities.
- `tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, `test/` — build and test
  harness, not derived from upstream.

## 9. Intentional differences from oh-my-pi

- No TSP / native Tern surface.
- No SIXEL. Kitty and iTerm2 inline images only.
- No FFI or native addon. The Windows AltGr layer is always empty; the stderr
  fd redirect is inert; macOS appearance detection shells out to `defaults`.
- Syntax highlighting is off until a host installs one with `setHighlighter`.
- No CLI product modules (apps, chat, tools, overlays, setup, status line,
  debug server).
- Bun-only globals are provided by the shim; `Bun.hash` values are not identical
  to Bun's.
- A few verbatim files still mention TSP or SIXEL in comments
  (`src/autocomplete.ts`, `src/stdin-buffer.ts`, `src/key-hint-format.ts`). No
  code path uses either protocol; the comments describe input framing and icon
  metadata that remain valid.

## 10. Upstream sync: 83de60ad99 → 21f1188cf88

The baseline above stays the reference for the TSP/SIXEL removal. Selected
upstream changes were then ported from oh-my-pi `21f1188cf88` (2026-11-09).
Files listed here carry an adapted-copy header naming that commit.

Ported:

| Area | Files | Change |
| --- | --- | --- |
| Spinner clock | `src/spinner-clock.ts` (new), `src/components/loader.ts` | One wall-clock frame shared by every spinner; a static spinner repaints once a second instead of at the frame rate; `SPINNER_ADVANCE_MS` is gone |
| Frame rate ceiling | `src/frame-rate.ts` (new), `src/tui.ts` | `tui.maxFps` converts to a minimum frame interval; terminal input echo keeps a 30fps floor |
| Row moves | `src/render/row-moves.ts` (new), `src/tui.ts` | Scrolling with `DL`/`IL` instead of repainting when the terminal has no synchronized output |
| Paste input | `src/stdin-buffer.ts` | Bracketed-paste chunks route interleaved APC paste reports, a trailing typed Enter splits from paste text, and the overlap buffer is gone |
| Windows input | `src/windows-input-mode.ts`, `src/terminal.ts` | Ctrl+J (`VK_J`) is Enter, win32 relayed strings get a 5s timeout, cooked-mode typeahead is restored |
| Terminal shutdown | `src/vendor/pi-utils/postmortem.ts`, `src/terminal.ts` | A terminal marked disconnected is declared dead so `SIGTERM`/`SIGHUP` skip the postmortem |
| OSC 99 | `src/terminal-capabilities.ts` | Notification IDs use a per-process random prefix |
| JSON parsing | `src/vendor/pi-utils/json-parse.ts` | `__proto__` keys are defined as data, not assigned |
| LaTeX | `src/latex-to-unicode.ts`, `src/latex-block.ts` | `\textnormal` resets bold/italic, radicand degree wrapping follows the caller, `\sqrt` index styling and environment foreground/background are preserved |
| Streaming Markdown | `src/components/markdown.ts` | A source ending on a lone `-` holds that line instead of flashing a setext heading; math probes strip ANSI |
| Colorful Markdown | `src/components/markdown.ts`, `src/theme/schema.ts`, `theme-class.ts`, `loader.ts`, `tui-adapters.ts`, `theme.ts`, `theme-schema.json` | Headings take `depth`, optional `strong`/`emphasis`/`tableHeader` roles, and `setMarkdownColorful` paints them from `terminal.ansi` via `Theme.ansiFg`/`Theme.faint` |
| Keybinding matchers | `src/keybinding-matchers.ts` | Matchers accept an injected `KeybindingsManager` instead of always reading the global one |
| Editor mention completion | `src/components/editor.ts`, `src/autocomplete.ts` | `setText(text, { cursor })` places the caret at the start of multi-row text; `AutocompleteProvider.trySyncModelMentionCompletion` refreshes a shown `^` mention popup synchronously, and `:` inside a mention token triggers completion |
| Settings list menus | `src/components/settings-list.ts` | The `SettingEditor` type and `menu` rows let a host open a cycling row's choices as a menu via `openSubmenuFor`, while Enter/Space still cycle |
| Kitty placeholders | `src/kitty-graphics.ts`, `src/terminal-capabilities.ts` | Tern advertises Unicode placeholders, matching its detected Kitty graphics support |
| Language detection | `src/lang-from-path.ts` | `erb` maps to the `erb` highlight/LSP language |
| Theme preview | `src/theme/theme.ts` | Dropped the write-only `previewThemeName` bookkeeping; `assignTheme` takes only the theme |

Adaptations in the ported code: TSP branches stay removed (the paste report
check is APC-only), `stripVTControlCharacters` comes from `node:util`, and the
theme loader resolves `terminal.ansi` `$var` references through the existing
`resolveVarRefs`.

Deliberately not ported: `src/thinking.ts` and other model/effort policy,
the prompt-layer model mention provider (`prompt/model-mention-autocomplete.ts`,
model browser and effort rows), the Rex terminal capability entry (OSC 8
hyperlinks), the `cacheWarm`/`cacheCold` symbols (host status-line cache
markers), and the CLI product surfaces (apps, chat, tools, overlays, setup,
status line).
