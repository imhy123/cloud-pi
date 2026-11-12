# Modification log

Baseline: `oh-my-pi` `v18.18.7` (`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`),
`packages/omptype`. Files not listed here are verbatim copies; `SOURCES.json`
records the exact per-file hash and kind.

- `src/infer.ts`, `src/keywords.ts`: `Bun.FormDataEntryValue` replaced with the
  DOM `string | File` type.
- `test/*.test.ts`: `bun:test` replaced with `vitest`; `Bun.Glob`, `Bun.file`,
  and `Bun.argv` replaced with Node fs/argv equivalents. Assertions unchanged.
- `test/infer.type-test.ts`: renamed from `infer.test.ts` so Vitest does not
  report an empty runtime suite; the compile-time assertions are unchanged.
- `test/ark/` and the TypeBox/Zod/ArkType external matrices are not vendored.
- `package.json`: private Node.js workspace metadata replaces the Bun manifest.
