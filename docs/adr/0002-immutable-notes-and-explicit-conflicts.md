---
status: accepted
---

# Immutable notes and explicit conflicts

Durable Memory, Correction, Tombstone, and Checkpoint files are create-once and immutable. Corrections and removal create new notes and graph edges; concurrent terminal supersessions or incompatible claims produce explicit Conflict state instead of selecting a winner by timestamp.

## Considered Options

- Edit shared aggregate files: rejected because concurrent writes cause Syncthing conflicts and lost semantic intent.
- Last-write-wins: rejected because device clocks are not authoritative and a silent winner can revive wrong or unsafe guidance.
- Automatic semantic merge: deferred because correctness cannot be guaranteed without human intent.

## Consequences

Unique IDs, create-if-absent writes, graph validation, conflict detection, and human resolution are mandatory. Wall-clock timestamps support display and diagnostics only; they never establish truth precedence.
