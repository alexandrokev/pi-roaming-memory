# Phase 0/1 — Test matrix (macOS + Windows)

Status: Phase 0 defines cases. Phase 1 automates against `fixtures/synthetic-vault`.

## Platforms

| Platform | Phase 0 | Phase 1 required |
|---|---|---|
| macOS arm64 | baseline captured | yes |
| Windows x64/arm64 | not captured | yes before Phase 1 exit |
| Android / iPad | N/A (no Pi runtime) | human vault R/W only; not unit-test target |

## Fixture categories

| ID | Category | Expectation |
|---|---|---|
| F01 | valid durable memory | parse + integrity path ready |
| F02 | correction with supersedes | graph edge retained |
| F03/F04 | concurrent supersession pair | conflict, no winner |
| F05 | clean checkpoint | continuation-eligible once validators exist |
| F06 | dirty checkpoint | readable; cross-device continuation blocked |
| F07 | tombstone | target excluded from normal retrieval |
| F08 | resolution | accepts/rejects complete terminal set |
| F09 | inbox injection bait | never normal search; never system prompt |
| F10 | valid STANDING.md | injectable only after local hash approval |
| F11 | STANDING.sync-conflict-* | disable standing injection |
| F12 | note.sync-conflict-* | diagnostics only |
| F13 | oversized / bad YAML / duplicate keys | invalid, fail closed |
| F14 | path traversal / symlink (generated in tests) | rejected by vault boundary |
| F15 | case-only filename collision | invalid on case-insensitive FS |
| F16 | `.stversions` sample | never searchable |
| F17 | integrity mismatch | invalid |
| F18 | secret-like body fixture | blocked at propose-time (Phase 2+) |

## Phase 1 automated suites

1. **VaultBoundary** — root containment, symlink reject, absolute/relative escape
2. **CanonicalParser** — YAML safety limits, UTF-8, LF, frontmatter shape
3. **SchemaValidator** — per-type required fields and enums
4. **Integrity** — hash mismatch → invalid
5. **TrustRouter** — standing/approved/inbox/imported/conflicted/invalid routing
6. **Diagnostics** — `shared_memory.status` / conflict listing against fixtures
7. **Cross-platform paths** — same fixtures on macOS + Windows path separators and case folding

## Manual Syncthing drills (not Phase 0 blockers)

Tracked for Phase 7; do not block package skeleton:

- Mac→Windows create/receive
- remote change versioning into `.stversions`
- restore drill both directions
- confirm `.stversions` excluded from search

## Exit mapping

| Gate | Needed evidence |
|---|---|
| Phase 0 exit | this matrix + VERSION/BASELINE/HYGIENE + synthetic fixtures present; no real vault mutation |
| Phase 1 exit | automated F01–F17 (as applicable) green on macOS + Windows; no write API exported |
