# Third-party notices

`@cloud-pi/catalog` is a Node.js port of the
[oh-my-pi](https://github.com/can1357/oh-my-pi) `packages/catalog` (MIT),
baseline `v18.18.7`. Upstream copyright: 2025-2026 Can Bölük, 2026 Stencil Labs,
Inc. See `LICENSE`.

Bundled/vendored workspaces used by this package:

- `@oh-my-pi/pi-utils` — vendored oh-my-pi `packages/utils` (MIT).
- `@oh-my-pi/omptype` — vendored oh-my-pi `packages/omptype` (MIT).
- `@bgotink/kdl` 0.4.0 — KDL parser used by the offline rule compiler (MIT).
- `yaml` — YAML parser used by shared utility adapters (ISC).

The bundled model database (`src/models.json`) and compatibility rules
(`src/compat/rules.json`) are data derived from the pinned oh-my-pi baseline and
upstream provider metadata; they are redistributed under the same MIT terms.
