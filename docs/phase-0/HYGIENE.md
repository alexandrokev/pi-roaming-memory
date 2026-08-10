# Phase 0 — Public-repo hygiene

## Allowed in public source

- Design docs, ADRs, phase notes
- Package source, schemas, tests
- Synthetic fixtures under `fixtures/`
- Placeholder config examples (`*.example.json`)
- License, changelog, contributor docs

## Forbidden in public source

- Real vault notes or any `AI Memory/` content from a live vault
- Absolute personal paths in distributable defaults
- Device Identity files, standing-approval hashes from real devices
- SQLite / WAL / SHM / metrics / proposal caches
- Syncthing device IDs, certs, API keys, folder IDs
- `.stversions/` recovery payloads
- Real `.sync-conflict-*` from live vaults (synthetic names under `fixtures/` only)
- Handoffs, session logs, transcripts with user data
- `.env`, credentials, tokens, private keys
- `.pi-subagents/` harness output

## Guardrails already in tree

- Root `.gitignore` blocks runtime DB/state, `AI Memory/`, `.stversions/`, live conflict files
- Fixture exception allows synthetic `*.sync-conflict-*` under `fixtures/` only
- README states design-only safety boundary

## Pre-commit / pre-push checklist (manual until hooks exist)

1. `rg -n "/Users/|/home/|[A-Za-z]:\\\\Users" README.md CONTEXT.md docs fixtures` — personal paths only allowed in clearly labeled local-layout notes, not in examples shipped as defaults.
2. `rg -n "BEGIN (RSA |OPENSSH )?PRIVATE|api[_-]?key|secret|password\\s*[:=]" -i .` — expect zero hits outside intentional secret-scanner fixtures labeled as fake.
3. Confirm no `AI Memory/` directory outside `fixtures/synthetic-vault/`.
4. Confirm `.pi-subagents/` untracked.
5. No real note bodies copied from Obsidian.

## Local layout note (this Mac only)

Documented in README for operator orientation; not a distributable default:

```text
source: /Users/intinyadev/Documents/kev/pi-roaming-memory
vault:  /Users/intinyadev/Documents/kev/si-ian
memory: <vault>/AI Memory   # intentionally absent until write-path tests pass
```
