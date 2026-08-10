# Full implementation plan — Scope C

Operator decisions 2026-08-10:

- Scope **C**: Phase 1–5 + cutover-ready + install Pi Mac + low-risk pilot vault notes after write tests
- Phase 6 **owner** allowed after shadow parity tests green
- Git remote: `https://github.com/alexandrokev/pi-roaming-memory.git` (empty, public)
- Commit bebas, push OK
- Backup: **defer** (sole-source production remains blocked; pilot OK)

## Hard constraints

1. DESIGN.md + ADR 0001–0008 are law. No LWW, no sync SQLite, no agent write to STANDING.md.
2. One writer on worktree. Atomic conventional commits. SemVer tags per phase exit.
3. Default shipped `handoffMode`: `shadow` until Phase 6 cutover commit flips local config to `owner`.
4. Do not mutate live vault until Phase 2 tests pass; then only create minimal pilot tree under `si-ian/AI Memory`.
5. No secrets, no real user memory content in git.
6. Windows peer tests: document as residual; Mac must be green.
7. Independent backup: residual blocker for sole-source production only.

## Phase exits

| Phase | Version tag | Validation |
|---|---|---|
| 0 baseline already in tree | `v0.0.1` | docs+fixtures present |
| 1 read-only complete | `v0.1.0` | `npm test` green; no write export |
| 2 publisher + suggest-first | `v0.2.0` | no-overwrite tests; STANDING write blocked |
| 3 FTS + trust routing | `v0.3.0` | rebuild equivalence; bounded search |
| 4 standing + inbox | `v0.4.0` | hash approval; fail-closed conflict |
| 5 shadow checkpoints | `v0.5.0` | `/roam-*` only; dirty block tests |
| 6 cutover owner | `v0.6.0` | `/handoff`/`/lanjut` owned; auto-handoff removed from local packages |
| pilot notes | (no tag) | minimal README+STANDING in live vault |

## File checklist

### Create

- `src/graph.ts` — supersession/tombstone/resolution evaluation
- `src/sensitive.ts` — secret patterns
- `src/proposal-store.ts` — local proposals under runtime dir
- `src/atomic-publisher.ts` — O_EXCL / no-replace publish
- `src/tools/shared-memory-write.ts` — suggest-first write tool
- `src/projection/*` — sqlite fts (better-sqlite3 or node:sqlite)
- `src/standing.ts` — hash approval + injection
- `src/checkpoint.ts` — checkpoint build/validate
- `src/continuation.ts` — dirty/project checks
- `src/commands/*` — roam + owner commands
- `src/identity.ts` — device/project ids
- `CHANGELOG.md`, `LICENSE`
- tests per module

### Modify

- `src/index.ts` — wire phases by config
- `src/scanner.ts` — integrate graph trusts
- `package.json` — deps, version bumps
- `README.md`, `config/config.example.json`

### Do not touch

- Live vault until Phase 2 green
- `pi-auto-handoff` source (remove from settings only at cutover)
- User Hermes data

## Validation commands

```bash
cd /Users/intinyadev/Documents/kev/pi-roaming-memory
npm test
node --experimental-strip-types --import ./test/ts-js-resolve-register.mjs -e "console.log('ok')"
# no AI Memory in git:
! git ls-files | rg '^AI Memory/' 
# secret scan outside fixtures:
rg -n "BEGIN (RSA |OPENSSH )?PRIVATE" -g '!fixtures/**' . || true
```

## Cutover local steps (Phase 6)

1. Tag `v0.6.0`
2. `pi install` file/git package
3. Write `~/.pi/agent/pi-roaming-memory/config.json` → vault + `handoffMode: owner`
4. Remove `git:github.com/alexandrokev/pi-auto-handoff` from settings packages
5. Create pilot `AI Memory/` skeleton (STANDING + README only)
6. User restarts Pi

## Residual (not blocking code complete)

- Windows fixture run
- Independent backup
- Mobile versioning as recovery peer
- Vector search
