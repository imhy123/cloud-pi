# AGENTS.md

## Project

cloud-pi is an experimental project built on [pi](https://github.com/earendil-works/pi)
and [oh-my-pi](https://github.com/can1357/oh-my-pi): a team- and device-shared
coding agent whose core runs in the cloud. The design lives in
[README.md](./README.md).

`@cloud-pi/tui` (in `packages/tui`) is a Node.js port of the terminal UI shipped
in oh-my-pi (`packages/tui` plus the subset of `packages/utils` that the TUI
imports). oh-my-pi itself descends from pi. The package is an early,
research-phase part of cloud-pi.

## Repository layout

- `packages/*` — workspace packages; `packages/tui` is `@cloud-pi/tui`.
- `apps/*` — workspace applications.
- `demo/` — research demos, outside the npm workspaces.

## Migration policy

- Migrate as much of oh-my-pi's TUI as possible, keeping upstream file paths,
  structure, and behavior. Prefer adapting an upstream file over rewriting it.
- Every file under `packages/tui/src/` starts with a provenance header stating
  one of: verbatim copy, adapted copy (upstream path, baseline commit, and
  changes), or new file. Keep the header accurate whenever the file's status
  changes.
- Do not reintroduce Bun runtime dependencies, FFI, native addons, TSP
  (Tern Surface Protocol), or SIXEL. The package must run on plain Node.js; text
  measurement and key parsing stay in pure TypeScript.
- Keep `packages/tui/src/` as close to upstream as practical. Explanatory notes
  and demo-only changes belong in examples, tests, or documentation, not in the
  copied sources.

## License

oh-my-pi and pi are MIT-licensed. Keep upstream copyright notices and
[THIRD-PARTY-NOTICES.md](./packages/tui/THIRD-PARTY-NOTICES.md) intact. Every
file that differs from upstream must be described in
[PATCHES.md](./packages/tui/PATCHES.md) with the reason for the change.

## Documentation

English `README.md` and `PATCHES.md` are the sources of truth. Edit them first,
then update `README_cn.md` and `PATCHES_cn.md` so both languages stay in sync.
Keep examples, export tables, and file lists identical across languages.

## Commits

The project is in its initial stage. Do not commit after completing a task
unless the user explicitly asks for a commit. Do not ask whether to commit
either.

## Commands

Run from the repository root:

```sh
npm install
npm run typecheck   # typecheck every workspace package
npm run test        # test every workspace package
npm run verify      # typecheck + build + tests (currently @cloud-pi/tui only)
```

The root `build`, `example`, and `test:dist` scripts target `@cloud-pi/tui`
specifically; use `-w @cloud-pi/tui` to address the package directly:

```sh
npm run build -w @cloud-pi/tui   # tsup (ESM + d.ts)
npm run test -w @cloud-pi/tui    # Vitest over src/
npm run test:dist -w @cloud-pi/tui
```

### Examples

The demos under `packages/tui/examples` resolve `@cloud-pi/tui` from `src/`, so
no build or package install is required:

```sh
npm run example -- 08-image   # from the repository root
npm run 08-image              # from packages/tui/examples
```
