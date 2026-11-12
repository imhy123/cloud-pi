# @cloud-pi/catalog

Node.js port of `oh-my-pi` **v18.18.7** `packages/catalog`
(`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`). The bundled model database,
provider descriptors and discovery, identity/taxonomy, compatibility rules,
wire helpers, and generation scripts are preserved. See
[PATCHES.md](./PATCHES.md) for Node adaptations and [SOURCES.json](./SOURCES.json)
for the per-file inventory.

- Build: `npm run build -w @cloud-pi/catalog` (tsup, ESM + declarations).
- Tests: `npm run test -w @cloud-pi/catalog` (Vitest; 133 upstream test files plus host-injection regressions).
- Distribution: `npm run test:dist -w @cloud-pi/catalog`.
- Offline rule regeneration: `npm run gen:compat -w @cloud-pi/catalog`.
- Provenance: `npm run audit:upstream -w @cloud-pi/catalog`.

Catalog coverage is not a claim that every provider request/OAuth
implementation is connected to pi-durable; those live outside this package.
Host environment initialization is explicit: importing catalog does not load
`.env` or modify `process.env`.

### Live model generation

The CLI can use environment credentials without a host, or an explicitly
selected local ESM module that default-exports a `ModelGenerationHost` object:

```sh
npm run gen:models -w @cloud-pi/catalog -- --provider gitlab-duo --host ./host.mjs --output /tmp/models.json
```

`--host` resolves relative to the command's working directory (the catalog
workspace for `npm run -w`). Supply an absolute path when needed. The optional
hooks are `discoverAuthStorage()`, `getProviderDefinition(id)` (with an optional
`prepareModelDiscovery(config)`), and `getGitLabDuoModels()` (sync or async).
Auth handles are closed after use. See `scripts/generation-host.ts` for the
contracts. No omp AI runtime is loaded implicitly.

After `npm run build:scripts -w @cloud-pi/catalog`, programmatic hosts can import
`generateModels` from `packages/catalog/dist-scripts/generate-models.js` and call
`generateModels({ provider, host, outputPath })`. Without `outputPath`, generation
updates `src/models.json`; use a temporary output for validation. Missing hooks
fall back to environment auth and existing snapshot/seed data. Generation may
make network requests; it never runs automatically during imports or builds.
The CLI opts into dotenv initialization; programmatic hosts choose whether to
call `initializeEnvironment()` themselves.

The original upstream documentation follows.

# @oh-my-pi/pi-catalog

Model catalog for [omp](https://github.com/can1357/oh-my-pi): bundled model database, provider discovery, model identity, classification, and equivalence.

## What's inside

| Module                          | Purpose                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models.json` + `models`        | Bundled model database (pricing, context windows, modalities, thinking support)                                                                                                                                                              |
| `provider-models`               | Provider catalog descriptors (`CATALOG_PROVIDERS`), per-provider model resolution rules                                                                                                                                                      |
| `discovery`                     | Runtime model discovery for OpenAI-compatible endpoints, Gemini, Codex, Cursor, Antigravity, Ollama                                                                                                                                          |
| `compat/rules`                  | Checked-in KDL policy tree: taxonomy (classes/families/revisions), class/provider cascade rules, runtime behavior vocabulary; compiled by `npm run gen:compat -w @cloud-pi/catalog` into the committed `rules.json`                                               |
| `compat`                        | The rule engine: `classifyModel` (taxonomy), `resolveModelPolicy` (cascade), behavior accessors (`api-routes`, `model-limits`, `exclude-models`, `pricing-peer`), collapse, and OpenAI/Anthropic wire builders that consume resolved records |
| `identity`                      | Mechanical id utilities: reference resolution against the bundled index, dialects, selection priority, tokenizer families                                                                                                                    |
| `model-thinking`                | Runtime thinking helpers (`getSupportedEfforts`, effort clamping/mapping, wire-id routing) over resolved model records                                                                                                                       |
| `model-manager` / `model-cache` | Runtime model registry with discovery refresh and on-disk caching                                                                                                                                                                            |
| `wire`                          | Wire-level helpers: Codex, Gemini headers, GitHub Copilot                                                                                                                                                                                    |
| `effort`                        | Reasoning-effort level definitions                                                                                                                                                                                                           |

Import from subpaths (`@cloud-pi/catalog/<module>`) or the root barrel.

## models.json and rules.json are generated

Never edit `src/models.json` or `src/compat/rules.json` by hand. `models.json` is a compact generated catalog; use `getBundledProviders()` and `getBundledModels()` instead of reading its internal format. It is produced from upstream sources (stencil.so, provider catalog discovery, OpenCode docs) by `scripts/generate-models.ts`; `rules.json` is compiled from the KDL tree in `src/compat/rules/`. Regenerate with:

```sh
npm run gen:compat -w @cloud-pi/catalog   # KDL tree -> src/compat/rules.json (+ id unions)
npm run gen:proto -w @cloud-pi/catalog    # needs an oh-my-pi checkout for .proto inputs
```

`src/models.json` is intentionally not regenerated here: the live generator
needs an omp pi-ai auth/registry host and network discovery. The copied baseline
database is authoritative for this port.

Model- or provider-conditional policy (identity, effort ladders, wire quirks, modality/limit/pricing corrections, API routing, roster exclusions) lives in the KDL tree — see `src/compat/rules/README.md` for the grammar and axis vocabulary. TypeScript changes are only for transport mechanics: provider entries in `provider-models/descriptors.ts`, discovery/request plumbing in `provider-models/openai-compat.ts`, and generator wiring in `scripts/generate-models.ts`. Commit `rules.json` (and a rebaked `models.json` when values change) alongside the `.kdl` edit.

## Install

```sh
npm install @cloud-pi/catalog
```

Private workspace package. Builds ESM plus declarations with tsup and bundles
the retained `@oh-my-pi/pi-utils`/`@oh-my-pi/omptype` sources, so the installed
package needs no private workspace and no Bun runtime. Requires Node.js ≥ 24.

## Cost calculation

The `models` subpath (also exported from the root) provides timestamp-aware pricing helpers:

| API                                                               | Result                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `calculateCost(model, usage, timestamp?)`                         | Updates and returns `usage.cost` using `model.cost`.                                                      |
| `calculateUsageCost(cost, usage, timestamp?)`                     | Updates and returns `usage.cost` using a `ModelCost`.                                                     |
| `calculateUncachedInputCost(cost, promptInputTokens, timestamp?)` | Returns the cost of a fully uncached prompt.                                                              |
| `getEffectiveTokenCost(cost, timestamp?)`                         | Returns the base card in force: the latest due effective rate, else the row's own legs.                   |
| `getTimeBasedPricingPeriod(cost, timestamp?)`                     | Returns `"peak"`, `"off-peak"`, or `undefined` without a recurring tariff.                                |
| `hasRecurringTariff(schedule)`                                    | Whether a `TimeBasedCost` carries a peak/off-peak tariff rather than only dated rate cards.               |
| `getNextTimeBasedPricingTransition(cost, timestamp?)`             | Returns the next actual peak/off-peak change strictly after the timestamp, or `undefined` if none exists. |

Timestamps are Unix milliseconds; omitted timestamps use the current time for scheduled pricing. Flat token prices are unaffected. Pricing selects the latest applicable effective rate card, then its long-context tier, then the peak/off-peak multiplier. A transition query concerns the recurring tariff, not dated rate-card changes.

`ModelCost.timeBased` is optional typed metadata (`TimeBasedCost`): `offPeakMultiplier`, `peakWindows` (UTC `weekdays`, Sunday = 0, and start-inclusive/end-exclusive `startMinute`/`endMinute`), and optional `effectiveRates`. Each effective rate is a complete `TokenCost` with an `effectiveFrom` Unix-millisecond timestamp and optional `longContext` tier, replacing the base card from that instant. A schedule with no peak windows at a 1x off-peak multiplier has no recurring tariff, only dated rate cards: `cost-patch`/`cost-fallback` `effective-rates` compile to one, so a row built before a scheduled price change still prices later requests at the new card.

Pass the request-start timestamp when estimating request usage, then preserve the resulting monetary amounts rather than repricing history at display time. OMP does this using the assistant message timestamp; it is an estimation convention, not a claim about server billing across boundaries. Prefer monetary costs reported by a provider when available.

Schedules are materialized from the [`time-based-cost` KDL axis](src/compat/rules/README.md#time-based-pricing); this does not add a `timeBased` input field to the coding agent's `models.yml`. See [user-facing pricing behavior](../../docs/models.md#usage-costs-and-time-based-pricing) for DeepSeek rates, dates, and footer indicators.

## References

- [Monorepo README](https://github.com/can1357/oh-my-pi#readme)
- [CHANGELOG](./CHANGELOG.md)
