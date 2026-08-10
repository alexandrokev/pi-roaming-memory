# Phase 0 — Pinned baseline versions

Captured on Mac host, 2026-08-10. These pins define the Phase 0/1 compatibility baseline. Bump only with an explicit note in this file.

## Runtime

| Component | Version | Source |
|---|---|---|
| macOS | 26.0.1 (Build 25A362) | `sw_vers` |
| Arch | arm64 | `uname -m` |
| Node.js | v22.17.1 | `node -v` |
| npm | 10.9.2 | `npm -v` |
| Pi coding agent | 0.82.1 | `@earendil-works/pi-coding-agent` / `pi --version` |
| Syncthing | v2.0.14 "Hafnium Hornet" (go1.25.6 darwin-arm64) | `/Applications/Syncthing.app/.../syncthing version` |

## Installed Pi packages (Mac)

From `~/.pi/agent/settings.json` `packages`:

| Package | Install ref | Observed version / tip |
|---|---|---|
| `pi-hermes-memory` | `npm:pi-hermes-memory` | 0.8.2 |
| `pi-auto-handoff` | `git:github.com/alexandrokev/pi-auto-handoff` | installed tip `5653c7a` (docs 0.2.0) |
| `pi-subagents` | `npm:pi-subagents` | present |
| `pi-mcp-adapter` | `npm:pi-mcp-adapter` | present |
| `context-mode` | `npm:context-mode` | present |
| `pi-gpt-search` | `npm:pi-gpt-search` | present |
| `pi-herdr-btw` | `npm:pi-herdr-btw` | present |

## Known drift

- Vault source checkout `Work/pi/pi-auto-handoff` HEAD = `756eeab` (feat absolute path).
- Installed package tip = `5653c7a` (docs commit one ahead of source checkout).
- Non-blocking for Phase 0. Re-pin after next install/pull before cutover tests.

## Not pinned yet

| Item | Status |
|---|---|
| Windows Node/Pi/Syncthing | Missing — capture on Windows peer before Phase 1 Windows fixture run |
| Android/iPad Syncthing client version | Missing — not a Pi runtime peer; needed only for recovery-peer evaluation |
| Independent backup tool | Missing — production sole-source gate remains blocked (ADR 0007) |

## Windows capture template

Fill on Windows host before claiming cross-platform exit:

```text
OS:
Arch:
Node:
npm:
Pi:
Syncthing:
pi-hermes-memory:
pi-auto-handoff tip:
```
