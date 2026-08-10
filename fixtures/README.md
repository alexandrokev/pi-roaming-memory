# Fixtures

Synthetic only. Never real vault data.

| Path | Purpose |
|---|---|
| `synthetic-vault/` | Full fake Obsidian vault rooted with `AI Memory/` |
| `invalid/` | Standalone malformed notes for parser/schema fail-closed tests |
| `casefold/` | Sidecar bodies for case-collision materialization |
| `scripts/compute-integrity.mjs` | Hash helper matching DESIGN §9 |

## Synthetic vault map

| Fixture | Path | Trust / role |
|---|---|---|
| F01 valid memory | `AI Memory/memories/2026/08/mem_1111...` | approved |
| F02 correction | `mem_2222...` supersedes F01 | approved |
| F03/F04 search pair | `mem_3333...`, `mem_4444...` | approved |
| F03/F04 terminals | `mem_5555...`, `mem_6666...` concurrent supersession | conflict until resolution applied |
| F05 clean checkpoint | `handoffs/.../chk_7777...` | continuation-eligible |
| F06 dirty checkpoint | `handoffs/.../chk_9999...` | block cross-device continue |
| F07 tombstone | `tombstones/.../tmb_aaaa...` targets `mem_4444...` | exclude target |
| F08 resolution | `resolutions/.../res_bbbb...` accepts 5555 rejects 6666 | human resolution |
| F09 inbox bait | `inbox/note-prompt-injection.md` | inbox only |
| F10 standing | `STANDING.md` | standing after local hash approval |
| F11 standing conflict | `STANDING.sync-conflict-...` | disable standing |
| F12 note conflict | `mem_cccc....sync-conflict-...` | diagnostics |
| F16 stversions | `AI Memory/.stversions/...` | never search |
| F17 integrity mismatch | `mem_dddd...` fixed bad hash | invalid |
| F15 casefold | materialize from `fixtures/casefold/` | invalid pair |

## Integrity

Managed notes ship with computed `integrity_sha256` (except deliberate F17 mismatch and some invalid/* samples).

```bash
node fixtures/scripts/compute-integrity.mjs --write path/to/note.md
```

## Safety

- No real user paths inside fixture note bodies beyond obvious synthetic IDs.
- Inbox bait contains prompt-injection strings on purpose for deny tests.
- Do not promote these files into a live Syncthing vault.
