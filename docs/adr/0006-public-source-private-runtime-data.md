---
status: accepted
---

# Public source and private runtime data

`pi-roaming-memory` is a public Git repository located at `/Users/intinyadev/Documents/kev/pi-roaming-memory` on the current Mac. Real memory data lives separately in configured vault storage, currently `/Users/intinyadev/Documents/kev/si-ian/AI Memory`, and must never enter source control.

## Consequences

Source contains code, schemas, documentation, synthetic fixtures, and placeholder config only. Local config, Device Identity, vault content, handoffs, metrics, credentials, absolute user paths in distributable defaults, and Syncthing metadata are ignored. GitHub transports source; Syncthing transports only canonical vault data.
