---
status: accepted
---

# Coexist with Hermes and pi-auto-handoff during rollout

`pi-hermes-memory` remains local historical-session search while Pi Roaming Memory owns new shared Durable Memory. Existing `pi-auto-handoff` remains installed until checkpoint and continuation parity is proven; integration must prevent duplicate commands, duplicate checkpoint writes, and competing context injections.

## Considered Options

- Remove Hermes immediately: rejected because raw historical session recall remains device-local and no parity evidence exists.
- Replace `pi-auto-handoff` in first release: rejected because current `/handoff`, `/lanjut`, threshold, and compaction behavior already work.
- Double-write every Hermes memory: rejected because it creates duplicates and unclear authority.

## Consequences

No mass migration or automatic double-write. Rollout needs explicit ownership flags and parity tests. Hermes or `pi-auto-handoff` removal requires measured usage, successful migration where applicable, documented rollback, and user approval through a later ADR.
