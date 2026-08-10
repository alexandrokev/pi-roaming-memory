import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitInitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-git-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/example/demo.git"], {
    cwd: dir,
  });
  fs.writeFileSync(path.join(dir, "README.md"), "hi\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  return { dir, head, branch };
}

test("continuation blocks dirty cross-device without override", async () => {
  const { validateContinuation } = await import(
    path.join(root, "src/continuation.ts")
  );
  const {
    projectIdFromRemote,
    repositoryRemoteFingerprint,
  } = await import(path.join(root, "src/identity.ts"));
  const { dir, head, branch } = gitInitRepo();
  const deviceFile = path.join(dir, "device.json");
  fs.writeFileSync(
    deviceFile,
    JSON.stringify({ deviceId: "11111111-1111-4111-8111-111111111111" }),
  );

  const remote = "https://github.com/example/demo.git";
  const cp = {
    kind: "checkpoint",
    trust: "approved",
    id: "chk_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    relPath: "x",
    title: "t",
    issues: [],
    meta: {
      id: "chk_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      project_id: projectIdFromRemote(remote),
      repository_remote_fingerprint: repositoryRemoteFingerprint(remote),
      branch,
      head_commit: head,
      workspace_dirty: true,
      origin_device_id: "22222222-2222-4222-8222-222222222222",
    },
    bodyPreview: null,
  };

  const blocked = validateContinuation({
    cwd: dir,
    checkpoint: cp,
    deviceIdFile: deviceFile,
    allowDirtyOverride: false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "dirty_cross_device_block");

  const allowed = validateContinuation({
    cwd: dir,
    checkpoint: cp,
    deviceIdFile: deviceFile,
    allowDirtyOverride: true,
  });
  // still may block on local dirty — workspace clean after commit
  assert.equal(allowed.ok, true);
});
