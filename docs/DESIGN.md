# Pi Roaming Memory — Architecture and Design Specification

Status: **Accepted for phased implementation**
Implementation status: **Phases 1–6 complete; Mac and Windows smoke tested; independent backup pending**
Last revised: 2026-08-10

## 1. Decision Summary

Pi Roaming Memory is a custom Pi extension that keeps deliberately selected knowledge and semantic work checkpoints available across devices.

```text
Pi session
  │
  ├── on-demand reads ───────────────┐
  ├── approved durable writes ───────┤
  └── immutable checkpoints ─────────┤
                                      ▼
                         Obsidian Markdown vault
                         canonical synchronized state
                                      │
                                Syncthing replication
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                   Mac              Windows       Android / iPad
              Pi + Obsidian      Pi + Obsidian      Obsidian UI
                    │                 │
                    ▼                 ▼
              local SQLite FTS  local SQLite FTS
              local cache/logs  local cache/logs
```

Approved choices:

| Area | Decision |
|---|---|
| Source repository | Public Git repository |
| Current Mac source path | `/Users/intinyadev/Documents/kev/pi-roaming-memory` |
| Current Mac vault | `/Users/intinyadev/Documents/kev/si-ian` |
| Canonical memory root | `<vault>/AI Memory` |
| Device access | Mac, Windows, Android, and iPad have human read/write vault access |
| Extension runtime | Devices where Pi runs; initially Mac and Windows |
| Canonical state | Immutable Markdown |
| Replication | Syncthing |
| Search projection | SQLite FTS per Pi device |
| Vector search | Deferred until benchmark evidence |
| Durable writes | Suggest-first, explicit user approval |
| Standing instructions | Human-owned `STANDING.md`, agent read-only |
| Continuation | Semantic Checkpoint, not raw session or source synchronization |
| Dirty workspace | Hard-block automatic cross-device continuation |
| Hermes | Retained for local historical session search |
| Existing auto-handoff | Retained until shadow parity and controlled cutover |
| Syncthing versioning | Staggered, 365 days, configured on Mac and Windows |
| Independent backup | Missing; production sole-source cutover remains blocked |

## 2. Problem

Pi sessions, raw histories, and current workspaces are local to one device. Existing local memory helps historical recall but does not provide one deliberate, human-readable, cross-device source for:

- decisions and conventions;
- corrections and pitfalls;
- standing user instructions;
- active-work state;
- safe continuation into a new Pi session or another device.

Synchronizing raw session databases, SQLite indexes, or dirty source workspaces would create corruption, conflict, privacy, and correctness risks. Full-vault prompt injection would waste context and let untrusted notes steer agents.

## 3. Goals

1. Keep selected Durable Memory readable in Obsidian on every device.
2. Make synchronized Markdown sole canonical state.
3. Keep writes append-only and conflict-resistant.
4. Make retrieval explicit, scoped, cited, and token-bounded.
5. Support safe semantic continuation across sessions and devices.
6. Treat imported and retrieved content as untrusted data.
7. Rebuild every index from canonical Markdown.
8. Preserve existing Hermes and auto-handoff behavior until replacement proves parity.
9. Fail closed on invalid schemas, conflicts, trust ambiguity, and dirty cross-device workspaces.
10. Keep source public without publishing private runtime data.

## 4. Non-goals

Initial implementation will not:

- synchronize raw Pi session JSONL;
- synchronize SQLite, WAL, cache, metrics, or vector files;
- copy, stash, commit, patch, or synchronize source workspaces;
- replace Git as source-code transport;
- make Syncthing a backup system;
- provide general Obsidian automation or depend on Obsidian CLI;
- ingest every transcript automatically;
- inject full notes or full vault into model context;
- resolve semantic conflicts by timestamp;
- let agents modify `STANDING.md`;
- perform automatic mass migration from Hermes;
- remove Hermes or `pi-auto-handoff` during early phases;
- add vector retrieval before measured need;
- protect against a compromised OS account, malicious local process, compromised Syncthing peer, or malicious Obsidian plugin with arbitrary vault write access.

## 5. Sources of Truth

Authority order:

```text
Canonical Markdown bytes
  > validated Local Projection
  > cache
  > current model context
```

For user intent:

```text
current explicit user instruction
  > locally approved, valid, conflict-free STANDING.md
  > retrieved approved memory as reference data
  > model assumptions
```

Raw sessions remain historical evidence, not canonical Durable Memory. Local indexes never create, alter, or settle canonical facts.

## 6. Storage Layout

Canonical synchronized layout (partitioned by Western Indonesian Time calendar day):

```text
AI Memory/
├── README.md
├── STANDING.md
├── memories/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               └── <memory-id>.md
├── handoffs/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               └── <checkpoint-id>.md
├── tombstones/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               └── <tombstone-id>.md
├── resolutions/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               └── <resolution-id>.md
└── inbox/
    └── <human-authored Markdown>
```

Per-device runtime state:

```text
~/.pi/agent/pi-roaming-memory/
├── config.json
├── device.json
├── index.sqlite
├── index.sqlite-wal
├── index.sqlite-shm
├── standing-approval.json
├── proposals/
├── metrics.jsonl
└── logs/
```

Rules:

- Runtime state never enters Syncthing or public Git.
- `.stversions`, `.sync-conflict-*`, temporary files, symlinks, and unknown top-level directories never enter normal retrieval.
- Physical archive moves are avoided. Checkpoints older than 90 days become logically archived in projections while canonical files remain immutable.
- Fixed directory and filename segments use lowercase ASCII. Case-fold collisions make affected notes invalid.

## 7. Configuration

Config is local per Pi device because absolute vault paths differ:

```json
{
  "schemaVersion": 1,
  "vaultRoot": "/path/to/obsidian-vault",
  "memoryRoot": "AI Memory",
  "deviceIdFile": "~/.pi/agent/pi-roaming-memory/device.json",
  "indexFile": "~/.pi/agent/pi-roaming-memory/index.sqlite",
  "maxSearchResults": 8,
  "maxSearchTokens": 4000,
  "maxReadBytes": 131072,
  "enableStandingInstructions": true,
  "handoffMode": "shadow",
  "hermesFallback": true
}
```

Requirements:

- `vaultRoot` must be absolute.
- `memoryRoot` must be relative and remain inside realpath-resolved `vaultRoot`.
- No symlink may exist inside canonical memory path.
- Public config examples use placeholders, never user paths.
- Device Identity is random UUIDv4 generated locally. Never reuse Syncthing Device ID, hostname, username, or hardware serial.
- Invalid or missing config disables extension writes and standing injection while keeping actionable diagnostics.

## 8. Identity Model

### 8.1 Canonical note IDs

Use lowercase UUIDv4. IDs establish uniqueness only, not ordering.

```text
mem_<uuid>
chk_<uuid>
tmb_<uuid>
res_<uuid>
wrk_<uuid>
```

Writer generates ID before publication. Existing destination causes hard failure; no overwrite and no retry with same ID.

### 8.2 Project Identity

Git project default:

```text
prj_<sha256(normalized canonical Git remote)>
```

Normalization strips credentials, query parameters, trailing `.git`, transport differences, and case differences where host semantics permit. Raw credential-bearing remotes never enter notes or logs.

Repositories without stable remotes require explicit local mapping to user-selected Project Identity. Absolute paths never define identity.

### 8.3 Workstream Identity

First Checkpoint creates random `wrk_<uuid>`. Later Checkpoints retain it and reference one parent Checkpoint. Pi session ID and branch name are metadata, not Workstream Identity.

### 8.4 Checkpoint lineage

Head is graph-derived:

- zero children: terminal leaf;
- exactly one terminal leaf: selectable continuation head;
- multiple terminal leaves: concurrent branch conflict requiring human selection or Resolution;
- timestamps never choose head.

## 9. Canonical Schemas

All managed files use UTF-8, LF line endings, YAML frontmatter, one blank line, then Markdown body. Parser disallows custom YAML tags, executable types, unbounded aliases, duplicate keys, and unknown required-field substitutions.

Every managed object includes:

```yaml
schema: pi-roaming-memory/<type>@1
id: <typed UUID>
created_at: <RFC3339 UTC>
created_at_wib: <YYYY-MM-DD HH:mm:ss WIB; display-only>
origin_device_id: <UUIDv4>
integrity_sha256: <hex>
```

`created_at` is canonical UTC and supports display and diagnostics only. It never settles conflicts or precedence. New Notes additionally include `created_at_wib`, derived from `created_at` in `Asia/Jakarta` for human display; it never settles conflicts or precedence. Existing immutable Notes without `created_at_wib` remain valid and are never rewritten.

`integrity_sha256` covers RFC 8785/JCS canonical metadata excluding `integrity_sha256`, followed by one LF and exact UTF-8 body bytes. Integrity mismatch marks object invalid.

### 9.1 Durable Memory

```yaml
---
schema: pi-roaming-memory/memory@1
id: mem_550e8400-e29b-41d4-a716-446655440000
created_at: 2026-08-10T00:00:00Z
created_at_wib: 2026-08-10 07:00:00 WIB
origin_device_id: 4cf28a08-8c86-431a-8ad2-10cb27b56b16
kind: decision
trust: approved
scope: project
project_id: prj_<sha256>
workstream_id: null
title: Canonical Markdown storage
tags: [architecture, storage]
supersedes: []
approved_by: user
approved_at: 2026-08-10T00:00:00Z
integrity_sha256: <hex>
---

Decision body.
```

Allowed `kind` values:

```text
decision | convention | correction | pitfall | preference | reference
```

Allowed `scope` values:

```text
global | project | workstream
```

Invariants:

- `trust` for managed Durable Memory is `approved`.
- `correction` requires non-empty `supersedes`.
- Project scope requires `project_id`.
- Workstream scope requires both `project_id` and `workstream_id`.
- Referenced IDs must use expected type.
- Body must be standalone; graph edges cannot carry hidden replacement content.

### 9.2 Checkpoint

```yaml
---
schema: pi-roaming-memory/checkpoint@1
id: chk_550e8400-e29b-41d4-a716-446655440000
created_at: 2026-08-10T00:00:00Z
created_at_wib: 2026-08-10 07:00:00 WIB
origin_device_id: 4cf28a08-8c86-431a-8ad2-10cb27b56b16
project_id: prj_<sha256>
workstream_id: wrk_<uuid>
parent_checkpoint_id: null
pi_session_id: <opaque session ID or null>
repository_remote_fingerprint: <sha256>
branch: main
head_commit: <40-or-64-hex VCS object ID>
workspace_dirty: false
changed_paths: []
validation_state: checked
integrity_sha256: <hex>
---

## Goal

...

## Completed

...

## Current state

...

## Remaining

...

## Blockers

...

## Next action

...
```

Invariants:

- No raw diff, secret, `.env` content, credential, or full transcript.
- `changed_paths` contains repository-relative paths only and is size-bounded.
- Dirty Checkpoint is readable but cross-device continuation-blocked.
- Parent must belong to same Project and Workstream.
- `validation_state` is `unverified`, `checked`, or `verified`; wording must match actual evidence.

### 9.3 Tombstone

```yaml
---
schema: pi-roaming-memory/tombstone@1
id: tmb_<uuid>
created_at: <RFC3339 UTC>
created_at_wib: <YYYY-MM-DD HH:mm:ss WIB; display-only>
origin_device_id: <UUIDv4>
target_id: mem_<uuid>
reason_code: obsolete
integrity_sha256: <hex>
---

Optional non-sensitive rationale.
```

A valid Tombstone excludes exact target from usable retrieval. It does not delete bytes or automatically delete descendants.

### 9.4 Conflict Resolution

```yaml
---
schema: pi-roaming-memory/resolution@1
id: res_<uuid>
created_at: <RFC3339 UTC>
created_at_wib: <YYYY-MM-DD HH:mm:ss WIB; display-only>
origin_device_id: <UUIDv4>
conflict_ids: [mem_<uuid>, mem_<uuid>]
accepts: [mem_<uuid>]
rejects: [mem_<uuid>]
approved_by: user
approved_at: <RFC3339 UTC>
integrity_sha256: <hex>
---

Human rationale.
```

Resolution must enumerate every known terminal conflict member. Partial Resolution remains conflicted.

### 9.5 Inbox Note

Inbox accepts ordinary human Markdown. It is always `inbox` trust, never automatically indexed into normal retrieval, never treated as instruction, and never promoted by moving or editing it. Promotion creates new approved Durable Memory and preserves original Inbox Note.

### 9.6 `STANDING.md`

Required shape:

```md
# Standing Instructions

## Preferences

- ...

## Safety Rules

- ...

## Workflow

- ...
```

Rules:

- Maximum 16 KiB.
- Human-owned; roaming write interface cannot modify it.
- Built-in `write` and `edit` calls targeting it should be blocked by extension guard where Pi permits.
- Same-user arbitrary shell or local malware remains outside protection boundary.
- Each Pi device stores locally approved SHA-256.
- New or changed hash disables injection until explicit local user confirmation.
- Any `STANDING.sync-conflict-*`, invalid encoding, excessive size, duplicate heading, symlink, or parse error disables entire standing injection.
- No partial recovery and no silent merge.

## 10. Trust Model

| Trust Class | Origin | Normal search | May guide behavior | May enter system prompt |
|---|---|---:|---:|---:|
| `standing` | Locally approved `STANDING.md` hash | N/A | Yes | Yes, bounded |
| `approved` | Suggest-first approved Durable Memory | Yes | Reference only | No |
| `inbox` | Human/mobile Inbox Note | Explicit opt-in | No | No |
| `imported` | Web clip, migration, external note | Explicit opt-in | No | No |
| `conflicted` | Graph or Syncthing conflict | Diagnostics only | No | No |
| `invalid` | Schema, integrity, path, or parser failure | Diagnostics only | No | No |

Retrieved content is wrapped as quoted reference data with note ID, trust class, scope, and conflict state. Content cannot redefine tool policy, system policy, approval state, or Trust Class.

Threats addressed:

- accidental concurrent edits;
- Syncthing conflict files;
- clock skew;
- duplicate or forced IDs;
- partial writes and process crashes;
- stale/corrupt indexes;
- prompt injection through imported or retrieved notes;
- accidental secret writes;
- dirty-workspace continuation;
- path traversal and symlink escape;
- malformed YAML and oversized notes.

Threats explicitly not solved:

- compromised OS user or filesystem;
- malicious arbitrary shell process running as user;
- compromised Syncthing peer with trusted folder access;
- malicious Obsidian plugin with arbitrary vault writes;
- physical device compromise without disk encryption;
- disaster recovery before independent backup exists.

## 11. Write Interface and Atomicity

### 11.1 Read-only tool

One read-only Pi tool:

```text
shared_memory
```

Actions:

```text
search(query, scope?, project_id?, workstream_id?, tags?, limit?)
get(id)
status()
conflicts()
checkpoint_head(project_id, workstream_id?)
```

Properties:

- Default search includes only active, approved, non-conflicted Durable Memory.
- Search returns bounded snippets and citations, never full corpus.
- `get` requires exact ID and respects maximum read bytes.
- Diagnostic actions return metadata, not note bodies.

### 11.2 Restricted write tool

Separate Pi tool:

```text
shared_memory_write
```

Actions:

```text
propose_memory(candidate)
propose_tombstone(target_id, reason_code)
propose_resolution(conflict_ids, accepts, rejects)
approve_proposal(proposal_id, approved: true)
```

Suggest-first flow:

1. `propose_*` validates schema, scope, path fields, size, and sensitive-data policy.
2. Proposal is stored only in local runtime state with short expiry.
3. Tool returns exact preview, redactions, warnings, and proposal ID; vault remains unchanged.
4. `approve_proposal` requires same proposal and explicit Pi user approval (`approved: true`).
5. Headless mode without trusted interactive confirmation fails closed in initial release.
6. Approval reruns validation and sensitive-data scan before publication.
7. Success returns immutable note ID and path.

Checkpoint creation is separate operational capability. It may run automatically after semantic content is generated, but uses same validation, secret scan, atomic publisher, and integrity rules.

### 11.3 Atomic publisher

Publication contract:

1. Resolve and validate destination under canonical root.
2. Serialize deterministic UTF-8 bytes.
3. Write unique hidden temporary file in destination filesystem.
4. Flush file contents.
5. Publish to random-ID destination using platform-safe no-replace semantics.
6. Flush containing directory where platform supports it.
7. Verify final bytes and integrity hash.
8. Delete temporary file after success or safe failure.

Never overwrite destination. Platform adapter must prove no-replace behavior on macOS and Windows. Unsupported filesystems fail writes instead of weakening atomicity.

Temporary names use `.prm-tmp-<uuid>` and are ignored by scanner. Syncthing ignore rule for these names is recommended; correctness cannot depend solely on ignore timing.

Startup and periodic reconciliation remove only stale temp files created by this extension after conservative age checks. Unknown temp files are reported, not deleted.

## 12. Supersession, Tombstones, and Conflicts

Supersession forms directed acyclic graph.

Rules:

- Self-reference, cycles, missing required targets, and cross-scope-invalid edges are invalid.
- One active terminal descendant can supersede ancestor.
- Two or more unresolved terminal descendants create Conflict.
- Conflict members and contested ancestors are excluded from usable retrieval.
- Resolution explicitly chooses accepted and rejected terminal members.
- `created_at`, filesystem mtime, Syncthing order, filename, and Device Identity never select winner.
- Tombstone excludes exact target independently of timestamp.
- Concurrent duplicate Tombstones are idempotent in effect.
- Any Syncthing conflict copy associated with managed file makes that logical object conflicted until human resolution.

## 13. Search and Local Projection

SQLite FTS is Local Projection, never authority.

Indexed fields:

```text
id
schema version
kind
trust class
scope
project_id
workstream_id
title
tags
body text
created_at
origin_device_id
graph state
integrity state
canonical relative path
canonical byte hash
```

Correctness loop:

1. Full startup reconciliation.
2. Filesystem watcher for low-latency hints.
3. Periodic bounded reconciliation because watcher events can be missed.
4. Transactional projection update after complete validation.
5. Explicit `/memory-reindex` rebuild into new DB then atomic local swap.

Scanner limits:

- `STANDING.md`: 16 KiB.
- Durable Memory: 64 KiB.
- Checkpoint: 128 KiB.
- Inbox explicit read: 256 KiB.
- Maximum YAML aliases and nesting are bounded.
- Symlinks and path escapes rejected.

Ranking v1:

1. exact scope and Project Identity;
2. metadata filters;
3. FTS relevance;
4. active graph state;
5. bounded deterministic tie-breaker by ID.

Time may filter recency but cannot determine correctness.

Vector search admission gate:

- benchmark corpus and real missed queries exist;
- FTS baseline measured;
- semantic search materially improves recall;
- embedding model/version and rebuild contract documented;
- vector files remain local;
- user approves added complexity through later ADR.

## 14. Pi Lifecycle Integration

Verified Pi surfaces:

- `session_start`;
- `before_agent_start`;
- `turn_end`;
- `session_before_compact` and `session_compact`;
- `session_shutdown`;
- `ctx.getContextUsage()`;
- command-only `ctx.waitForIdle()`;
- command-only `ctx.newSession({ parentSession, setup, withSession })`;
- `pi.registerTool()` and `pi.registerCommand()`.

Rules:

- Guard missing or non-finite context percentage values. Thresholds are configurable defaults, not invariants.
- No note corpus is injected during `session_start`.
- `before_agent_start` may inject only locally approved, valid, conflict-free bounded `STANDING.md`.
- `turn_end` may detect threshold and request Checkpoint refresh, but never forces session switch.
- `session_compact` refreshes operational Checkpoint only when enabled and avoids duplicate writes.
- Session replacement occurs only from explicit command and after `ctx.waitForIdle()`.
- `ctx.newSession()` uses plain serialized data across replacement. `withSession` uses only replacement context; old `pi`, command context, SessionManager, and session-scoped resources are never reused.
- Cancellation leaves old session and Checkpoint intact.

## 15. Handoff and Continuation

### 15.1 Coexistence stages

While `pi-auto-handoff` owns `/handoff` and `/lanjut`, roaming extension uses shadow commands:

```text
/roam-handoff
/roam-lanjut
```

No duplicate command registration. No automatic double checkpoint write.

After parity approval:

1. Disable legacy command ownership explicitly.
2. Enable roaming `/handoff` and `/lanjut` ownership.
3. Keep rollback switch to restore legacy package.
4. Record cutover in later ADR.

### 15.2 Threshold behavior

Percentage defaults:

```text
handoff threshold percent: 75
handoff rearm percent: 25
```

The extension uses raw `ContextUsage.percent` from Pi. It never reconstructs percentage from token counts or model context-window metadata. First trigger occurs at `percent >= handoffThresholdPercent`; repeat trigger requires raw percent growth `>= handoffRearmPercent` since last trigger. Null or non-finite percentages do nothing. Both owner and shadow trackers reset on `session_start` and `session_compact`.

If context usage is unavailable, no automatic threshold action occurs. No repeated prompt or diagnostic is emitted.

Threshold flow:

1. Detect threshold at safe turn end.
2. Generate or request semantic Checkpoint content.
3. Validate and publish immutable Checkpoint.
4. Notify user.
5. User explicitly invokes continuation command when ready.
6. Compaction remains independent safety net.

### 15.3 Continuation validation

Before continuation:

1. Select Project and Workstream.
2. Derive unique graph head; multiple heads require human selection/Resolution.
3. Validate schema, integrity, trust, and sensitive-data constraints.
4. Match Project Identity and repository remote fingerprint.
5. Verify commit exists locally.
6. Compare checked-out commit and branch.
7. If source Checkpoint is dirty and current device differs, block.
8. If current workspace is dirty or incompatible, block unless explicit risk-accepting override.
9. Show bounded preview and evidence.
10. Wait for idle, ask confirmation, then call `ctx.newSession()`.
11. New session receives checkpoint ID and bounded kickoff; it reads note through `shared_memory`.

Manual override:

- explicit user action only;
- warning states missing code cannot be reconstructed from Checkpoint;
- logged locally without note content;
- never becomes default for Workstream.

## 16. Mobile Behavior

Android and iPad have same human vault read/write access as desktop.

Without Pi extension they may:

- read approved memories and Checkpoints in Obsidian;
- create or edit Inbox Notes;
- edit `STANDING.md` as user-owned content;
- inspect conflict files and history.

They do not directly create trusted managed notes unless a future signed mobile workflow is designed. Editing immutable managed files makes integrity validation fail. Changes to `STANDING.md` require local approval on each Pi device before injection resumes.

## 17. Sensitive Data Policy

Block durable publication when content includes:

- passwords, private keys, access tokens, session cookies, API keys, recovery codes;
- raw `.env` content;
- customer financial or payment data;
- high-confidence personal data not explicitly approved;
- credential-bearing URLs;
- raw authentication headers;
- copied full transcripts or large source dumps.

Default handling:

- internal URLs: redact unless explicitly needed and approved;
- source snippets: bounded and scanned;
- file paths: repository-relative where possible;
- PII: reject unless explicit user approval and documented purpose;
- logs: identifiers, counts, hashes, result codes, and duration only.

Secret scanning is defense in depth, not proof of absence. Preview remains mandatory.

## 18. Observability

Local structured logs and metrics only. No network telemetry.

Allowed fields:

```text
timestamp
level
action
result
duration_ms
note_type
note_id
project_id
workstream_id
result_count
returned_tokens
error_code
conflict_count
index_generation
```

Forbidden fields:

- note body or title;
- query text;
- Standing Instructions content;
- secrets or PII;
- raw Git remotes;
- raw session prompts;
- absolute private paths unless needed in local interactive error display.

Required diagnostic actions:

```text
config.validate
vault.scan
note.validate
note.publish
index.reconcile
index.rebuild
search.execute
standing.changed
standing.disabled
checkpoint.create
continuation.blocked
continuation.started
secret.blocked
conflict.detected
```

Metrics and logs retain 180 days by default.

## 19. Retention

```text
Durable Memory     until valid Tombstone
Corrections        permanent
Tombstones         permanent
Resolutions        permanent
Checkpoints        active for 90 days, then logically archived
Raw sessions       never copied into vault
Local audit data   180 days
Syncthing versions 365 days on Mac and Windows
```

Retention cleanup must never hard-delete canonical managed notes automatically.

## 20. Failure Behavior

| Failure | Required behavior |
|---|---|
| Vault unavailable | Reads report unavailable; writes fail; no alternate canonical store |
| Config invalid | Writes and standing injection disabled |
| Index missing/corrupt | Canonical notes remain safe; rebuild projection |
| Watcher misses event | Periodic reconciliation repairs projection |
| Note integrity mismatch | Mark invalid; exclude from usable retrieval |
| Syncthing conflict file | Mark conflict; exclude affected object from usable retrieval |
| Multiple Checkpoint heads | Block automatic continuation |
| Clock skew | Display odd timestamp; correctness unchanged |
| Destination ID exists | Fail without overwrite |
| Crash before publish | Final file absent; stale temp later reported/cleaned |
| Crash after publish | Final file validates; temp cleanup is idempotent |
| Secret detected | Block publication and report category only |
| `STANDING.md` changed | Disable injection until local approval |
| Dirty source Checkpoint | Block cross-device continuation |
| Pi session switch cancelled | Remain in old session; preserve Checkpoint |
| Hermes unavailable | Shared memory still works; historical fallback unavailable |
| No independent backup | Pilot warning; sole-source production gate blocked |

## 21. Rollout Phases

### Phase 0 — Contract and safety baseline

Deliver:

- accepted design and ADRs;
- public-repo hygiene rules;
- synthetic vault fixtures;
- pinned Pi, Hermes, auto-handoff, Node, and Syncthing versions;
- baseline behavior report for `/handoff`, `/lanjut`, `memory_search`, `session_search`, compaction, and context threshold;
- test matrix for macOS and Windows.

Exit criteria:

- no real vault mutation;
- schemas and threat model reviewed;
- rollback remains “uninstall/disable new package.”

### Phase 1 — Read-only deep module

Deliver:

- package skeleton;
- config loader;
- path containment and symlink rejection;
- safe parser and schema validators;
- read-only vault scanner;
- `shared_memory.status`, explicit `get`, and conflict diagnostics against fixtures;
- size, YAML, path traversal, case collision, conflict-copy, and integrity tests.

Exit criteria:

- no write capability;
- malformed fixtures cannot escape root or enter usable retrieval;
- Windows and macOS fixture tests pass.

### Phase 2 — Immutable publisher and suggest-first writes

Deliver:

- proposal store;
- sensitive-data scanner;
- preview and interactive confirmation;
- platform atomic no-replace publisher;
- Durable Memory, Tombstone, and Resolution writers;
- crash, duplicate ID, retry, concurrent write, and forced failure tests.

Exit criteria:

- no overwrite path exists;
- same proposal cannot double-publish;
- failed commit leaves no valid partial canonical note;
- `STANDING.md` cannot be targeted by write interface.

### Phase 3 — Local FTS and trust routing

Deliver:

- SQLite schema and migrations;
- full reconciliation, watcher hints, periodic reconciliation;
- atomic local rebuild and swap;
- scoped FTS search and bounded result renderer;
- graph evaluation for supersession, Tombstone, and Resolution;
- trust-class routing and prompt-injection wrappers.

Exit criteria:

- deleting all local state followed by rebuild yields equivalent searchable state;
- 1000+ synthetic notes search without vault dump;
- conflicted, invalid, inbox, and imported notes stay outside normal results;
- search respects token and byte budgets.

### Phase 4 — Standing Instructions and mobile inbox

Deliver:

- strict `STANDING.md` validator;
- per-device hash approval;
- bounded `before_agent_start` injection;
- write/edit guard where Pi permits;
- changed/conflicted/invalid fail-closed behavior;
- inbox promotion through suggest-first new-note creation.

Exit criteria:

- mobile edit disables injection until local approval;
- prompt injection in Inbox Note cannot enter system prompt;
- no Pi roaming write action can mutate `STANDING.md`.

### Phase 5 — Shadow Checkpoints

Deliver:

- Checkpoint schema and lineage;
- Project and Workstream Identity;
- `/roam-handoff` and `/roam-lanjut`;
- dirty-workspace and commit validation;
- threshold shadow metrics without automatic switching;
- clean Mac-to-Windows and Windows-to-Mac continuation tests;
- concurrent-head and clock-skew tests.

Exit criteria:

- legacy auto-handoff remains owner of existing commands;
- no duplicate automatic writes;
- dirty cross-device continuation blocks;
- new session starts only after explicit command and confirmation.

### Phase 6 — Handoff cutover

Prerequisites:

- shadow parity accepted by user;
- failure and rollback drills pass;
- no unresolved command collision;
- current auto-handoff checkpoint behavior documented.

Deliver:

- controlled command ownership switch;
- native `/lanjut` using `ctx.waitForIdle()` and `ctx.newSession()`;
- threshold and `session_compact` refresh behavior;
- legacy fallback switch;
- cutover ADR.

Exit criteria:

- `/handoff` and `/lanjut` parity passes;
- cancelled session replacement is safe;
- rollback restores legacy package without data migration.

### Phase 7 — Pilot and operational hardening

Deliver:

- low-risk real-note pilot;
- two-way Syncthing version/restore drill;
- device-loss and index-loss drills;
- metrics review;
- retention jobs for local logs and proposal cache;
- backup runbook proposal.

Exit criteria:

- no silent conflict or data loss in pilot;
- restore from Syncthing versioning proven in both desktop directions;
- unresolved production gate clearly visible.

### Deferred Phase — Independent backup and vector evaluation

Independent backup:

- choose separate backup system;
- encrypt at rest;
- define retention;
- complete restore test;
- only then allow sole-source production cutover.

Vector evaluation:

- collect real failed queries;
- benchmark FTS baseline;
- add only after later ADR proves value.

Hermes removal:

- evaluate actual fallback usage;
- prove historical-session parity or accept loss explicitly;
- migrate only selected durable items;
- require later ADR and user approval.

## 22. Acceptance Test Matrix

### Data integrity

1. Mac and Windows create notes simultaneously; both survive with unique IDs.
2. Forced destination collision fails without byte change.
3. Process dies before publish; no final note appears.
4. Process dies after publish; final note validates after restart.
5. Note body or metadata is edited; integrity failure excludes it.
6. Local index is deleted; complete rebuild restores equivalent results.
7. Watcher event is intentionally dropped; reconciliation repairs state.

### Conflict semantics

1. Two devices supersede same memory concurrently; no winner chosen.
2. Resolution accepts one branch and rejects all other terminal members.
3. Supersession cycle is rejected.
4. Tombstone hides exact target but preserves canonical bytes.
5. Device clocks differ by ±24 hours; graph result stays identical.
6. `.sync-conflict-*` appears; affected object and `STANDING.md` behavior fail closed.
7. Case-only duplicate filename appears on case-insensitive device; affected objects become invalid.

### Security and trust

1. `../`, absolute path, encoded traversal, and symlink escape fail.
2. YAML duplicate keys, custom tags, alias bomb, deep nesting, invalid UTF-8, and oversized files fail safely.
3. Secret fixture blocks proposal without logging secret.
4. Prompt injection in approved memory returns only as quoted reference data.
5. Prompt injection in Inbox Note is absent from normal search.
6. Changed `STANDING.md` is not injected until local hash approval.
7. `STANDING.sync-conflict-*` disables standing injection.
8. Attempted roaming write to `STANDING.md` fails.

### Continuation

1. Clean Checkpoint with matching Project, remote fingerprint, and commit starts new session.
2. Commit absent locally blocks continuation.
3. Project mismatch blocks continuation.
4. Dirty source Checkpoint from another device blocks continuation.
5. Dirty current workspace blocks continuation.
6. Multiple Workstream heads require human choice/Resolution.
7. `ctx.getContextUsage()` missing or raw `percent` null/non-finite causes no threshold write storm.
8. `ctx.newSession()` cancellation leaves old session usable.
9. Replacement callback uses only new context; stale old objects are tested to fail.

### Coexistence

1. Hermes `session_search` remains available.
2. One user approval creates one roaming note and zero automatic Hermes duplicates.
3. Legacy `/handoff` and `/lanjut` remain sole owners before cutover.
4. Shadow Checkpoint does not trigger session switch.
5. Rollback disables roaming handoff ownership and restores legacy commands.

### Syncthing recovery

1. Mac creates file; Windows receives it.
2. Mac replaces/deletes file; Windows archives remote version in `.stversions`.
3. Restore succeeds on Windows.
4. Repeat Windows-to-Mac.
5. `.stversions` content never enters search.

## 23. Release Gates

### Allowed now

- ADR and design work;
- package implementation against synthetic fixtures;
- local read-only scans after explicit user approval;
- synthetic Syncthing tests;
- low-risk pilot notes after write path passes tests.

### Blocked until later evidence

- autonomous Durable Memory writes;
- raw-session synchronization;
- vector dependencies;
- Hermes removal;
- deletion of canonical history;
- sole-source production use without independent backup and restore test;
- automatic cross-device continuation from dirty workspace;
- auto-forced session replacement.

## 24. Module Shape

External interface stays small:

```text
shared_memory          read-only retrieval and diagnostics
shared_memory_write    suggest-first managed mutation
/handoff               checkpoint creation after cutover
/lanjut                validated explicit continuation after cutover
/memory-status         local health summary
/memory-reindex        rebuild Local Projection
```

Internal modules:

```text
Config
Identity
VaultBoundary
CanonicalParser
SchemaValidator
Integrity
TrustRouter
GraphEvaluator
AtomicPublisher
ProposalStore
SensitiveDataGuard
ProjectionIndex
Reconciler
Search
StandingInstructions
Checkpoint
Continuation
PiAdapter
Observability
```

Only introduce an internal seam when at least two real adapters exist or platform behavior differs. `AtomicPublisher` needs macOS and Windows behavior tests; Local Projection may have persistent and in-memory test adapters. Callers and tests use same external interfaces.

## 25. Open Operational Item

Independent backup remains unresolved. Syncthing Staggered File Versioning reduces recovery risk but versions only remote changes on receiving devices and does not replace independent backup. This does not block design or implementation; it blocks treating system as sole durable production source.
