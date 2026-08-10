# Phase 0 — Hermes and auto-handoff baseline

Observed on Mac, Pi 0.82.1, 2026-08-10. Behavior below is the coexistence baseline. Roaming Memory must not break it during Phases 0–5.

## Package ownership today

| Concern | Owner | Surface |
|---|---|---|
| Durable local memory facts | `pi-hermes-memory` 0.8.2 | tools `memory`, `memory_search`; commands `memory-*`, `learn-memory-tool` |
| Historical session search | `pi-hermes-memory` 0.8.2 | tool `session_search`; command `memory-index-sessions` |
| Active-work checkpoint + session switch assist | `pi-auto-handoff` 0.2.0 | commands `/handoff`, `/lanjut`; hooks `turn_end`, `session_start`, `before_agent_start`, `session_compact` |
| Cross-device shared memory | none yet | future `shared_memory` / `shared_memory_write` |

## auto-handoff behavior

Source of truth for this baseline: installed package tip `5653c7a` and vault checkout `index.ts`.

### Config (env)

| Var | Default | Role |
|---|---|---|
| `PI_HANDOFF_THRESHOLD` | `150000` | token threshold for auto rewrite |
| `PI_HANDOFF_REARM` | `25000` | min token growth before re-trigger |
| `PI_HANDOFF_FILE` | `.pi/handoff.md` | path resolved from `ctx.cwd` |
| `PI_HANDOFF_STALE_MIN` | `0` (off) | optional stale warning on `/lanjut` |

### Lifecycle

1. `turn_end`
   - reads `ctx.getContextUsage()`
   - if missing usage → no-op
   - if tokens < threshold → no-op
   - if rearm gap not met → no-op
   - else follow-up instruction forces full rewrite of absolute handoff path + UI warning
2. `session_start` (`new` / `startup`)
   - if handoff file exists and non-empty → arm one-shot inject flag
3. `before_agent_start`
   - if armed → inject pointer to read handoff once, then clear flag
4. `session_compact`
   - refresh handoff after compaction
5. `/handoff`
   - manual rewrite now
6. `/lanjut`
   - copy new-session prompt to clipboard (`pbcopy` on macOS; fallback print)

### Path invariant

Handoff always resolves from launch `ctx.cwd`, never from a nested feature folder. Write instructions embed absolute path.

### New-session prompt text

```text
Baca .pi/handoff.md lalu lanjutkan pekerjaan dari checkpoint itu. Mulai dengan ringkasan posisi: done, remaining, next action. Kalau ada detail yang hilang dari handoff, cari via session_search atau memory_search sebelum bertanya ke user.
```

### Handoff document shape

```markdown
# Handoff — <nama task singkat>

## Goal
## Current state
## Important decisions
## Files changed
## Known problems
## Next actions
```

Rules: 30–60 lines, factual, no secrets/credentials.

## Hermes behavior (high level)

- Local SQLite / FTS projection for durable memories and optional session index.
- Tools: `memory`, `memory_search`, `session_search`, skill tools.
- Commands include `memory-consolidate`, `memory-index-sessions`, `memory-insights`, `memory-interview`, `learn-memory-tool`, `memory-skills`, `memory-switch-project`.
- Compaction remains enabled globally (`settings.compaction.enabled = true`).
- No cross-device canonical store.

## Compaction / context threshold interaction

| Event | auto-handoff | Hermes | Roaming requirement pre-cutover |
|---|---|---|---|
| context >= 150k | auto handoff rewrite | unchanged | must not also auto-write roaming Checkpoint |
| auto compaction | refresh handoff | may consolidate memory per its own rules | no command collision |
| new session | inject handoff pointer | memory policy remains available | shadow roaming commands only (`/roam-*`) until Phase 6 |

## Coexistence constraints for roaming implementation

1. Do not register `/handoff` or `/lanjut` before Phase 6 cutover ADR.
2. Do not double-write Hermes memories when user approves a roaming Durable Memory.
3. Keep `session_search` / `memory_search` available throughout rollout.
4. Shadow metrics only in Phase 5; no automatic session replacement.
5. Rollback = disable roaming package / set `handoffMode` away from owner; legacy package remains installed.

## Baseline gaps still to measure on live session

Manual once before Phase 5 shadow tests:

- [ ] Force threshold write and confirm single `.pi/handoff.md` at launch cwd
- [ ] `/lanjut` clipboard contents match `NEW_SESSION_PROMPT`
- [ ] Cancelled new session leaves old session usable
- [ ] `memory_search` and `session_search` respond after roaming package install (Phase 1+)
- [ ] Windows `pbcopy` absence path prints prompt instead of failing hard

## Windows baseline

Not captured yet. Repeat this document’s version table and command smoke list on Windows peer before Phase 1 Windows exit claim.
