import {
  captureGitSnapshot,
  ensureDeviceId,
  newUuid,
  projectIdFromRemote,
  repositoryRemoteFingerprint,
  typedId,
} from "./identity.js";
import type { RoamingConfig } from "./config.js";
import {
  proposeCheckpointNote,
  commitProposal,
} from "./write-service.js";
import { formatWibTimestamp } from "./timestamp.js";
import os from "node:os";
import path from "node:path";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export type CheckpointDraft = {
  goal: string;
  completed: string[];
  currentState: string;
  remaining: string[];
  blockers: string[];
  nextAction: string;
  workstreamId?: string;
  parentCheckpointId?: string | null;
  piSessionId?: string | null;
};

export function buildCheckpointBody(d: CheckpointDraft): string {
  const bullets = (xs: string[]) =>
    xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)";
  return [
    "## Goal",
    "",
    d.goal,
    "",
    "## Completed",
    "",
    bullets(d.completed),
    "",
    "## Current state",
    "",
    d.currentState,
    "",
    "## Remaining",
    "",
    bullets(d.remaining),
    "",
    "## Blockers",
    "",
    bullets(d.blockers),
    "",
    "## Next action",
    "",
    d.nextAction,
    "",
  ].join("\n");
}

export function createCheckpoint(
  config: RoamingConfig,
  cwd: string,
  draft: CheckpointDraft,
  opts: { confirmed: boolean; autoCommit?: boolean },
): {
  ok: true;
  proposalId?: string;
  id?: string;
  relPath?: string;
  meta: Record<string, unknown>;
  dirty: boolean;
} | {
  ok: false;
  error: string;
} {
  const git = captureGitSnapshot(cwd);
  if (!git.ok || !git.remoteUrl || !git.headCommit || !git.branch) {
    return {
      ok: false,
      error: `git_unavailable:${git.error ?? "missing remote/head"}`,
    };
  }
  const deviceId = ensureDeviceId(expand(config.deviceIdFile));
  const project_id = projectIdFromRemote(git.remoteUrl);
  const workstream_id = draft.workstreamId ?? `wrk_${newUuid()}`;
  const id = typedId("chk");
  const created_at = new Date().toISOString();
  const meta: Record<string, unknown> = {
    schema: "pi-roaming-memory/checkpoint@1",
    id,
    created_at,
    created_at_wib: formatWibTimestamp(created_at),
    origin_device_id: deviceId,
    project_id,
    workstream_id,
    parent_checkpoint_id: draft.parentCheckpointId ?? null,
    pi_session_id: draft.piSessionId ?? null,
    repository_remote_fingerprint: repositoryRemoteFingerprint(git.remoteUrl),
    branch: git.branch,
    head_commit: git.headCommit,
    workspace_dirty: git.dirty,
    changed_paths: git.changedPaths,
    validation_state: "checked",
  };
  const body = buildCheckpointBody(draft);
  const prop = proposeCheckpointNote(config, meta, body);
  if (!prop.ok) return prop;
  if (opts.autoCommit) {
    if (!opts.confirmed) {
      return { ok: false, error: "confirmation_required" };
    }
    const committed = commitProposal(config, prop.proposal.id, {
      confirmed: true,
    });
    if (!committed.ok) return committed;
    return {
      ok: true,
      id: committed.id,
      relPath: committed.relPath,
      meta,
      dirty: git.dirty,
    };
  }
  return {
    ok: true,
    proposalId: prop.proposal.id,
    meta,
    dirty: git.dirty,
  };
}
