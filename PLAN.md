# Plan: shared omp utilities and a complete Node.js catalog port

## 1. Purpose and authorization

This document is an implementation handoff for another agent. The current task
is to write this plan only. Do not interpret it as a request to commit changes.

The user has selected the following direction:

1. Move the shared omp utility implementation currently vendored inside
   `packages/tui` into `packages/vendor/omp`, so TUI and catalog share one copy.
2. Port the complete omp `packages/catalog` into cloud-pi's `packages/catalog`,
   preserving its provider coverage, catalog data, KDL rules, and behavior.
3. Support plain Node.js and JavaScript/TypeScript consumers. Do not introduce
   Bun as a required runtime, a native addon, FFI, or TSP/SIXEL dependencies.
4. Preserve accurate provenance, manifests, licenses, and migration notes.

This is **phase one** of provider integration. Future user configuration files
are fixed as:

- Client: `~/.cloud-pi/client/models.yml`
- Server: `~/.cloud-pi/agent/models.yml`

Their format must match omp, rather than a new cloud-pi KDL user configuration
format. Implementing those loaders, credential flows, the Models bridge, and
provider execution is outside this handoff's implementation scope. Preserve
catalog APIs needed to implement them later.

## 2. Background and source of truth

cloud-pi is an npm monorepo with Node.js >=24. It currently has TUI, common,
client-tui, and server workspaces. `apps/server` pins pi-ai and pi-durable to
1.5.2. TUI is a Node port of omp and already contains adapted utility sources.

Local repositories:

- cloud-pi: `/mnt/data/project/js/cloud-pi`
- omp: `/mnt/data/project/js/oh-my-pi`
- pi: `/mnt/data/project/js/pi`

The omp baseline is **tag `v18.18.7`**, commit
`e325ffc73ab86e03bdd20a91b77d8e2b3964c906`. Resolve and verify the tag before
copying. Read files with `git show <baseline>:<path>` where practical; do not
silently copy a newer working tree. Do not change the upstream checkout.

Read root `AGENTS.md` and any applicable nested instructions first. Preserve
pre-existing user changes: at planning time the root `README.md` and
`README_cn.md` were already modified. Reinspect the working tree before work;
this observation is not permission to overwrite or restore those files.

### What catalog does, and what it does not do

omp catalog contains the bundled model database, provider descriptors and
model discovery, identity/taxonomy, model construction, thinking capabilities,
pricing, compatibility rules, wire helpers, and discovery caching.

Its KDL tree is a maintained policy source compiled into `rules.json`; it is
not the user's `models.yml` configuration syntax. The compiled model database
`models.json` and compiled rules are versioned upstream artifacts.

Catalog alone does not implement every provider's authentication and model
request execution. Some special model managers are assembled in omp's
coding-agent, and request/OAuth implementations live in omp's AI package.
Preserving catalog coverage must not be reported as verified end-to-end
provider support. Do not migrate omp AI or coding-agent wholesale to conceal
this boundary.

## 3. Architectural decisions

### 3.1 Physical layout and workspace identities

Use this layout:

```text
packages/
  vendor/
    omp/
      pi-utils/
        package.json
        src/
        test/
        SOURCES.json
        README.md
        README_cn.md
        PATCHES.md
        PATCHES_cn.md
        THIRD-PARTY-NOTICES.md
        LICENSE
      omptype/
        package.json
        src/
        test/
        SOURCES.json
        README.md
        README_cn.md
        PATCHES.md
        PATCHES_cn.md
        THIRD-PARTY-NOTICES.md
        LICENSE
  catalog/
    package.json
    src/
    scripts/
    test/
    SOURCES.json
    README.md
    README_cn.md
    PATCHES.md
    PATCHES_cn.md
    THIRD-PARTY-NOTICES.md
    LICENSE
```

Keep internal vendor package names `@oh-my-pi/pi-utils` and
`@oh-my-pi/omptype`. Mark them private. This allows retained upstream imports
to resolve without rewriting every source file, and prevents an accidental
publication under upstream names. Give catalog the cloud-pi package identity
`@cloud-pi/catalog`.

The existing root glob `packages/*` does not discover these nested vendor
packages. Add explicit workspace entries for both nested package directories;
do not assume the container `packages/vendor` is itself a package. Do not add
a second workspace with either vendor package name. Replace upstream
`catalog:` dependency specifiers with valid local npm workspace version
references, following this repository's version conventions. Regenerate the
lockfile using npm rather than editing dependency records manually.

A nested workspace is compatible with the monorepo: physical nesting does not
create a dependency relationship. Package identities and declared dependencies
determine resolution. Keep the graph acyclic:

```text
omptype       Node-only utility primitives
   \                 /
        pi-utils
        /      \
      tui     catalog
```

This is a dependency boundary, not a requirement to make omptype depend on
utils. Neither vendor package may depend on TUI or catalog.

### 3.2 Utility migration scope

Move the **existing adapted** TUI utility sources first; do not overwrite them
with pristine upstream versions. Their current differences are intentional
Node adaptations and regression fixes.

Then add the transitive utility surface required by the complete catalog.
Inventory all imports, including subpaths, before choosing the facade exports.
This phase centralizes the dependency closure of TUI + complete catalog; it
does not require implementing unrelated omp utility features that bring in
native tooling. List retained and excluded utility source modules explicitly.
Do not claim that a curated dependency closure is the entire upstream utils
package.

Keep a curated, side-effect-conscious root barrel. Extending it for catalog
must not eagerly initialize SQLite, write logs, mutate unrelated environment
variables, or activate process handlers for a TUI importing only formatting
helpers. Importing catalog itself must not initiate network discovery or write
files. Explicit operations may perform documented work.

### 3.3 TUI-specific exceptions to utility relocation

The current `vendor/pi-utils/mermaid-ascii.ts` imports the TUI's
`@oh-my-pi/pi-natives` rendering adapter. Moving it unchanged into a generic
workspace would leave an unresolved dependency or create a reverse edge.

Move that adapted rendering facade into TUI's `src/compat/mermaid-ascii.ts` and
update `src/theme/mermaid-cache.ts` to import it locally. Preserve worker-backed
rendering, direction handling, fallback behavior, and lifecycle guarantees.
Keep its upstream utils provenance even though its new local directory is
`compat`; directory name must not force its provenance to `new`.

The current `dirs.ts` also imports `@oh-my-pi/pi-natives/path`. Replace that
small path operation with an equivalent Node implementation in the vendor
utility boundary; share a Node primitive if necessary. Do not make utils
resolve a path inside TUI, and do not register a fake native package merely
to satisfy this import.

Audit every moved file for similar backedges. Do not move the SVG/Mermaid
worker implementation or TUI compatibility shims into utils as incidental
scope expansion.

### 3.4 omptype

Catalog uses omptype in common pricing, manager, cache, and OpenAI-compatible
discovery code, so deleting individual provider rules would not eliminate it.
Vendor its required runtime source with the original structure and behavior.
Its upstream package has no declared runtime dependencies, but audit imports
rather than assuming that makes it automatically Node-compatible.

Known examples of Bun-only typing include `Bun.FormDataEntryValue` in
`keywords.ts` and `infer.ts`; use the appropriate Node/web platform types.
Inspect enum/syntax use and generated validator behavior. Do not add
`@types/bun`, blanket ambient declarations, or casts that hide missing runtime
features. Keep schema semantics and meaningful upstream validator tests.

### 3.5 Source imports versus JavaScript distribution

Use explicit package exports for root and imported subpaths. Do not rely only
on TypeScript `paths`: those do not implement Node runtime resolution.

Provide built ESM JavaScript and declarations for catalog and the internal
vendor workspaces. Default Node resolution must use JavaScript output and must
not need the TUI example loader, a global Bun shim, or experimental Node flags.
Retained extensionless upstream imports are acceptable inside bundled input;
all emitted JavaScript must resolve under normal Node ESM rules. Preserve the
upstream files and subpath APIs used by consumers; build entries accordingly.

Source-based TUI/client/example workflows must still run without a preliminary
build. Keep narrowly scoped source mappings in their loader and test/build
configuration, pointing to the new shared location. A `source` export
condition can be used where a tool actually enables it, but must not be
mistaken for a default Node feature.

For the existing standalone TUI distribution, bundle the required private
vendor modules, with explicit `noExternal`/alias configuration as needed.
Verify both JavaScript and declaration output: neither may require the old
vendor path or unpublished source files. The same requirement applies if
catalog is distributed without its private vendor workspaces. Test an isolated
package installation, not only resolution from the monorepo root.

## 4. Preflight audit and baseline

Before editing:

1. Record branch/status, Node/npm versions, exact upstream commit, and existing
   verification results. Dependencies may be installed.
2. Read TUI's current `SOURCES.json`, provenance script, modification tables,
   source loader, build/test configs, and private vendor package metadata.
3. Enumerate the complete catalog baseline: source, KDL rules, JSON artifacts,
   scripts, tests, fixtures, docs, and licenses. Preserve upstream attributions.
4. Enumerate utility/omptype dependency closure, with runtime versus type-only
   imports and module-initialization side effects.
5. Record a baseline of bundled providers/models and representative policy
   resolutions. Derive counts from the baseline rather than hard-coding counts
   from this plan.

Representative files already identified:

- `packages/tui/tsup.config.ts`
- `packages/tui/vitest.config.ts`
- `packages/tui/tsconfig.json`
- `packages/tui/examples/ts-loader.mjs`
- `packages/tui/examples/tsconfig.json`
- `apps/client-tui/tsconfig.json`
- `packages/tui/scripts/provenance.mjs`
- `packages/tui/scripts/test-dist.mjs`
- `packages/tui/src/vendor/pi-utils/index.ts`
- `packages/tui/src/vendor/pi-utils/dirs.ts`
- `packages/tui/src/vendor/pi-utils/mermaid-ascii.ts`
- `packages/tui/src/vendor/package.json`

Use repository-wide `rg` searches; this list is not exhaustive.

## 5. Execution stages

### Stage A: relocate and stabilize shared vendor code

1. Create the nested workspaces and move the existing adapted utility files.
2. Replace the copied metadata under `tui/src/vendor/package.json` deliberately.
   `dirs.ts` currently imports `../package.json`; the new package metadata must
   retain every custom field it reads, not merely name and version. Separate
   upstream baseline metadata from cloud-pi host identity if needed.
3. Add catalog-required utility modules and the omptype workspace. Preserve
   behavior; implement Node equivalents for the reachable Bun operations.
4. Move the Mermaid facade into TUI compatibility code as described above.
5. Update every resolver surface: TS paths, tsup aliases, Vitest aliases,
   source loader, worker paths where relevant, tests, scripts, docs, manifests,
   and explicit package dependencies.
6. Keep upstream `@oh-my-pi/pi-utils` imports unchanged where package resolution
   suffices. If an alias remains, ensure it points to this one shared source.
   Exact root/subpath aliases must not shadow each other incorrectly.
7. Verify TUI before adding catalog. No duplicate old utility tree should remain.

Do not let the old provenance writer rewrite headers automatically before its
classification rules have been corrected. It currently infers utility origin
from `vendor/pi-utils/` and treats `compat/` files as new. Both assumptions
change in this migration.

### Stage B: port complete catalog runtime and data

Copy the baseline catalog source and artifacts, preserving layout and coverage.
Do not drop difficult providers or disable tests to make the package pass.

Known runtime adaptation areas:

- `model-manager.ts`: environment/identity utilities and Bun-specific operations.
- `model-cache.ts`: `bun:sqlite`, SQLite utility adapter, hashing and corruption
  handling. Check bound parameters, transactions, statement return shapes,
  cache migration, close behavior, concurrent refreshes, and recovery.
- `compat/collapse.ts`: deep equality.
- `provider-models/openai-compat.ts`: zstd decompression, environment reads,
  identity headers, and network discovery.
- `provider-models/special.ts`, `provider-models/cache-provider-id.ts`,
  `wire/factory-droid.ts`: scoped cache identifiers and hashes.
- `discovery/gitlab-duo-workflow.ts`: environment reads.
- utils fetch/TLS integration: retain custom CA, cancellation, and retry
  semantics using Node-supported mechanisms; never disable TLS verification.

Node 24 supplies SQLite and zstd APIs, but verify availability on the declared
minimum version. Do not validate only with this machine's newer Node version
and assume all Node 24 releases behave identically. Document any actual
minimum-version adjustment instead of silently requiring Node 26.

Replacing Bun hashes changes cache fingerprints. Use deterministic hashing,
invalidate/version affected cache formats, and document this. It is unnecessary
to preserve an old Bun cache byte-for-byte, but secret-scoped caches must remain
correctly isolated. Do not print credentials or hash inputs in diagnostics.

Preserve catalog policy and model structures. Do not convert them to pi-ai's
narrower types inside catalog. Do not interpret arbitrary compat fields as
implemented provider behavior in pi-ai.

New cloud-pi cache/log/identity files must not be silently written into `~/.omp`
or a source checkout. Use explicit host paths/options or a documented cloud-pi
cache location. Keep utility relocation from unexpectedly changing existing
TUI identity/version behavior. Future client/agent `models.yml` paths remain
configuration paths, not cache databases.

### Stage C: port generation tooling

1. Keep all KDL source strata, compiler modules, and schema/axis validation.
2. Port filesystem/entrypoint APIs from Bun to Node; use `@bgotink/kdl` at the
   baseline dependency version unless a demonstrated compatibility issue
   requires otherwise.
3. Provide a Node command to regenerate `rules.json` and generated provider/auth
   IDs. Require deterministic output matching the baseline semantics.
4. Preserve the bundled `models.json`; do not refresh it from today's network
   sources during migration. Migration parity is against the pinned baseline.
5. Port model/protocol generation tooling where possible. Some model-generation
   paths import omp AI authentication/registry helpers. Keep such dependencies
   explicit and host-injected or adapt the narrow required interface; do not
   add the entire Bun AI runtime as a hidden development dependency.
6. A live refresh requiring credentials is an optional, documented command,
   never a build/install/test prerequisite. Separate pure/offline generation
   from network/auth orchestration. If a live generator cannot be completed
   within this boundary, report the precise remaining limitation; do not claim
   the complete toolchain is done or delete its source to hide it.
7. Preserve generated protobuf/wire data and the relevant generation scripts;
   do not introduce a native runtime dependency to use those artifacts.

### Stage D: tests, provenance, documentation, and integration

Port upstream catalog tests to Vitest with their substantive assertions intact.
Replace Bun-specific mocking, subprocess, and fixture helpers appropriately.
Distinguish isolated catalog tests from integration tests that import omp AI,
OAuth, or native modules. Adapt narrow collaborators/fixtures; do not import the
entire upstream app to run catalog tests. Document any uncovered boundary.

Update root scripts so vendor and catalog builds run in dependency order and
`npm run verify` actually covers the new packages. The existing root `build`
only builds TUI: adding catalog without updating orchestration is insufficient.
Avoid invoking scripts on the non-package vendor container. Make package-local
build/test/typecheck commands available and document prerequisite builds.

Root workspace test/typecheck commands must discover the nested workspaces.
Keep TUI-specific distribution tests and add catalog distribution tests.
Do not change unrelated application features, default ports, provider settings
UI, or existing root README design sections as incidental work.

## 6. Provenance, manifests, and licenses

Each workspace owns an authoritative `SOURCES.json` for the files it contains.
Use the established TUI fields where applicable:

- local file path;
- `kind`: `verbatim`, `adapted`, or `new`;
- origin repository and upstream source path;
- full baseline commit;
- SHA-256 of the exact original upstream content;
- a concrete modification explanation for adapted/new files.

Define and document inventory roots clearly. Include copied JSON/KDL artifacts,
fixtures, generation sources, and other upstream assets in their respective
inventory or an explicitly documented companion section. JSON stays comment-free.
For an original file with an added provenance header, compare the body against
the upstream original when determining whether it remains verbatim.

For moved TUI utilities:

1. Transfer each authoritative record from TUI's manifest to the vendor manifest.
2. Retain its original source path, commit, upstream hash, and existing patch
   explanation. Moving a file is not grounds to invent a new upstream origin.
3. Remove obsolete TUI-owned records and update TUI documentation to link the
   new owner. Do not double-count the same file in two authoritative inventories.
4. Keep the TUI-owned Mermaid facade's source as upstream
   `packages/utils/src/mermaid-ascii.ts`, with updated adaptation notes.
5. Classify replacement package metadata separately from retained upstream
   metadata; the old `vendor/package.json` cannot vanish from the inventory
   without explaining its removal/replacement.

Every retained/migrated TypeScript source gets a truthful provenance header.
Use bilingual PATCHES documents to explain Node adaptations, ownership moves,
new wrappers, cache-version changes, and intentionally unsupported unrelated
utility exports. Document all departures from the baseline. Read and preserve
actual upstream license/copyright notices; do not synthesize an incomplete
copyright list.

Audit tooling must detect missing/stale records, orphan inventory entries,
incorrect source paths, invalid headers, and upstream hash mismatches. It must
work after relocation without relying on a machine-specific absolute path.
Allow an upstream repo override and check against the pinned commit rather than
the current upstream HEAD. Keep checks read-only by default; any writer must
preserve hand-written adaptation explanations.

English README/PATCHES files are authoritative; update Chinese counterparts
with the same examples, exports, inventories, limitations, and commands.

## 7. Required verification

### Resolution and distribution

- Clean `npm install`/`npm ci` recognizes both nested vendor workspaces.
- Exactly one local workspace exists for each upstream vendor package name.
- Direct vendor and catalog imports work in plain Node without TUI bootstrap.
- Root and subpath imports resolve in TS, tests, source examples, built output,
  and worker processes.
- TUI source examples/client still need no preliminary package build.
- Built TUI and catalog pass an isolated installed-package smoke test with no
  source tree aliases or upstream repository available.
- Emitted JS/declarations contain no references to old TUI vendor paths,
  unresolved private sources, `bun:*`, or undeclared dependencies.
- Generic vendor packages have no TUI/catalog backedges. A real circular
  dependency is not excused by typechecking through aliases.

### Catalog parity and runtime behavior

- Baseline provider/model identifiers and coverage are retained.
- Offline KDL regeneration is deterministic and preserves compiled semantics.
- Identity, cascade priority/ambiguity handling, thinking, limits, pricing,
  model construction, overrides, and representative wire helpers pass parity
  tests across common and unusual providers.
- Mocked dynamic discovery covers success, malformed responses, cancellation,
  failure fallback, offline mode, cache TTL, and credential/endpoint isolation.
- SQLite cache round trips, expiry/invalidation, reopen, and corruption handling
  work with Node. Tests use temporary directories and clean them up.
- No default import triggers real provider calls or writes to the user's home.
- Complete catalog data is not mistaken for a claim that all request/auth
  implementations are connected to pi-durable.

### Existing TUI and applications

- Existing TUI tests, typecheck, build, and built-package tests pass.
- SVG/Mermaid worker and WASM distribution tests continue to pass.
- Mermaid direction/fallback and asynchronous rendering remain intact.
- Source-loader/client startup and Ctrl+C cleanup still work.
- No terminal formatting/key/render behavior changes are introduced by moving
  utility files. No duplicate process handlers appear through barrel imports.

### Commands and final audit

Run package-local checks while iterating, then the final integrated commands:

```sh
npm run typecheck
npm run build
npm run test
npm run test:dist -w @cloud-pi/tui
npm run verify
npm run audit:upstream -w @cloud-pi/tui
# Also run the new vendor/catalog provenance checks and catalog dist tests.
git diff --check
```

The final command set should be documented using the actual scripts added.
Run the supported minimum Node version when available; clearly report any
version not exercised. Run an offline regeneration comparison and audit every
resolver/config reference to `src/vendor/pi-utils` and `vendor/package.json`.
Historical migration documentation may mention old paths; active code must not
resolve through them.

## 8. Completion report and non-goals

The executing agent should report:

- actual package layout and dependency graph;
- inventory totals and baseline commit;
- Node adaptations and remaining differences;
- commands run and their results, including baseline failures;
- provider/catalog coverage, and any unverified live discovery paths;
- generator limitations, if any, without overstating completion;
- confirmation that no unrelated user edits were overwritten and no commit
  was created.

Do not implement the following as part of this phase:

- models.yml loading in client/server, or migrating existing settings storage;
- new KDL syntax for user settings;
- client/server provider synchronization or credential transmission;
- full omp AI/OAuth/request-runtime migration or the pi-durable Models bridge;
- port 10240 changes (previously discussed, but not part of this task);
- changes to `.gitignore` for the local demo directory;
- remote publication, deployment, or a Git commit.

The result should make the next phase possible without repeating the utility
extraction: one shared Node utility boundary, a faithful complete catalog port,
and independently verifiable provenance and package behavior.
