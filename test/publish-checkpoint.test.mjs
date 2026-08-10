import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/checkpoint.ts"))),
    ...(await import(path.join(root, "src/tools/shared-memory-write.ts"))),
    ...(await import(path.join(root, "src/pending-checkpoint.ts"))),
    ...(await import(path.join(root, "src/scanner.ts"))),
  };
}

function tmpConfig(repoDir) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-pub-"));
  const vault = path.join(base, "vault");
  const mem = path.join(vault, "AI Memory");
  fs.mkdirSync(mem, { recursive: true });
  const runtime = path.join(base, "runtime");
  fs.mkdirSync(runtime, { recursive: true });
  return {
    schemaVersion: 1,
    vaultRoot: vault,
    memoryRoot: "AI Memory",
    deviceIdFile: path.join(runtime, "device.json"),
    indexFile: path.join(runtime, "index.sqlite"),
    maxSearchResults: 8,
    maxSearchTokens: 4000,
    maxReadBytes: 131072,
    enableStandingInstructions: true,
    handoffMode: "owner",
    hermesFallback: true,
    _mem: mem,
    _runtime: runtime,
    _repo: repoDir,
  };
}

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-repo-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const git = (args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  git(["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(dir, "README.md"), "# t\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  git(["remote", "add", "origin", "https://example.com/org/repo.git"]);
  return dir;
}

test("createCheckpoint with substance publishes approved checkpoint", async () => {
  const { createCheckpoint, scanMemoryRoot } = await load();
  const repo = gitRepo();
  const config = tmpConfig(repo);

  const r = createCheckpoint(
    config,
    repo,
    {
      goal: "Ship FTS v2",
      completed: ["wired rebuild swap"],
      currentState: "FTS projection green on Mac",
      remaining: ["windows peer run"],
      blockers: [],
      nextAction: "Run windows validation",
    },
    { confirmed: true, autoCommit: true },
  );
  assert.equal(r.ok, true);
  assert.ok(r.id.startsWith("chk_"));
  const file = path.join(config._mem, r.relPath);
  assert.ok(fs.existsSync(file), `checkpoint file exists at ${file}`);

  const report = scanMemoryRoot(config._mem);
  const obj = report.objects.find((o) => o.id === r.id);
  assert.ok(obj);
  assert.equal(obj.kind, "checkpoint");
  assert.equal(obj.trust, "approved");
  assert.ok(!obj.issues.includes("integrity_mismatch"));
});

test("shared_memory_write publish_checkpoint publishes via pending cwd", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const { setPendingCheckpointCwd, getPendingCheckpointCwd } = await load();
  const repo = gitRepo();
  const config = tmpConfig(repo);
  setPendingCheckpointCwd(repo);

  let captured;
  const pi = {
    registerTool: (tool) => {
      captured = tool;
    },
  };
  registerSharedMemoryWriteTool(pi, config);
  assert.ok(captured, "tool registered");
  assert.ok(captured.description.includes("publish_checkpoint"));

  const res = await captured.execute("t1", {
    action: "publish_checkpoint",
    goal: "Tool path test",
    completed: ["a", "b"],
    current_state: "State text here",
    remaining: [],
    blockers: [],
    next_action: "Next",
  });
  assert.equal(res.details.ok, true);
  const d = res.details;
  assert.ok(d.id.startsWith("chk_"));
  assert.ok(fs.existsSync(path.join(config._mem, d.relPath)));
  assert.equal(d.branch, "main");
  assert.equal(typeof d.head_commit, "string");
  assert.equal(d.head_commit.length, 40);
  assert.equal(d.dirty, false);
  // pending cwd still held (read-only semantics)
  assert.equal(getPendingCheckpointCwd(), repo);
});

test("shared_memory_write publish_checkpoint params.cwd overrides pending", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const { setPendingCheckpointCwd } = await load();
  const repoA = gitRepo();
  const repoB = gitRepo();
  const config = tmpConfig(repoA);
  setPendingCheckpointCwd(repoA);

  let captured;
  registerSharedMemoryWriteTool(
    { registerTool: (tool) => (captured = tool) },
    config,
  );

  const res = await captured.execute("t2", {
    action: "publish_checkpoint",
    goal: "Override cwd",
    completed: [],
    current_state: "state",
    remaining: [],
    blockers: [],
    next_action: "next",
    cwd: repoB,
  });
  assert.equal(res.details.ok, true);
  assert.equal(res.details.branch, "main");
});
