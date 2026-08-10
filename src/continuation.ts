import {
  captureGitSnapshot,
  commitExistsLocally,
  ensureDeviceId,
  projectIdFromRemote,
  repositoryRemoteFingerprint,
} from "./identity.js";
import type { ScannedObject } from "./scanner.js";
import os from "node:os";
import path from "node:path";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export type ContinuationDecision =
  | {
      ok: true;
      checkpointId: string;
      warnings: string[];
      kickoff: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      warnings?: string[];
    };

export function validateContinuation(opts: {
  cwd: string;
  checkpoint: ScannedObject;
  deviceIdFile: string;
  allowDirtyOverride?: boolean;
}): ContinuationDecision {
  const { checkpoint } = opts;
  const warnings: string[] = [];
  if (!checkpoint.meta || checkpoint.kind !== "checkpoint") {
    return { ok: false, code: "not_checkpoint", message: "not a checkpoint" };
  }
  if (checkpoint.trust === "invalid") {
    return {
      ok: false,
      code: "invalid",
      message: "checkpoint invalid",
    };
  }
  const meta = checkpoint.meta;
  const git = captureGitSnapshot(opts.cwd);
  if (!git.ok || !git.remoteUrl || !git.headCommit) {
    return {
      ok: false,
      code: "git_unavailable",
      message: git.error ?? "git unavailable",
    };
  }

  const expectedProject = projectIdFromRemote(git.remoteUrl);
  if (meta.project_id !== expectedProject) {
    return {
      ok: false,
      code: "project_mismatch",
      message: `project_id mismatch: checkpoint=${meta.project_id} local=${expectedProject}`,
    };
  }

  const localFp = repositoryRemoteFingerprint(git.remoteUrl);
  if (meta.repository_remote_fingerprint !== localFp) {
    return {
      ok: false,
      code: "remote_mismatch",
      message: "repository remote fingerprint mismatch",
    };
  }

  const head = String(meta.head_commit ?? "");
  if (!commitExistsLocally(opts.cwd, head)) {
    return {
      ok: false,
      code: "commit_missing",
      message: `commit not available locally: ${head}`,
    };
  }

  if (git.headCommit !== head) {
    warnings.push(
      `checked-out commit ${git.headCommit} differs from checkpoint ${head}`,
    );
  }
  if (git.branch !== meta.branch) {
    warnings.push(
      `branch ${git.branch} differs from checkpoint ${meta.branch}`,
    );
  }

  const localDevice = ensureDeviceId(expand(opts.deviceIdFile));
  const origin = String(meta.origin_device_id ?? "");
  const sourceDirty = meta.workspace_dirty === true;
  if (sourceDirty && origin && origin !== localDevice) {
    if (!opts.allowDirtyOverride) {
      return {
        ok: false,
        code: "dirty_cross_device_block",
        message:
          "source checkpoint workspace was dirty on another device; cross-device continuation blocked",
        warnings,
      };
    }
    warnings.push("DIRTY_OVERRIDE: user accepted dirty cross-device risk");
  }

  if (git.dirty && !opts.allowDirtyOverride) {
    return {
      ok: false,
      code: "local_dirty_block",
      message: "current workspace is dirty; clean or explicit override required",
      warnings,
    };
  }

  const id = String(meta.id);
  const kickoff = [
    `Continue from roaming checkpoint ${id}.`,
    `Read it via shared_memory get id=${id}.`,
    "Summarize done / remaining / next action, then proceed.",
    warnings.length ? `Warnings: ${warnings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ok: true,
    checkpointId: id,
    warnings,
    kickoff,
  };
}
