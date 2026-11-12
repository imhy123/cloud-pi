# @oh-my-pi/pi-utils (vendored)

Private Node.js workspace vendoring the `oh-my-pi` `packages/utils` dependency
closure used by `@cloud-pi/tui` and `@cloud-pi/catalog`. The package keeps the
upstream identity so retained `@oh-my-pi/pi-utils` imports resolve unchanged.

- Baseline: `oh-my-pi` tag `v18.18.7`, commit `e325ffc73ab86e03bdd20a91b77d8e2b3964c906`.
- Inventory: `src/` plus package metadata and license files; see `SOURCES.json`.
- Exclusions: unrelated upstream utilities that need native modules, process
  supervisors, prompts, or AI runtime dependencies are not part of this
  closure. The curated `src/index.ts` exports only retained modules.
- Bun removal: `src/bun-compat.ts` supplies the small Bun surface the retained
  sources use. No global Bun shim is required by built output.
- Identity: `APP_NAME`/config root are `cloud-pi` / `~/.cloud-pi`; `VERSION` and
  `USER_AGENT` keep the upstream package version so TUI behavior is unchanged.

Build (workspace order): `npm run build -w @oh-my-pi/pi-utils`.
Tests: `npm run test -w @oh-my-pi/pi-utils`.
Provenance: `npm run audit:upstream -w @oh-my-pi/pi-utils`.

## Explicit host initialization

Importing utils or catalog does not load `.env` or sanitize `process.env`.
`$env` is a live view of the existing environment. A host that wants the omp
bootstrap behavior calls this once, before reading application configuration:

```ts
import { initializeEnvironment } from "@oh-my-pi/pi-utils";

initializeEnvironment();
```

Optional `cwd`, `home`, `configDir`, and `agentDir` paths select the four dotenv
roots. Earlier files win (project, agent, config, home); existing non-empty
process values win over every file. Repeated initialization is ignored. The
TUI source-example/client preload explicitly opts in; catalog never does.

SQLite defaults to the host busy timeout (1s headless / 5s interactive).
`openSqliteDatabaseSync` retries transient BUSY/LOCKED failures at most four
attempts; hosts can override `busyTimeoutMs`, `maxAttempts`, and `retryDelayMs`.
Its initializer may be retried and must use transactions for partial writes;
external effects should not be performed inside it.
