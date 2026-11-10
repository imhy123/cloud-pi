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
`packages/utils` subset, which lives under `src/vendor/pi-utils/`. Every source
file carries a provenance header naming its upstream file and commit; code that
differs from upstream is listed in [PATCHES.md](./PATCHES.md) with the reason for
the change.

## pi

- Source: https://github.com/badlogic/pi-mono
- Used as: reference implementation for the pure-TypeScript text engine
  (`visibleWidth`, `wrapTextWithAnsi`, `truncateToWidth`, `sliceWithWidth`,
  `extractSegments`, key parsing) that replaces oh-my-pi's native Rust addon
- License: MIT
- Copyright (c) 2025 Mario Zechner

## Runtime dependencies

| Package | License | Use |
| --- | --- | --- |
| `get-east-asian-width` | MIT | UAX #11 display-width tables |
| `yaml` | ISC | Keybindings/config YAML parsing and serialization |
