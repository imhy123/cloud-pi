# cloud-pi

A team- and device-shared coding agent: pi's core runs in the cloud, thin clients run
locally, and a session can be handed between a laptop and the cloud at any moment.

**Status: design phase.** No code yet. This document records the design as it currently
stands, including the parts that are unresolved.

---

## 1. What it is

cloud-pi is a distribution of [pi](https://github.com/earendil-works/pi) whose agent core
runs on a server you control, plus clients that talk to it. It borrows features from both
pi and [oh-my-pi](https://github.com/can1357/oh-my-pi) (a Bun-based fork with a heavier TUI
and many agent features); pi stays the base.

Three properties define the product:

1. **One environment for a team and for one person across devices.** Dependencies, credentials,
   skills, MCP servers, and the repo checkout live server-side. Nothing to set up per machine.
2. **Sessions move.** Work starts locally (`cloud-pi up` on a laptop), and you can hand the
   session to the cloud so it keeps running when you close the lid. Handing over ends local
   capability: from that point tools run on the server only.
3. **A reproducible unit of deployment: the harness.** The server image and each client binary
   are built from one declarative package set. Third parties ship skills, MCP servers, binaries,
   and config as a single signed artifact.
4. **Knowledge accumulates in one place — outside the harness.** The harness stays immutable;
   a separate memory service holds what the team learned, and each session (including a
   business-facing instance) mounts the layers it is allowed to see.

### Non-goals

- Not a new agent loop, model layer, or session format. pi provides these.
- Not a terminal-sharing service. Clients do not render a remote PTY (see §4).
- Not a multi-tenant PaaS. The deployment model is a team or an individual running one server.

---

## 2. Architecture

```
                      ┌──────────────────────────────────────────────┐
                      │  Cloud host                                  │
                      │                                              │
                      │  ┌────────────┐   stdio JSONL  ┌─────────┐ │
   WebSocket (WSS) ───┼──┤ Gateway    ├───┬────────────┤ pi --mode │ │
                      │  │ (framing,  │   ├────────────┤ rpc       │ │
                      │  │  auth, fan- │   ├────────────┤ (session) │ │
                      │  │  out, mcast)│   └────────────┤           │ │
                      │  └────────────┘                 └────┬────┘ │
                      │        │  overlay fs │ rclone/FUSE │ inject │
                      │   harness image  workspace tree  registry  │
                      └─────────────────────────────────┬─────────┘
                                                        │ mount (per profile)
                                                        ▼
                     ┌─────────────────────────────────────────────┐
                     │  Memory service (external, mutable)         │
                     │  raw layer → injected layer (promotion)     │
                     └─────────────────────────────────────────────┘

  Clients: pi-tui client · web client · electron/tauri shell (adds local tools + mounts)
```

Layers, bottom to top:

| Layer | Contents | Reused from |
|---|---|---|
| Agent core | model routing, tools, sessions, compaction, extensions | pi (unmodified, `--mode rpc`) |
| Transport | pi RPC JSONL records over WebSocket, plus a control envelope | new (~thin) |
| Session view model | events → UI state (messages, streaming, tool status, usage, context) | new, shared by all clients |
| Clients | terminal UI, web UI, desktop shell | pi-tui (terminal), new (web) |
| Harness | package format, build service, image + binary assembly | new |
| Memory | team knowledge base: summaries, lessons, runbooks | new; external service, dumb storage first |

---

## 3. Terminology

- **Harness** — one deployed unit: a server image (cloud) or a client binary (local) plus the
  packages installed into it. Identical harness definition, different target.
- **Harness package (`.hpkg`)** — the deb-like artifact: metadata, payloads (skills, prompts,
  extensions, MCP servers, binaries, config), and per-target/per-arch install rules.
- **Session** — one pi conversation, identified by its JSONL session file. UI mode is a property
  of the *process*, not the session; a session can be resumed by any client.
- **Placement** — where a tool call executes: `local` or `remote`.
- **Handover** — moving a session's placement authority from a client to the cloud (or back).
- **Memory service** — the external, mutable store of team knowledge (summaries, lessons,
  runbooks). Attached to a session at start; never part of the harness image.
- **Visibility** — the access tier of a memory layer (`team` / `org` / `external`), chosen at
  mount time. Same image, different mount profile.

---

## 4. Transport and protocol

### 4.1 Keep pi's RPC protocol as the wire format

`pi --mode rpc` speaks JSONL commands, responses, session events, and an extension-UI
request/response subprotocol over stdin/stdout. It is semantic (messages, tool calls, state
deltas), not ANSI. That is the interface cloud-pi keeps.

The gateway spawns one pi process per session, forwards JSONL lines to a WebSocket as binary
frames (never text frames — base64 would add 33% for nothing), and honors backpressure in both
directions.

Added at the gateway, not in pi:

| Concern | Approach |
|---|---|
| Auth | token or mTLS at connect; identity attached to the session |
| Multiplexing | one connection ↔ one session initially; a `session` envelope field leaves room for many |
| Resync | on reconnect: `get_state` + replay session entries to rebuild the view |
| Liveness | WS ping/pong; server keeps the pi process alive on disconnect (tmux-style) |
| Client identity/capabilities | versioned hello and acknowledged negotiation (§4.5); `cols/rows/theme/dark` remain presentation hints |

### 4.2 No PTY forwarding, deliberately

A PTY pipe (ttyd + xterm.js) would be far less work and would preserve every visual detail, but
it breaks the two things this project wants: key-echo needs a full round trip, and the client UI
is unmodifiable. Since "the terminal client must feel like local pi" is a stated goal, clients
render from semantic events.

### 4.3 What that costs: the RPC UI gap

pi's RPC mode drops UI methods that need a real terminal (`docs/rpc-extension-ui.md`):
`custom()` returns `undefined`; `setFooter`, `setHeader`, `setWorkingMessage/Indicator`,
`setEditorComponent`, `addAutocompleteProvider`, theme switching are no-ops. Extensions are
still loaded server-side — they just cannot paint.

Consequences, accepted by design:

- The client owns presentation: editor, autocomplete, dialogs, status line, spinners.
- Data the built-in footer shows is available to the client from the event stream
  (`message_update.usage`, `message_end`), so the client recomputes it. Extension intent that
  must reach the client travels through the one channel that does work: `setStatus(key, text)`
  and `setWidget(key, string[])`.
- Extensions that need rich UI must declare a client-side half. Harness packages may therefore
  ship `client/` components (see §8).

This is the single largest engineering cost in the project and the main reason a phase-1
terminal client is a real build, not a wrapper.

### 4.4 Optional third path: SSH, zero install

Between PTY forwarding and the semantic protocol sits a third transport: render a TUI
**server-side** and expose it over SSH. `@opentui/ssh` gives each incoming SSH shell its own
renderer; any team member gets the full interface with `ssh team@cloud-host` — no client
install, any terminal, any device. Layout happens on the server, but key echo still pays a
round trip, so it shares the PTY path's latency profile (§4.2) — and like PTY forwarding it
cannot carry local tools or client-side extensions.

Position: a fallback entry for people and devices without the installed client (and for
"just let me look" moments), not the primary path. It composes with §10's concerns only if
the SSH surface is gated by the same auth as the gateway.

---

### 4.5 Client identity and capability negotiation

Design proposal; the handshake below is not implemented yet. Each connection sends a gateway
`hello` before attaching to a session. It declares the client type (`tui`, `web`, `electron`,
`im`, or another registered type), application version, a separate protocol version, platform
metadata, and presentation capabilities. Application versions are diagnostic; protocol versions
and capabilities determine compatibility.

Platform metadata is structured, for example `{ "os": "linux", "arch": "x64",
"distribution": "debian", "release": "trixie" }`; `linux:x64:debian-trixie` can be derived
for display. Use explicit architecture names (`x64`, `arm64`, `ia32`) rather than ambiguous
`x86`. Browser and IM clients may not know the device OS, architecture or distribution: omit
unknown fields rather than inferring them from the gateway host. A terminal product/version,
when known, is optional diagnostic information, not proof of graphics support.

A compact declaration can use a named preset plus overrides:

```json
{
  "type": "hello",
  "protocolVersion": 1,
  "client": { "type": "tui", "version": "0.0.0" },
  "platform": { "os": "linux", "arch": "x64", "distribution": "debian", "release": "trixie" },
  "capabilities": {
    "preset": "tui-normal@1",
    "overrides": {
      "images": { "receive": false },
      "limits": { "text": { "max": 16384, "unit": "utf8-bytes" } }
    }
  }
}
```

The example limit is illustrative. Presets are immutable, versioned protocol definitions, not
names whose meaning changes with a server upgrade. Initial preset families:

| Preset | Intended presentation |
|---|---|
| `tui-normal@1` | Rich terminal UI, Markdown/code blocks, structured questions; images only when the live terminal path supports them |
| `tui-simple@1` | Text-focused terminal, plain code blocks and text questions; no inline images or rich UI assumptions |
| `im-normal@1` | Adapter-provided channel formatting, image attachments and structured replies where available |
| `im-simple@1` | Plain text and numbered/text replies; no rich formatting, image or button assumptions |

Use `tui-simple` as the canonical name rather than introducing a synonymous `tui-degrade`.
Web and Electron may use their own versioned presets or explicit declarations. Ghostty/Kitty
are candidates for `tui-normal`, but SSH, multiplexers and user settings may reduce what the
actual connection supports. Presets are defaults; probes and channel-specific restrictions
must be reflected in overrides. They never select features merely by product name.

The expanded capability schema should distinguish:

- **Media:** image upload/send and receive/display independently; supported MIME types and
  attachment/inline presentation. A file download is not the same as displaying an image.
- **Formatting:** Markdown subset, fenced code blocks, syntax highlighting, links and tables
  separately. Native IM formatting is mapped by the adapter; it need not be full Markdown.
- **Interaction:** text answers, single/multiple choice, form input and approval prompts;
  whether replies can carry request IDs and explicit cancellation. Text-only channels can use
  numbered choices, with correlation, expiry and cancellation still enforced.
- **Delivery:** streaming updates, edits to an existing message, and attachments.
- **Limits:** text length with an explicit unit (`utf8-bytes`, `unicode-code-points`, or
  `utf16-code-units`), plus attachment bytes/count and any formatting overhead. Limits are
  per delivered message, distinct from transport frame limits. The adapter enforces its
  channel's actual counting rules, splitting text or sending an attachment when appropriate.

The server expands a recognized preset, merges overrides by field (arrays replace), validates
limits and intersects the declaration with protocol support, deployment policy and adapter
constraints. It acknowledges the resolved protocol version and effective capabilities before
session events are delivered. An unknown preset/version must not silently mean “normal”: ask
for explicit capabilities, agree a known conservative preset, or reject the handshake when
required functionality has no fallback. Unknown optional fields grant no capabilities.

Capabilities belong to a connection, not to the transcript or the session's model abilities.
Different clients can view the same semantic event with different renderings. Capability changes
need an acknowledged update (or reconnect); resize/theme information can update independently.
Unsupported presentation gets a defined fallback: code as plain text, images as accessible
attachments/descriptions where available, questions as correlated text replies. If a required
approval cannot be presented safely, leave it pending or report unsupported; never auto-approve.
Client claims describe presentation, not permission to execute local tools or use credentials.

Telegram/WeChat integrations may run as server-side adapters. They still represent logical
`im` clients, with a channel identifier and adapter version separate from any known user-app
version. Negotiate per conversation/delivery target, since channel and chat modes can differ.
Report user-facing channel capabilities; keep the adapter host platform separate from the
unknown end-user device. Adapter authentication does not replace authorization of the user
and conversation it represents.

---

## 5. Clients

All clients consume the same session view model; only rendering differs.

| Client | Rendering | Notes |
|---|---|---|
| Terminal | pi-tui components (`Editor`, `Markdown`, `SelectList`) | pi-tui is a Node/Bun library; cannot run in a browser |
| Web | React (or similar), same view model | WS only; no local process |
| Desktop | electron/tauri wrapping the web view | adds local tools, mounts, keychain, notifications |
| IM | Channel messages and replies through an adapter | Telegram/WeChat-style integration; capabilities negotiated per delivery target (§4.5) |

Shared code as TypeScript packages: `protocol` (record types), `client` (command correlation,
event subscription), `view-model` (event reducer), plus per-platform renderers.

Tauri note: the core is Node/TypeScript, so a Rust front end parses the same JSONL by hand or
runs a Node sidecar. Electron gets the exported `RpcClient` almost for free (swap spawn/stdio
for a socket).

### OpenTUI as a recorded fallback, not the plan

[OpenTUI](https://github.com/anomalyco/opentui) (Zig-native core, React/Solid renderers,
flexbox, production Diff/Code/table components) is the credible alternative client stack.
If adopted, the terminal client is built on `@opentui/react` and shares React idioms and the
view model with the web client. What it costs:

- The reuse of pi's `modes/interactive` (~22k lines via the session facade) is lost: the
  terminal UI is rewritten, and "feels like local pi" (§1, goal 5) is given up.
- `engines.node >= 26.4` diverges from the core's Node 24 baseline; `.hpkg` install rules
  must carry a runtime dimension for `client` targets.

Switch only if one of these triggers fires — recorded so this is a decision, not drift:

1. Phase 0 shows the facade's UI-gap repair cost (§4.3) exceeding a from-scratch estimate.
2. The web client lands first and the team accepts losing terminal parity.

---

## 6. Sessions, placement, and handover

### 6.1 Coexistence, not two processes

A pi session file is append-only JSONL with no cross-process lock. Two processes on one file
corrupt it. So: **one session, one owning pi process, at all times.** "Local and cloud at once"
means one core plus tools routed to two places, not two cores sharing a transcript.

### 6.2 Tool placement

Each tool call carries a placement. Default placement comes from the tool's declaration in the
harness package; the session's placement authority decides what is actually allowed.

| Tool class | Typical placement |
|---|---|
| read/edit/write/grep/bash on the workspace | `remote` (workspace is server-side) |
| Auth-bound CLI (`gh`, `gcloud`, docker against a local daemon), local browser, local files | `local` |
| Anything needing the user's machine identity | `local` |

The desktop client executes `local` tools in itself and feeds results back as tool results in the
same transcript. This is a real feature boundary, not a convenience: several CLIs and auth flows
only work on the developer's machine.

### 6.3 Handover

Local → cloud:

1. Drain: no in-flight tool call; wait for `agent_settled`.
2. Reconcile files: local-only edits must reach the server workspace before the next read (§7).
3. Revocate: the session's placement authority becomes `remote`; `local` tools become
   unavailable and the client stops executing them.
4. Continue: the cloud pi process keeps the transcript; the session file never changes format.

Cloud → local is the same sequence reversed, with the additional step that the local client must
have the same harness (or a compatible one) installed, otherwise declared `local` tools are
missing. Handover should therefore verify the package set and refuse if it does not match.

Unresolved (see §11): path namespace for local-only files that already appear in the transcript,
and what happens to a `local` tool result the model later references.

---

## 7. Filesystem

Default: the workspace lives server-side; tools run there; editors see it through a mount.

| Mechanism | Use | Tradeoff |
|---|---|---|
| `rclone mount` (SFTP backend against the gateway) | browse and diff server files in VS Code / Finder | high latency for search, unreliable fs-events, no inotify → LSP and watchers degrade |
| `sshfs`/FUSE alternatives | same | same |
| Sync (mutagen/rsync/watched) | real editing with local fs semantics | needs conflict policy; two copies |
| Server-side editing over the agent, or VS Code Remote over SSH | no mount at all | requires SSH to the session's container |

Design position: **mount for review, sync or Remote for editing.** Do not pretend a remote mount
is a local disk. Diff view for a session is served from the transcript (tool results contain the
edits), which is cheaper and always correct.

---

## 8. Harness Build Service and `.hpkg`

### 8.1 The artifact

One declarative manifest, one build, several targets. Package shape, deliberately deb-like:

```
mypkg-1.4.0.hpkg
├── manifest.toml        # id, version, semver deps, signatures
├── payloads/
│   ├── skills/          # SKILL.md trees
│   ├── prompts/         # slash commands
│   ├── extensions/      # server-side pi extensions (.ts)
│   ├── client/          # client-side renderers/components (§4.3)
│   ├── mcp/             # MCP server config + vendored server
│   ├── config/          # models.json, settings, keybindings, themes
│   └── bin/             # executables
└── CONTROL              # install rules
```

Install rules in `manifest.toml` address the two axes the design needs:

```toml
[[install]]
target = ["server", "client"]     # where it goes
arch   = ["linux/arm64"]          # for binaries
path   = "bin/foo"                # payload source
mode   = "executable"

[[install]]
target = ["server"]
path   = "skills/review"
into   = "skills/"                # lands in the harness skills dir
```

### 8.2 Build service

`hbs build ./harness.toml` resolves the package graph, verifies signatures and hashes, and emits
one of:

- **Server**: a Docker image — base (pi + gateway) + installed payloads. Immutable digest;
  deploy = pull digest.
- **Client**: a self-contained binary (terminal) or app bundle (electron/tauri). Same package set,
  `target = client` only.

Immutability rules:

- A built harness records its full resolved dependency tree with content hashes (a lockfile inside
  the artifact).
- No runtime installation. The gateway mounts the image read-only.
- User customization is an overlay, never a write into the image (§9).
- Rollback = run the previous digest.

### 8.3 Memory and knowledge live outside the harness

The harness image carries **capability only** (skills, tools, MCP wiring, config). Knowledge and
memory are a separate, mutable service that sessions attach to at startup. Three layers, three
lifecycles:

| Layer | Contents | Mutability | Lives |
|---|---|---|---|
| Harness | skills, tools, MCP wiring, config | immutable, digest-pinned | image (§8.2) |
| Memory service | summaries, lessons, runbooks, recaps; raw and injected tiers | mutable, own lifecycle | external service |
| Session | transcript, tool results | append-only | session files |

Why the split is strict:

- **No immutability conflict.** Writes never go through a build. Upgrading the image by digest
  does not touch memory: it is not replayed, not versioned with the image, and its survival is
  decoupled from any harness release.
- **The mount point is the permission boundary.** A business-facing instance is the same image
  with a read-only, `external`-visibility memory layer and no development credentials; an
  internal session mounts read-write, full-visibility layers. Internal vs external service is a
  mount profile, not a second system.
- **The memory schema is an implicit API of the image.** Skills and prompts assume a memory
  shape. `.hpkg` manifests declare the memory interface they require (`[memory] api = 2`), `hbs`
  validates it at build, and the service may evolve internals while reads stay compatible.
- **Promotion lives in the service, not the build.** The raw → injected pipeline — including the
  feedback rule that entries rarely reused or frequently contradicted age out of injection — is
  internal to the memory service and has no build-time coupling to `hbs`.

Operational note: the memory service is the team's irreplaceable asset. The image can be rebuilt
from packages at any time; memory cannot be rebuilt at all. It needs backup and availability
attention even when it starts as dumb storage — SQLite is enough initially (oh-my-pi's `mnemopi`
backend is the reference shape); vector search is not a requirement until retrieval demonstrably
outgrows SQL.

---

## 9. Multi-user on one cloud

Team members connect to one server. The harness (framework, packages, skills shipped by packages)
is identical for everyone; per-user differences must not leak between users.

Two mechanisms:

1. **Identity** — user id from auth, attached to each session, recorded in session metadata, and
   the key for whose credentials a session may use. A shared `gh` token is a policy decision, not
   a technical default.
2. **Overlay filesystem** — read-only image layer + per-user writable layer:

```
   /skills         merged view
   ├── image:  harness packages (§8)      ← read-only, same for all
   └── user/<id>/skills/                  ← writable, this user only
```

Same shape for prompts, extensions, and config (`models.json`, keybindings, themes). Sessions are
already per-user by directory. Implementation options: overlayfs per session container (strong
isolation, needs privileged setup), bind-mount + search path (weak but simple — pi already
discovers resources from several directories), or a resource-loader hook (cleanest: pi's
`ExtensionContext` exposes resource paths, and resources can be re-discovered).

Recommendation: start with bind-mount + per-user directory precedence, since pi's resource
discovery is already layered, and reserve overlayfs for the container-level isolation the gateway
should have anyway for `bash`.

---

## 10. LLM access reflected to the client

Some deployments cannot reach an LLM provider from the server (air-gapped, no server-side key,
user runs a local `llama.cpp`). The client's provider endpoint must be usable by the server core.

Design: **a provider tunnel, not a protocol change.**

```
pi core → http://127.0.0.1:PORT/v1/...   (on the cloud host)
              │  reverse-tunnelled over the existing WS
              ▼
         client → localhost:8080 (llama.cpp / LM Studio / any OpenAI-compatible endpoint)
```

pi needs no new code: a model provider in `models.json` pointing at that loopback URL. The
tunnel is a gateway feature (`pi-tunnel`), and it reuses the connection already authenticated.

Notes:

- Streaming responses are long-lived; the tunnel must not buffer and must propagate abort.
- The client's credential now pays for server-initiated work. Per-session token budgets and an
  explicit "allow provider relay" toggle are required, not optional.
- Latency-sensitive: server→client→local model adds a hop per token stream. Acceptable for a
  local model; bad for a hosted one with high RTT.
- Reverse case (server key → client core) is the same code path and useful when the client is
  the one that cannot reach the provider.

---

## 11. Open questions

Deliberately not decided:

1. **Transcript contamination on handover.** Local tool results reference local paths that stop
   existing server-side. Namespace them (`local:/Users/...`), or copy them into the workspace at
   handover, or accept dangling references and let the model rediscover?
2. **Client-side extension UI contract.** §4.3 leaves `client/` payloads undefined: what API does
   a package's client half implement, and can it be sandboxed?
3. **Session concurrency limit** per user and per host: pi process per session means RAM, FDs, and
   model quota per connection.
4. **Secrets.** Where do provider keys live — client keychain, server vault, or brokered by the
   gateway at request time? Affects §10 materially.
5. **Offline mode.** Running the client's own embedded pi core without a server (same
   session files, no gateway) — cheap given the layering, but it forks behavior.
6. **Which pi to track.** Upstream pi moves; a fork has rebase cost. Preference for layering on
   pi (extensions, packages, gateway) rather than patching it.
7. **Memory promotion criteria.** What signal promotes a raw entry to the injected layer
   (reuse rate, contradiction with repo state), and how staleness is detected automatically.
   The feedback rule is the part that keeps auto-sedimented memory from becoming noise (§8.3).

---

## 12. Roadmap

Each phase ends in something usable.

**Phase 0 — protocol spike.** One client: pi-tui frontend driving `pi --mode rpc` as a child
process over stdio. No network. Proves the view model and the missing-footer problem.
*This is the highest-value-per-effort item in the plan.*

**Phase 1 — remote core.** Gateway with WS + auth + keepalive + resync; TUI client switches
transport from stdio to WS. Single user, one session per connection. Now you have remote dev.

**Phase 2 — harness.** `.hpkg` manifest, `hbs build` for the server image, install rules with
target/arch. Reproducible deploy by digest. Client binaries stay hand-built here. Memory stays
external throughout (§8.3) and can be validated standalone — an external store plus prompt
injection over plain pi — before any of the cloud exists.

**Phase 3 — placement + handover.** Local tool execution in the desktop shell, placement routing,
handover protocol with file reconciliation. Pick open question 1 here.

**Phase 4 — web client.** Same view model, React rendering. WS-only (no local tools). File
review via mount or server-side diff view.

**Phase 5 — multi-user.** Identity, per-user overlays, quotas, session listing across users.

**Phase 6 — provider tunnel.** Reverse-forward an OpenAI-compatible endpoint from client to server.

Web and handover can swap order depending on which pain is louder; handover without the desktop
shell is not possible, so Phase 3 usually pulls the electron/tauri work forward.

---

## 13. Features taken from each upstream

Base is pi. Candidates imported from oh-my-pi, kept as ideas rather than code — it is a Bun-only
fork (`engines.bun`, ~1,000 `Bun.*` call sites in its agent package, `bun:sqlite`, shipped as a
Bun-compiled single binary), so nothing ports by import:

| From oh-my-pi | Why it matters here | Port form |
|---|---|---|
| Model roles (`modelRoles`, incl. a `vision` role + `read img?q=`) | lets a text-only server model still answer image questions | setting + one routing helper |
| Idle recap + `session_recaps` journal | value when sessions outlive the person; recaps become cross-session memory | standalone extension or core |
| Memory backends (`local`, `sharpshooter`, `mnemopi`) | the external memory service's shape and discipline (§8.3) | reference + reimplement |
| Skills, `sandbox`/VM tooling, MCP runtime | matches the harness package payload types | already in pi; wire into `.hpkg` |
| Explicit history/viewport renderer contract | relevant only if the terminal client needs long-session fidelity | reference, not code |
| status-line presets, charts, sparklines | client-side presentation the RPC path cannot send | reimplement in client |

Deliberately **not** taken: Bun runtime (pi's Node base keeps the clients portable and the
terminal client must run under plain Node), TSP native backend, the heavy multiplexer
compatibility layer, and the TUI rewrite.

---

## 14. Prior art worth reading before implementing

- pi: `docs/rpc.md`, `docs/rpc-extension-ui.md`, `docs/json.md`, `docs/virtual-models.md`,
  `docs/packages.md`, `docs/sdk.md`, `docs/containerization.md`
- pi-tui: `packages/tui/README.md` (component contract, width rules, focus/IME)
- oh-my-pi: `docs/tui-core-renderer.md` (history/viewport), `src/config/model-roles.ts`,
  `src/session/idle-maintenance.ts`, `docs/memory.md` (backend shapes, injection discipline)
- Transport references: ttyd and gotty (WS-to-PTY — the design we are rejecting, useful for
  contrast), VS Code Remote (editing model in §7)
- opencode (`anomalyco/opencode`): the architecture this project targets, at production
  scale — agent core as an HTTP+SSE service with TUI/web/desktop as pure clients (the local
  TUI also connects over HTTP); `packages/client`'s service ensure/discovery/handoff and the
  identity pairing flow are the reference for `cloud-pi up`. OpenTUI (`anomalyco/opentui`)
  is its terminal library and the recorded fallback of §5.

## License

MIT
