# Phase 0 — Contract and safety baseline

## Delivered on Mac (2026-08-10)

- [x] Accepted design + ADRs (pre-existing)
- [x] Public-repo hygiene rules — `HYGIENE.md`, `.gitignore` updates
- [x] Synthetic vault fixtures — `fixtures/synthetic-vault` + invalid/casefold
- [x] Integrity helper — `fixtures/scripts/compute-integrity.mjs`
- [x] Pinned versions — `VERSIONS.md`
- [x] Hermes / auto-handoff baseline — `BASELINE.md`
- [x] macOS+Windows test matrix draft — `TEST-MATRIX.md`
- [x] Placeholder config — `config/config.example.json`
- [x] No real vault mutation (`~/Documents/kev/si-ian/AI Memory` still absent)
- [x] Phase 1 skeleton started early (read-only modules + 13 green tests on Mac)

## Still open for Phase 0 exit

- [ ] Windows version pin + baseline smoke (peer capture)
- [ ] Manual live-session smoke of `/handoff`, `/lanjut`, threshold, compaction (checklist in BASELINE.md)
- [ ] Optional: init public git remote (operator decision; not a functional blocker)

## Exit criteria (from DESIGN §21)

| Criterion | Status |
|---|---|
| no real vault mutation | met |
| schemas and threat model reviewed | design accepted; independent harness review incomplete |
| rollback remains uninstall/disable new package | met (no package installed yet) |

## Next

Phase 1 read-only deep module against fixtures.
