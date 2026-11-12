# @oh-my-pi/omptype (vendored)

Private Node.js workspace vendoring the `oh-my-pi` `packages/omptype` runtime
used by `@cloud-pi/catalog`. The original ArkType-compatible schema API,
lazy-JIT behavior, JSON Schema support, and validator tests are preserved.

- Baseline: `oh-my-pi` tag `v18.18.7`, commit `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`.
- Inventory: `src/`, the ported core tests, and JSON Schema fixtures; see `SOURCES.json`.
- Bun removal: `Bun.FormDataEntryValue` is spelled with the DOM `string | File` type.
- Tests: `test/*.test.ts` run under Vitest. `test/infer.type-test.ts` is a
  compile-time assertion file exercised by `npm run typecheck`. The upstream
  `test/ark/` compatibility matrix is not vendored; it tests the external
  ArkType package rather than this runtime.

Build: `npm run build -w @oh-my-pi/omptype`.
Tests: `npm run test -w @oh-my-pi/omptype`.
Provenance: `npm run audit:upstream -w @oh-my-pi/omptype`.
