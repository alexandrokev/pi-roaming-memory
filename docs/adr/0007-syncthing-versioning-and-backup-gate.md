---
status: accepted
---

# Syncthing versioning and backup gate

Mac and Windows use Syncthing Staggered File Versioning with 365-day maximum age. Syncthing remains replication, not backup: design, implementation, synthetic testing, and low-risk pilot notes may proceed without separate backup, but sole-source production cutover is blocked until independent backup and restore testing exist.

## Consequences

Versioning must be configured and tested per device because settings do not synchronize automatically and only remote changes are versioned by the receiving device. Android and iPad remain human read/write peers but are not trusted recovery anchors unless their clients prove equivalent versioning behavior. `.stversions` and `.sync-conflict-*` files are excluded from retrieval; conflict files remain visible to diagnostics and require human resolution.
