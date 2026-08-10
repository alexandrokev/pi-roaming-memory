/**
 * Tiny module state: cwd bound to the next agent-authored checkpoint publish
 * (/handoff or threshold / session_compact trigger). Read-only semantics;
 * kept until overwritten.
 */
let pendingCwd: string | null = null;

export function setPendingCheckpointCwd(cwd: string): void {
  pendingCwd = cwd;
}

/** Read; does not clear (kept until overwritten). */
export function takePendingCheckpointCwd(): string | null {
  return pendingCwd;
}

export function getPendingCheckpointCwd(): string | null {
  return pendingCwd;
}
