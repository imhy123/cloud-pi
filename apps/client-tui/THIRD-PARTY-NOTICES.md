# Third-party notices

The client adapts slash-command, configuration and settings-overlay code from
[oh-my-pi](https://github.com/can1357/oh-my-pi), which descends from pi.

- Baseline: `v18.18.7`, commit `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`
- Upstream directories: `packages/coding-agent/src/slash-commands/`,
  `packages/coding-agent/src/config/`, `packages/coding-agent/src/` settings
  declarations, `packages/tui/src/overlays/`
- Files: `slash-commands/types.ts`, `slash-commands/helpers/parse.ts`,
  `slash-commands/builtin-completions.ts`, `slash-commands/builtin-registry.ts`,
  `config/settings.ts`, `overlays/settings-selector.ts` and the registered
  settings metadata vendored as `src/settings/settings.json`
- License: MIT; the full upstream notice is preserved in [LICENSE](./LICENSE).
- Copyright (c) 2025 Mario Zechner
- Copyright (c) 2025-2026 Can Bölük
- Copyright (c) 2026 Stencil Labs, Inc.

Adaptations are recorded in [PATCHES.md](./PATCHES.md) and the source headers.
The welcome banner is adapted from this repository's
`packages/tui/examples/11-welcome/welcome.ts`; its source header records that
relationship. The client also consumes the separately documented
`@cloud-pi/tui` and `@cloud-pi/common` workspace packages.
