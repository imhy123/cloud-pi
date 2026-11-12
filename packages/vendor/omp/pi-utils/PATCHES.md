# Modification log

Baseline: `oh-my-pi` `v18.18.7` (`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`),
`packages/utils`. Files not listed here are verbatim copies; `SOURCES.json`
records the exact per-file hash and kind.

- `index.ts`: curated facade over the TUI + catalog closure instead of the full
  upstream barrel.
- `dirs.ts`: package manifest read through the default JSON binding; `APP_NAME`
  and the default config root are `cloud-pi` / `.cloud-pi`; the Windows path
  helper is local (`natives-path.ts`) instead of `@oh-my-pi/pi-natives`.
- `env.ts`: `process.env` replaces `Bun.env`. Dotenv loading, environment
  sanitization, and directory refresh run only through the explicit, idempotent
  `initializeEnvironment(options?)` host bootstrap. Imports leave the environment
  untouched. `index.ts` exports the bootstrap and its path options.
- `sqlite.ts`: rewritten around `node:sqlite`; only the catalog model-cache
  surface is retained (open/initialize, corruption recovery, error classification).
  Connections restore the host busy timeout (1s headless / 5s interactive);
  open/initialization retries BUSY/LOCKED up to four attempts with bounded
  exponential pauses. `busyTimeoutMs`, `maxAttempts`, and `retryDelayMs` allow
  host overrides. Native lock shims, WAL checkpoint and salvage helpers remain
  omitted. Persistent contention is rethrown, never treated as corruption.
- `tls-fetch.ts`: pass-through `wrapFetchForExtraCa`; Node's TLS layer applies
  `NODE_EXTRA_CA_CERTS` at process start.
- `fetch-retry.ts`: upstream retry/hint logic; the Bun-only `timeout` request
  extension is accepted and ignored.
- `temp.ts`: `Bun.gc`/`Bun.sleep`/`Bun.sleepSync` use Node fallbacks.
- `postmortem.ts`, `sanitize-text.ts`, `tab-spacing.ts`, `test-runtime.ts`,
  `which.ts`, `worker-host.ts`: Bun globals come from `bun-compat.ts`.
- `stderr-guard.ts` and `yaml-config.ts`: unchanged Node adaptations carried
  over from the TUI vendor tree.
- `bun-compat.ts`, `natives-path.ts`: new Node shims.
- `mermaid-ascii.ts` is not part of this package: it depends on TUI's native
  rendering facade and lives in `@cloud-pi/tui` `src/compat/mermaid-ascii.ts`.

Hash-sensitive cache formats: `catalog` fingerprints were versioned after
replacing `Bun.hash` with deterministic SHA-256 prefixes.

## Regression coverage

- `test/env.test.ts`: import purity, opt-in loading, precedence, sanitization,
  and idempotent bootstrap. Source examples/client opt in at their preload.
- `test/sqlite.test.ts`: native lock waiting, worker contention/retry success,
  bounded persistent BUSY failure, and corruption recovery. Empty test suites
  no longer pass silently.
