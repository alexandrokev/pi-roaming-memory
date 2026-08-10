---
status: accepted
---

# FTS-first and bounded retrieval

Initial retrieval uses metadata filters plus local SQLite FTS. Vector search remains deferred until a benchmark shows missed recall that FTS and better metadata cannot solve; no workflow may inject the full memory corpus into model context.

## Consequences

Search returns bounded snippets under configurable result and token limits. Full-note reads require an explicit note ID. Ranking prioritizes scope and text relevance; timestamps never decide truth. Vector dependencies, embedding lifecycle, and cross-device model parity stay outside initial scope.
