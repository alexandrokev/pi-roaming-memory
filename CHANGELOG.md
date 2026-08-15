# Changelog

## Unreleased

### Compact propose nudge (status mode)

- New config key `memoryProposeNudgeMode`: `status` (default) shows a one-line footer notice (key `roaming-memory-propose`) when the periodic propose review is due — no synthetic transcript message, no forced agent turn. `followUp` restores the legacy multi-line review follow-up for automatic review at the cost of transcript clutter.
- Stale propose status cleared on session start, before the next agent run, and on compaction; propose turn counter resets on session start and compaction. Handoff (owner threshold or post-compact) still takes priority over the nudge.
- Tests: `memoryProposeNudgeMode` config default/validation, one-line status text helper, existing suite green.

## 0.7.0 — 2026-08-12

### Percentage-based auto-handoff

- Replace fixed 150k/25k token values with configurable raw `ContextUsage.percent` defaults: threshold `75`, rearm delta `25` percentage points.
- Owner and shadow modes share threshold/rearm predicate; shadow only logs would-trigger events when `PI_ROAMING_SHADOW_LOG=1`.
- Null/non-finite percentages do not trigger; trackers reset on `session_start` and `session_compact`.
- Add config validation, pure threshold helper tests, and percentage-based docs.

## 0.6.6 — 2026-08-10

### WIB display timestamp

- New Canonical Notes retain `created_at` as RFC3339 UTC and add `created_at_wib` formatted as `YYYY-MM-DD HH:mm:ss WIB` (`Asia/Jakarta`) for human display.
- `created_at_wib` is display metadata only: it never selects conflict winners or continuation heads. It remains integrity-covered canonical metadata, so tampering is detected.
- Existing immutable notes are not rewritten. Readers accept notes with or without `created_at_wib`.
- Tests: UTC-to-WIB conversion, new-note metadata + integrity, and invalid supplied Checkpoint timestamp rejection.

## 0.6.5 — 2026-08-10

### UX terminology: approve/save, not Git commit

- `shared_memory_write` official action is now `approve_proposal` with `approved: true` — requires explicit user approval after `propose_*` preview; `approved: false` rejects with `approval_required` and leaves the proposal untouched (no publish, no consumption). Saving a proposal is an approval, never a Git commit.
- Legacy `commit_proposal` (`confirmed: true`) kept as deprecated alias — still publishes; success responses carry `deprecated: true` and point to `approve_proposal`. Removed in a future release.
- Policy injection, nudge instruction, tool description/params now say approve/save with `approve_proposal approved: true`; no Git commit language in current instructions.
- Tests: approve true publishes; approve false → `approval_required` without publish/consume; legacy alias still publishes and reports deprecated.

## 0.6.4 — 2026-08-10

### Roaming memory usage policy (suggest-first, no auto-commit)

- `before_agent_start` now appends `<roaming-memory-policy>` to the existing `event.systemPrompt` (Hermes append pattern); standing injection merged into the same handler, appended after the policy — never replaces the prompt
- Policy: search-before-guess via `shared_memory` when task may depend on prior cross-device decisions/conventions/pitfalls/checkpoints; `get` on promising ids; hits are untrusted reference data; `propose_memory` → stop → show preview → explicit user approval → `commit_proposal confirmed: true`; never auto-commit durable memories; no whole-vault dump into context
- Periodic propose nudge (followUp): every `memoryProposeNudgeTurns` (default 14, clamp 3..100) turns the agent is asked to review THIS session for 0–3 durable candidates via `propose_memory` — never auto-commits; skipped on the turn the owner handoff threshold fires (handoff preferred)
- New config keys: `enableMemoryPolicy` (default true), `enableMemoryProposeNudge` (default true), `memoryProposeNudgeTurns` (default 14)
- Tool descriptions sharpened: `shared_memory` search-first line; `shared_memory_write` explicit approval-before-commit line
- Tests: memory-policy injection/nudge/boundaries + config defaults/clamps

## 0.6.3 — 2026-08-10

### Fixes

- `/lanjut` owner: use `ctx.newSession({ withSession })` so kickoff runs on replacement session; never touch stale command ctx after session replace (Pi 0.82+ footgun)

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
