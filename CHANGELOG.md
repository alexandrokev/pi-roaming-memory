# Changelog

## 0.6.2 — 2026-08-10

### Handoff UX parity (owner)

- `/handoff` with no draft → agent followUp: summarize session, then `publish_checkpoint` to vault (legacy pi-auto-handoff UX, vault stays canonical store)
- `shared_memory_write` action `publish_checkpoint`: agent-authored checkpoint, auto-committed (`confirmed: true, autoCommit: true`) — intentional because user intent = `/handoff` or system threshold; still no STANDING writes
- Context threshold (~150k) now triggers same followUp instead of notify-only; `session_compact` refresh followUp (reason `post-compact`)
- Pending cwd binding so agent need not pass cwd to `publish_checkpoint`
- `/handoff` with substantive `## draft` sections publishes immediately (unchanged); empty/default-only template falls through to agent path
- Tests: handoff-instruction parse/substance/instruction, publish_checkpoint tool path via temp git repo

## 0.6.1 — 2026-08-10

### Fixes

- Canonical body normalization: hash and on-disk body share leading blank-line form (`normalizeCanonicalBody`)
- `commitProposal` verifies integrity before publish (fail closed on mismatch)
- YAML scalar quoting for ambiguous strings (`null`, bools, numeric-looking, dates) so serialize→parse preserves types
- Tests: propose→commit→scan approved for memory/checkpoint/tombstone/resolution; adversarial scalar roundtrip; tamper rejected

## 0.6.0 — 2026-08-10

### Cutover (owner mode)

- `/handoff` and `/lanjut` registered when `handoffMode: owner`
- Threshold notify in owner mode; shadow mode keeps legacy auto-handoff ownership
- `/memory-approve-standing`, `/memory-reindex`, `/memory-status`
- ADR note: cutover is local-config driven; rollback = `handoffMode: shadow` + reinstall `pi-auto-handoff`

## 0.5.0 — 2026-08-10

### Shadow checkpoints

- Checkpoint builder from git snapshot
- Continuation validator (project, remote fingerprint, commit, dirty cross-device block)
- `/roam-handoff`, `/roam-lanjut` in shadow mode

## 0.4.0 — 2026-08-10

### Standing + inbox trust

- Per-device STANDING.md hash approval
- Fail-closed on conflict copies / invalid shape
- `before_agent_start` bounded injection when approved

## 0.3.0 — 2026-08-10

### FTS projection

- Local SQLite FTS via `node:sqlite`
- Rebuild/swap index; eligible-only search
- Graph-aware retrieval exclusion

## 0.2.0 — 2026-08-10

### Suggest-first writes

- Proposal store, sensitive-data scanner
- Atomic create-only publisher
- `shared_memory_write` tool
- Tombstone + resolution proposals

## 0.1.0 — 2026-08-10

### Read-only deep module

- Config, vault boundary, parser, integrity, schema, scanner
- `shared_memory` status/list/get/conflicts/search
- Supersession graph evaluation

## 0.0.1 — 2026-08-10

### Design baseline

- DESIGN.md, CONTEXT.md, ADR 0001–0008
- Phase 0 pins, fixtures, hygiene
