# Pi Roaming Memory

Pi extension for durable, cross-device memory backed by synchronized Obsidian Markdown.

**Version:** 0.6.4  
**Status:** Implemented Phases 1–6 (Mac). Windows peer + independent backup still residual.

## Install

```bash
pi install git:github.com/alexandrokev/pi-roaming-memory
```

Create local config (required):

```bash
mkdir -p ~/.pi/agent/pi-roaming-memory
cat > ~/.pi/agent/pi-roaming-memory/config.json <<'EOF'
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
  "enableMemoryPolicy": true,
  "enableMemoryProposeNudge": true,
  "memoryProposeNudgeTurns": 14,
  "handoffMode": "shadow",
  "hermesFallback": true
}
EOF
```

Set `vaultRoot` to your Obsidian vault absolute path. Use `handoffMode: "owner"` only after removing `pi-auto-handoff` from Pi packages.

## Tools

| Tool | Role |
|---|---|
| `shared_memory` | Read-only: `status`, `list`, `search`, `get`, `conflicts` |
| `shared_memory_write` | Suggest-first: `propose_*`, `commit_proposal` (`confirmed: true`); agent handoff: `publish_checkpoint` |

Behavior:

- Roaming memory policy injected at agent start (`enableMemoryPolicy`): search before guessing, propose before commit, never auto-commit durable memories, no vault dump into context. Periodic propose nudge (every `memoryProposeNudgeTurns` turns, default 14) asks the agent to propose 0–3 durable candidates; the turn an owner handoff threshold fires prefers handoff over the nudge.

## Commands

| Mode | Commands |
|---|---|
| `shadow` | `/roam-handoff`, `/roam-lanjut`, `/memory-*` |
| `owner` | `/handoff`, `/lanjut`, plus roam aliases + `/memory-*` |

`/memory-approve-standing` — approve STANDING.md hash on this device  
`/memory-reindex` — rebuild local FTS  
`/memory-status` — health summary

`/handoff` (owner): no draft → agent summarizes this session and publishes a roaming Checkpoint via `publish_checkpoint`; pass substantive `## Goal` / `## Completed` draft sections to publish immediately. Context threshold (~150k tokens) and `session_compact` trigger the same handoff follow-up. `/lanjut` starts a new session from the latest checkpoint.

## Documents

- [Domain language](./CONTEXT.md)
- [System design](./docs/DESIGN.md)
- [ADRs](./docs/adr/)
- [Changelog](./CHANGELOG.md)
- [Plan](./PLAN.md)

## Safety

- Canonical state = Markdown under `<vault>/AI Memory`
- Local SQLite is disposable projection (not synced)
- No agent writes to `STANDING.md`
- No last-write-wins; explicit conflicts
- Independent backup still required before sole-source production (ADR 0007)

## Develop

```bash
npm test
```

Node ≥ 22 (uses `--experimental-strip-types` and `node:sqlite`).

## License

MIT
