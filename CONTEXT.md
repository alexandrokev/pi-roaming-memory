# Pi Roaming Memory

Pi Roaming Memory preserves selected knowledge and active-work checkpoints across Pi sessions and devices without synchronizing raw session databases.

## Language

**Canonical Note**:
An immutable Markdown document whose bytes are authoritative durable state and are safe to synchronize across devices.
_Avoid_: Record, database row, memory blob

**Durable Memory**:
A Canonical Note containing approved reusable knowledge such as a decision, convention, correction, or pitfall.
_Avoid_: Transcript, chat history, automatic summary

**Checkpoint**:
An immutable Canonical Note describing semantic active-work state at one moment, including repository identity and continuation safety evidence.
_Avoid_: Backup, workspace copy, session dump

**Continuation**:
Starting a new Pi session from one selected Checkpoint after validating project and workspace compatibility.
_Avoid_: Session sync, workspace sync

**Standing Instructions**:
User-owned instructions stored only in `STANDING.md`; agents may read but never write them.
_Avoid_: Memory note, imported instruction

**Inbox Note**:
Human-authored, untrusted Markdown awaiting explicit review or promotion into Durable Memory.
_Avoid_: Standing instruction, approved memory

**Correction**:
A new Durable Memory that disputes or replaces claims in older memories without modifying those older files.
_Avoid_: Edit, overwrite

**Supersession Edge**:
A directed claim that one Durable Memory supersedes another; competing terminal claims create conflict rather than an implicit winner.
_Avoid_: Latest version, replacement timestamp

**Tombstone**:
An immutable Canonical Note that marks another note excluded from normal retrieval while retaining audit history.
_Avoid_: Delete, trash

**Conflict**:
A state where synchronized files or graph claims cannot be safely resolved without human choice.
_Avoid_: Newest copy, automatic merge

**Local Projection**:
A disposable per-device search index derived entirely from Canonical Notes.
_Avoid_: Source of truth, synchronized database

**Trust Class**:
Explicit provenance category controlling whether content may guide behavior: standing, approved, inbox, imported, conflicted, or invalid.
_Avoid_: Trusted by default

**Project Identity**:
Stable logical identity for one code project, independent of its device-specific absolute path.
_Avoid_: Folder path, repository name alone

**Workstream Identity**:
Stable identity for related Checkpoints within one unit of ongoing work.
_Avoid_: Session ID, branch name alone

**Device Identity**:
Random locally generated identifier naming checkpoint origin without exposing Syncthing device IDs or host secrets.
_Avoid_: Hostname, Syncthing Device ID
