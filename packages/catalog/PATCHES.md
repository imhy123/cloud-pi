# Modification log

Baseline: `oh-my-pi` **v18.18.7**, commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`, package `packages/catalog`.
[SOURCES.json](./SOURCES.json) is the authoritative per-file inventory: origin,
upstream path, commit, upstream SHA-256, and verbatim/adapted/new classification.
Every TypeScript file carries a matching header. JSON and KDL artifacts carry no
comments; their hashes are in the inventory.

Run `npm run audit:upstream -w @cloud-pi/catalog` with a sibling `oh-my-pi`
checkout (or `OH_MY_PI_DIR`). It is read-only unless `--write` is passed.

## Runtime and build

- `package.json`: cloud-pi identity, Node 24 engines, tsup/Vitest scripts, and
  workspace dependencies replace the upstream Bun manifest.
- `src/model-cache.ts`: `node:sqlite` through the vendored adapter replaces
  `bun:sqlite`; deterministic SHA-256-prefix hashes replace `Bun.hash`; the cache
  schema is v16 and the materialization policy is v2 so old Bun-hashed rows are
  invalidated.
- `src/model-manager.ts`: deterministic hash and `merge-v6` fingerprint.
- `src/provider-models/openai-compat.ts`: `process.env` for environment reads and
  `node:zlib` `zstdDecompressSync` for zstd response bodies.
- `src/provider-models/cache-provider-id.ts`, `src/provider-models/special.ts`,
  `src/wire/factory-droid.ts`: `process.env` and the deterministic hash.
- `src/compat/collapse.ts`: `node:util` `isDeepStrictEqual` replaces
  `Bun.deepEquals`.
- `src/discovery/gitlab-duo-workflow.ts`: `process.env`.
- `src/discovery/protobuf.ts`: `Buffer` base64 replaces `Uint8Array.toBase64`.
- `src/provider-models/google.ts`: dropped the global `fetch.preconnect`
  fallback; Node has no preconnect API.
- Build: tsup emits ESM plus declarations for the root, documented subpaths, and
  every `src/**` module. `@oh-my-pi/pi-utils` and `@oh-my-pi/omptype` are bundled
  from workspace source, so `dist/` is self-contained apart from Node built-ins.
- No default import performs network discovery, writes files, loads dotenv, or
  mutates the host environment. Source hosts opt into `initializeEnvironment`.

## Generation tooling

- `scripts/compile-compat.ts`, `scripts/compat-compiler/index.ts`: Node fs and
  `fileURLToPath` replace `Bun.write`, `Bun.file`, and `import.meta.dir`. Offline
  `rules.json`, `auth-ids.ts`, and `provider-ids.ts` regeneration is deterministic.
- `scripts/generate-protocols.ts`, `scripts/proto-parser.ts`: `fs.globSync` and
  Node fs read/write replace Bun glob/file APIs. The protocol generator still
  expects an upstream `oh-my-pi` checkout for its `.proto` inputs; that input
  tree is not part of cloud-pi, so it is preserved but not exercised here.
- `scripts/generate-models.ts`: Node argv/fs replace Bun APIs. The exported
  `generateModels({ provider?, host?, outputPath? })` accepts optional credential,
  discovery-preparation, and GitLab model hooks defined in `generation-host.ts`.
  CLI `--host` loads a local ESM default export; invalid hooks fail before
  generation. Missing hooks use environment credentials and snapshot/seed
  fallback instead of throwing stub errors. CLI startup explicitly initializes
  dotenv; programmatic calls leave environment initialization to their host.
  Live generation is not a build/test prerequisite. `buildGeneratedModel` and
  `mergePreviousSnapshotModels` remain available to catalog tests.
- `bench/classify.bench.ts`: `performance.now()` replaces `Bun.nanoseconds()`.
- `scripts/test-dist.mjs` and `scripts/provenance.mjs` are new cloud-pi tools.

## Tests

- 133 isolated upstream tests run under Vitest in `test/*.test.ts`. Changes are
  mechanical: `bun:test` → `vitest`, `Bun.env` → `process.env`, `Bun.write`/
  `Bun.file` → Node fs, `Bun.serve` → a Node `http` helper, `bun:sqlite` →
  the vendored `Database` adapter, `Bun.deepEquals` → `isDeepStrictEqual`, and
  `@oh-my-pi/pi-catalog/*` → `@cloud-pi/catalog/*`. Assertions are preserved.
- `test/helpers/http-server.ts` and `test/helpers/vitest-clock.ts` are new.
- `test/generation-host.test.ts`: injected credentials/preparation, auth handle
  cleanup, async GitLab hooks, no-host fallback, isolated output and CLI host loading.
- `test/compat-parity.test.ts`: a 30s per-test budget for the complete catalog
  traversal; all parity assertions remain intact.
- 26 upstream integration tests moved to `test/integration/` and are excluded
  from Vitest and from the package tsconfig. They import the upstream
  `@oh-my-pi/pi-ai` request/registry/OAuth runtime, which cloud-pi does not
  vendor. They remain as reference coverage for a future host and are not
  claimed as passing.
- `test/discovery-null-limits.test.ts` no longer asserts Bun's per-request
  `tls.ca`; Node applies `NODE_EXTRA_CA_CERTS` at process start, and the test
  asserts discovery leaves TLS to Node.

## Generated data and licenses

- `src/models.json`, `src/compat/rules.json`, `src/compat/auth-ids.ts`,
  `src/compat/provider-ids.ts`, `src/discovery/cursor-proto.ts`, and
  `src/discovery/devin-proto.ts` are copied from the pinned baseline, not
  refreshed from live sources. The generated `.ts` identities and protocol
  codecs are headerless machine output so regeneration stays byte-identical;
  their provenance is recorded in `SOURCES.json`.
- `LICENSE` and `CHANGELOG.md` are copied verbatim. `README.md` keeps the
  upstream content with a cloud-pi Node port section.
