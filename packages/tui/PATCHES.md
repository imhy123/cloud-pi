# Modification log

`@cloud-pi/tui` is a Node.js port of [oh-my-pi](https://github.com/can1357/oh-my-pi),
with text and key engines derived from [pi](https://github.com/earendil-works/pi).
Both are MIT-licensed; see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## Baseline and inventory

Current baseline: oh-my-pi **v18.18.7**, commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906` (2026-11-10).
The two pi-derived engines retain pi commit `2a32a605a9f18a5f0191f65358a2e764b2f69fc7`.

[SOURCES.json](./SOURCES.json) records every file under `src/`: origin, upstream
path, commit, upstream SHA-256, and verbatim/adapted/new classification.
TypeScript provenance headers use the same classification. JSON files remain
valid JSON without comments; their provenance is recorded in SOURCES.json.
`vendor/pi-utils/` maps to `packages/utils/src/`; `vendor/package.json` maps to
`packages/utils/package.json`; other upstream files retain their TUI paths.
Import aliases in tsconfig, tsup and Vitest redirect upstream package specifiers
to local facades without changing copied imports. Such files remain verbatim.

Run `npm run audit:upstream -w @cloud-pi/tui` with sibling oh-my-pi and pi checkouts
(or set `OH_MY_PI_DIR` and `PI_DIR`). The audit compares Git objects at the pinned
commits, checks classifications and headers, and preserves original leading
comments. `node packages/tui/scripts/provenance.mjs --write` explicitly refreshes
the inventory and headers after a reviewed sync. Only the standalone
`// See PATCHES.md.` line ends a header; original comments are never stripped.

## Scope

Kept: the render loop, terminal I/O, text/input utilities, components and composer
shapes, render helpers, theme runtime, multiplexers, Kitty/iTerm2 images,
notifications, LaTeX, fuzzy/autocomplete helpers, frame-rate/spinner clocks,
row moves and the standalone motion-effects switch. Only the imported subset of
utils is vendored, with a curated barrel.

Not copied:

- `src/apps/`, `src/chat/`, `src/tools/`, `src/overlays/`, `src/setup/`,
  `src/status-line/`, `src/charts/`, `src/html-form/`: CLI product surfaces.
  `src/chat/` now retains `svg-source.ts`, `svg-figure.ts` and `figure-markdown.ts`;
  the latter omits table-chart integration.
- `src/debug-server.ts`, `src/thinking.ts`, `src/hotkeys-markdown.ts`: CLI/session
  integration and model/effort policy.
- `src/native/`, `src/sixel.ts`, `src/render/sixel.ts`: excluded protocols.
- `src/prompt/` except `image-format.ts`, `image-references.ts`, `image-source.ts`.
- `src/chrome/` except `keybinding-hints.ts`, `visual-truncate.ts`.

The retained implementation includes Input cursor placement, streaming table locks and stable
prefix APIs, tree-guide SGR fixes, Windows input timeout poll grace, and retained
utils changes (path comparison, environment isolation and logger forwarding).
It also includes the spinner clock, frame-rate ceiling, row
moves, paste framing, OSC 99 IDs, safe JSON parsing, LaTeX styling, colorful
Markdown, injected keybinding managers, editor mention hooks and settings menus.
Rex OSC 8 capability and cacheWarm/cacheCold symbols follow upstream.

## Runtime adaptations and limits

- Node.js 24+, ESM. Bun runtime, FFI, native addons, TSP and SIXEL are absent.
  Components keep terminal `render(width)`; native describe/overlay/sheet/event
  APIs are removed. Kitty/iTerm2 stay; SIXEL-only terminals use text fallbacks.
- The Bun shim is partial. Hashes differ from Bun; wyhash maps to xxHash64.
  JSONC uses jsonc-parser; YAML uses yaml. Theme validation is structural.
- Text/key parsing is pure TypeScript. Measuring, slicing, truncating and wrapping
  share terminal Jamo width settings. CSI and colon-form SGR state, including
  styled underlines and underline colors, are preserved across wraps.
- TtyWriter uses a Node worker and shared byte counters, retains FIFO/backpressure,
  retries EINTR/EAGAIN, completes short writes, and supports synchronous flush and
  bounded stop. The worker writes the supplied process-owned fd without closing it.
- Fuzzy discovery reads ancestor/nested `.gitignore` and repository
  `.git/info/exclude` rules, including negations. Cached scans expire after 1s
  (at most 16 configurations); `cache: false` rescans. Ranking remains a local
  approximation of upstream's native scorer. Discovery is capped at 200,000 entries;
  cancellation/deadlines may return partial results, which are never cached.
  Global Git excludes and linked-worktree info/exclude files are not read.
- Built-in Mermaid rendering uses beautiful-mermaid in a lazy Node worker. The
  resolver is asynchronous; custom synchronous Markdown resolvers remain supported.
  `Markdown.onChange` schedules host repaint after completion. Pending diagrams do
  not publish fallback rows as stable scrollback. Single-flight per component
  coalesces streaming edits; disposed components ignore results. Cache invalidation
  covers L1, shared L2 and streaming-prefix rows. Flowchart and top-level state
  direction overrides are supported, with redundant authored orientations skipped.
  Tests cover six output snapshots, upstream ASCII golden/cache selection cases,
  color modes, width selection, fallback and worker responsiveness.
- SVG support adapts the three reusable chat modules. `SvgFigure` and
  `FigureMarkdown` convert SVG to PNG through `@resvg/resvg-wasm` in a separate
  lazy worker, then reuse Image's Kitty/iTerm2 paths. SVGZ, aspect-ratio fitting,
  whole-cell transparent padding, theme tokens, streaming repair/throttling and
  stale-result rejection are supported; failures/no image protocol use code fallback.
  The synchronous Image component expects bitmap data; SVG uses the new interfaces.
- `setSvgFontOptions` accepts font buffers/files/directories and a default family.
  Default discovery searches common system font directories (up to 128 files,
  depth 8, 64 MiB total). Supplied buffers are copied. Use explicit font data for
  reproducible glyph selection across hosts. Fonts and WASM initialize in the worker.
- The renderer queues are independent, lazy and bounded to 32 requests each. A
  request has a 15s deadline, including queue time; worker failure rejects its queue
  and the next request starts a fresh worker. Workers have a 128 MiB JS heap limit,
  remain referenced while busy and are unreferenced when idle. `closeMediaWorkers`
  terminates outstanding work. SVG source is capped at 4 MiB (also after SVGZ
  expansion), canvases at 16 megapixels; external hrefs are not resolved. Mermaid
  source is capped at 256 KiB, 2000 lines/1000 edge markers, padding at 64 and output
  at 4 MiB; a timeout or rendering error falls back to code. Layout/syntax can differ
  from upstream Rust. The worker JS entry ships in dist; WASM is resolved from the
  installed resvg dependency, without network downloads at runtime.
- Syntax highlighting stays disabled until a host installs a highlighter.
  Windows AltGr layout discovery, Windows 8.3 path conversion and stderr fd
  redirection remain unavailable. macOS appearance detection polls `defaults`.

## Per-file local differences

Verbatim files are enumerated in SOURCES.json. Every adapted/new source file is
listed below; the reason describes the difference from its declared baseline.

| File | Kind | Reason |
| --- | --- | --- |
| `src/app-keybindings.ts` | adapted | jsonc-parser and yaml replace Bun JSONC/YAML. |
| `src/compat/bun-globals.d.ts` | new | Ambient declarations for the injected Bun shim. |
| `src/compat/bun.ts` | new | Partial Node Bun shim; Unicode Jamo width stays separate from terminal overrides. |
| `src/compat/keys-engine.ts` | adapted | pi key engine with exported ParsedKittySequence and parseKittySequence. |
| `src/compat/natives-path.ts` | new | Windows 8.3 long/short path helpers preserve their input. |
| `src/compat/natives.ts` | new | Text/key/highlighting/appearance facades, worker output pump, gitignore discovery and async SVG/Mermaid facades. |
| `src/compat/pi-agent-core.ts` | new | Structural ThinkingLevel type/value without agent runtime. |
| `src/compat/pi-ai.ts` | new | Structural image-content type without provider runtime. |
| `src/compat/text.ts` | adapted | pi-derived text engine: explicit tabs, terminal Jamo widths, CSI and colon-SGR handling. |
| `src/components/box.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/disclosure.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/editor.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/form.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/image.ts` | adapted | Removed TSP/SIXEL; retained Kitty/iTerm2 and OSC 8 paths. |
| `src/components/input.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/key-value-list.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/layout/geometry.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/layout/row.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/layout/split-pane.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/layout/stack.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/loader.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/markdown.ts` | adapted | Removed TSP; added async Mermaid results, host repaint/disposal and cache/stable-prefix handling, including whitespace before fence language labels. |
| `src/components/metric.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/progress-bar.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/scroll-view.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/section.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/select-list.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/settings-list.ts` | adapted | Removed TSP describe/native surfaces; search text is injectable for localization. |
| `src/components/spacer.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/tab-bar.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/table.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/text.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/tree-view.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/truncated-text.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/components/wizard-step.ts` | adapted | Removed TSP; replaced native sameItems with element-wise comparison. |
| `src/index.ts` | adapted | Curated library exports; no CLI/native/debug exports. |
| `src/keys.ts` | adapted | Public KeyEventType re-export for generated declarations. |
| `src/latex-block.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/prompt/image-references.ts` | adapted | Removed native link state/spans; kept terminal link markers and OSC 8 policy. |
| `src/render/code-cell.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/render/extension-links.ts` | adapted | Removed native link state/spans; kept terminal link markers and OSC 8 policy. |
| `src/render/file-list.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/render/hyperlink.ts` | adapted | Removed native link state/spans; kept terminal link markers and OSC 8 policy. |
| `src/render/index.ts` | adapted | Removed TSP/SIXEL; retained Kitty/iTerm2 and OSC 8 paths. |
| `src/render/output-block.ts` | adapted | Removed TSP/SIXEL; retained Kitty/iTerm2 and OSC 8 paths. |
| `src/render/output-pane.ts` | adapted | Removed native/SIXEL paths; replaced native Memo with local identity caching. |
| `src/render/tool-card.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/render/tree-list.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/render/width-aware-text.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/stdin-buffer.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/terminal-capabilities.ts` | adapted | Removed TSP/SIXEL; retained Kitty/iTerm2 and OSC 8 paths. |
| `src/terminal.ts` | adapted | Removed FFI, TSP and SIXEL probes; retained DA1 draining and Node input handling. |
| `src/theme/index.ts` | adapted | Added pluggable highlighting APIs and public declaration support. |
| `src/theme/schema-validation.ts` | adapted | Structural validation replaces omptype/ArkType. |
| `src/theme/shimmer.ts` | adapted | Removed TSP describe/native surfaces; terminal rendering stays upstream. |
| `src/theme/theme.ts` | adapted | Removed SIXEL-specific comment wording only. |
| `src/tmux.ts` | adapted | Removed TSP session helpers and SIXEL client detection. |
| `src/ttyid.ts` | adapted | Node /proc, readlink and ps replace ttyname FFI. |
| `src/tui.ts` | adapted | Removed native/debug/SIXEL integration; retained DA1 draining and Node terminal ownership. |
| `src/vendor/pi-utils/dirs.ts` | adapted | Default JSON import supports bundling; manifest stays at v18.18.7. |
| `src/vendor/pi-utils/index.ts` | adapted | Curated library exports; no CLI/native/debug exports. |
| `src/vendor/pi-utils/postmortem.ts` | adapted | Node exit/SIGKILL replaces reallyExit; removed worker reportError. |
| `src/vendor/pi-utils/stderr-guard.ts` | adapted | Removed FFI; fd-2 redirection remains unavailable. |
| `src/vendor/pi-utils/yaml-config.ts` | adapted | yaml package replaces Bun.YAML.stringify. |
| `src/windows-altgr.ts` | adapted | Removed user32 FFI; injectable translation remains, layout discovery is empty. |
| `src/chat/svg-figure.ts` | adapted | Worker PNG conversion, Node base64, stale-result handling, no SIXEL. |
| `src/chat/figure-markdown.ts` | adapted | SVG-only composition, async repaint callbacks and disposal. |
| `src/theme/mermaid-cache.ts` | adapted | Async single-flight cache and state width/orientation selection. |
| `src/vendor/pi-utils/mermaid-ascii.ts` | adapted | Promise-based renderer and safe fallback; removed unused `extractMermaidBlocks`. |
| `src/compat/render-worker.ts` | new | Typed rendering contracts/calls, fonts and bounded worker lifecycle. |
| `src/compat/render-worker-entry.ts` | new | Off-thread SVG/Mermaid execution with type-only imports from its companion. |

## Build, tests and notices

`tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, `scripts/`, `entries/`, `SOURCES.json`
and the local tests are package infrastructure. Custom public barrels are
`entries/components.ts`, `entries/image.ts`, `entries/notifications.ts` and
`entries/multiplexers.ts`. Their package subpaths stay unchanged; keeping them
outside src leaves upstream source paths intact. The renderer's main-thread API
and protocol live in `src/compat/render-worker.ts`; its worker entry is
`src/compat/render-worker-entry.ts`. Requests have kind-specific result types,
and only the worker boundary checks/casts the decoded reply. `test/markdown-incremental-lex.test.ts`, `test/test-themes.ts`,
`test/mermaid-cache.test.ts`, `test/mermaid-ascii.test.ts`, `test/svg-source.test.ts`
and `test/svg-figure.test.ts` are adapted from the same v18.18.7 upstream test paths
(Vitest, local imports and standard assertions). Other tests are local.
`test/compat-regressions.test.ts` covers the compatibility fixes. Tracked bundle
tests live in `test/bundle/`; the runner fails if none exist and imports every
public entry in a fresh Node process without global Bun. `npm run verify` runs
typecheck, build, source tests and bundle tests. Run the source audit separately;
it requires the upstream Git repositories. Upstream MIT notices remain intact.

Development tooling pins `rolldown` to `1.2.19` through the root npm override,
including matching platform bindings. This release fixes the Linux CPU instruction
regression in 1.2.18 ([release notes](https://github.com/rolldown/rolldown/releases/tag/v1.2.19)).
The native binding and a bundle execution check pass on an Intel Celeron J4125
without AVX; native tests run without a forced WASM environment variable.
