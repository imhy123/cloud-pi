# Third-party notices

`@cloud-pi/tui` is a Node.js port of the terminal UI library shipped in
[oh-my-pi](https://github.com/can1357/oh-my-pi) (`packages/tui`,
`packages/utils`), which itself descends from
[pi](https://github.com/badlogic/pi-mono). Both are MIT-licensed.

## oh-my-pi

- Source: https://github.com/can1357/oh-my-pi
- Packages used: `packages/tui` (terminal renderer, components, themes,
  terminal capabilities) and `packages/utils` (shared runtime utilities)
- License: MIT
- Copyright (c) 2025 Mario Zechner
- Copyright (c) 2025-2026 Can Bölük
- Copyright (c) 2026 Stencil Labs, Inc.

Vendored files keep their upstream paths under `src/`, except the
`packages/utils` subset, which lives under `src/vendor/pi-utils/`. TypeScript source
files carry provenance headers naming their upstream file and commit. JSON sources
and the full inventory are recorded in [SOURCES.json](./SOURCES.json); code that
differs from upstream is listed in [PATCHES.md](./PATCHES.md) with the reason for
the change.

## pi

- Source: https://github.com/badlogic/pi-mono
- Used as: adapted source for the pure-TypeScript text and key engines
  (`visibleWidth`, `wrapTextWithAnsi`, `truncateToWidth`, `sliceWithWidth`,
  `extractSegments`, key parsing) that replaces oh-my-pi's native Rust addon
- License: MIT
- Copyright (c) 2025 Mario Zechner

## Runtime dependencies

| Package | License | Use |
| --- | --- | --- |
| `get-east-asian-width` | MIT | UAX #11 display-width tables |
| `yaml` | ISC | Keybindings/config YAML parsing and serialization |
| `jsonc-parser` | MIT | JSONC keybinding configuration parsing |
| `ignore` | MIT | Gitignore rule evaluation |
| `beautiful-mermaid` | MIT | Mermaid terminal layout in a Node worker |
| `@resvg/resvg-wasm` | MPL-2.0 | SVG-to-PNG WebAssembly renderer |
| `pngjs` | MIT | Pure JavaScript PNG decoding and whole-cell padding |

`beautiful-mermaid` includes a TypeScript port of Alexander Grooff's MIT-licensed
mermaid-ascii engine; its distribution retains that attribution. It is consumed
as an npm dependency, without copying its sources into this repository.

`@resvg/resvg-wasm` is consumed as an unmodified npm dependency. Its WebAssembly
artifact and upstream source/license are distributed by
[resvg-js](https://github.com/yisibl/resvg-js); no native addon is loaded.
