import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newUuid(): string {
  return crypto.randomUUID();
}

export function typedId(prefix: "mem" | "chk" | "tmb" | "res", uuid = newUuid()): string {
  return `${prefix}_${uuid}`;
}

export function isTypedId(id: string, prefix: string): boolean {
  if (!id.startsWith(prefix + "_")) return false;
  return UUID_RE.test(id.slice(prefix.length + 1));
}

export function ensureDeviceId(deviceIdFile: string): string {
  fs.mkdirSync(path.dirname(deviceIdFile), { recursive: true });
  if (fs.existsSync(deviceIdFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(deviceIdFile, "utf8")) as {
        deviceId?: string;
      };
      if (typeof j.deviceId === "string" && UUID_RE.test(j.deviceId)) {
        return j.deviceId;
      }
    } catch {
      // regenerate
    }
  }
  const deviceId = newUuid();
  fs.writeFileSync(
    deviceIdFile,
    JSON.stringify(
      {
        deviceId,
        createdAt: new Date().toISOString(),
        note: "Random local Device Identity. Not a hostname or Syncthing ID.",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  return deviceId;
}

export function projectIdFromRemote(remoteUrl: string): string {
  const norm = remoteUrl.trim().toLowerCase().replace(/\.git$/, "");
  const hash = crypto.createHash("sha256").update(norm, "utf8").digest("hex");
  return `prj_${hash}`;
}

export function repositoryRemoteFingerprint(remoteUrl: string): string {
  const norm = remoteUrl.trim().toLowerCase().replace(/\.git$/, "");
  return crypto.createHash("sha256").update(norm, "utf8").digest("hex");
}

export type GitSnapshot = {
  ok: boolean;
  cwd: string;
  remoteUrl: string | null;
  branch: string | null;
  headCommit: string | null;
  dirty: boolean;
  changedPaths: string[];
  error?: string;
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  }).trim();
}

export function captureGitSnapshot(cwd: string): GitSnapshot {
  try {
    const top = git(cwd, ["rev-parse", "--show-toplevel"]);
    let remoteUrl: string | null = null;
    try {
      remoteUrl = git(top, ["config", "--get", "remote.origin.url"]) || null;
    } catch {
      remoteUrl = null;
    }
    const branch = git(top, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const headCommit = git(top, ["rev-parse", "HEAD"]);
    const status = git(top, ["status", "--porcelain"]);
    const dirty = status.length > 0;
    const changedPaths = status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .slice(0, 40);
    return {
      ok: true,
      cwd: top,
      remoteUrl,
      branch,
      headCommit,
      dirty,
      changedPaths,
    };
  } catch (err) {
    return {
      ok: false,
      cwd,
      remoteUrl: null,
      branch: null,
      headCommit: null,
      dirty: true,
      changedPaths: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function commitExistsLocally(cwd: string, commit: string): boolean {
  try {
    git(cwd, ["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
