---
status: accepted
---

# Trust-separated read and write interfaces

Pi Roaming Memory exposes read-only retrieval separately from restricted mutation. Durable writes use suggest-first approval, `STANDING.md` remains human-owned and agent read-only, and all retrieved notes are untrusted data unless their Trust Class and schema permit their specific use.

## Considered Options

- One general read/write tool: rejected because read-only agents would receive unnecessary mutation capability.
- Treat all vault Markdown as instructions: rejected because mobile, imported, clipped, and synchronized content can carry prompt injection.
- Fully automatic durable extraction: rejected for initial rollout because errors become synchronized durable state.

## Consequences

Read-only agents can receive only the read interface. Write-capable sessions receive a narrow write interface and still require explicit user approval for Durable Memory. No content other than valid, conflict-free `STANDING.md` becomes standing instruction.
