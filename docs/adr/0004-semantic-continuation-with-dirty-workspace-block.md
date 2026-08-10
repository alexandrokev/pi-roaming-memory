---
status: accepted
---

# Semantic continuation with dirty-workspace block

Cross-device continuation transfers semantic work state, not source files or raw Pi sessions. A Checkpoint whose source workspace was dirty is readable but cannot authorize continuation on another device unless identical code state is explicitly proven or the user performs a risk-accepting manual override.

## Considered Options

- Assume Syncthing transfers workspace state: rejected because only vault Markdown is synchronized.
- Embed source diffs in Checkpoints: rejected because this duplicates version control, increases secret leakage, and cannot represent every workspace state safely.
- Automatically continue despite dirty state: rejected because it creates workspace hallucination.

## Consequences

Checkpoint schema must include Project Identity, repository remote fingerprint, branch, commit, dirty state, changed-path summary, source Device Identity, and Workstream Identity. Git remains source-code transport. Continuation validation fails closed on mismatch, missing evidence, invalid schema, or conflict.
