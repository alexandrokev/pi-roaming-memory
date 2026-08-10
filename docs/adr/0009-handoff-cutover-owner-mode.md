---
status: accepted
---

# Handoff cutover to roaming owner mode

After shadow implementation and operator approval (Scope C, 2026-08-10), Pi Roaming Memory may own `/handoff` and `/lanjut` when local config sets `handoffMode: owner`. Legacy `pi-auto-handoff` must be removed from the device package list during owner mode to prevent duplicate command registration and double checkpoint writes.

## Consequences

- Default example config remains `shadow` for safe installs.
- Owner mode is an explicit local choice plus package list change.
- Rollback: set `handoffMode` to `shadow` or `off`, reinstall `git:github.com/alexandrokev/pi-auto-handoff`, restart Pi.
- Independent backup remains deferred; sole-source production gate still blocked (ADR 0007).
