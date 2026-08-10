---
status: accepted
---

# Canonical Markdown with local projections

Obsidian Markdown under configured `AI Memory` root is canonical durable cross-device state. Syncthing replicates only Canonical Notes; SQLite FTS, caches, metrics, and any future vector index remain disposable per-device Local Projections because synchronizing database files creates crash, WAL, locking, and conflict hazards.

## Considered Options

- Synchronize SQLite or vector databases: rejected because database state is not safe file-level merge material.
- Use raw Pi sessions as canonical memory: rejected because sessions are device-local history, large, mutable in shape, and too broad for deliberate durable knowledge.
- Depend on Obsidian CLI: rejected for core runtime because it requires Obsidian application availability and exposes a wider interface than memory needs.

## Consequences

Every projection must rebuild from Markdown alone. Losing all local projection files must not lose Durable Memory. File watchers may reduce latency but periodic reconciliation and explicit reindex remain correctness mechanisms.
