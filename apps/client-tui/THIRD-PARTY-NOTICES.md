# Third-party notices

The client adapts four slash-command files from
[oh-my-pi](https://github.com/can1357/oh-my-pi), which descends from pi.

- Baseline: `v18.18.7`, commit `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`
- Upstream directory: `packages/coding-agent/src/slash-commands/`
- Files: `types.ts`, `helpers/parse.ts`, `builtin-completions.ts`, `builtin-registry.ts`
- License: MIT; the full upstream notice is preserved in [LICENSE](./LICENSE).
- Copyright (c) 2025 Mario Zechner
- Copyright (c) 2025-2026 Can Bölük
- Copyright (c) 2026 Stencil Labs, Inc.

Adaptations are recorded in [PATCHES.md](./PATCHES.md) and the source headers.
The welcome banner is adapted from this repository's
`packages/tui/examples/11-welcome/welcome.ts`; its source header records that
relationship. The client also consumes the separately documented
`@cloud-pi/tui` and `@cloud-pi/i18n` workspace packages.
