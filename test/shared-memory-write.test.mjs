import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/tools/shared-memory-write.ts"))),
  };
}

function tmpConfig() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-wrt-"));
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
  };
}

function registerTool(config, registerFn) {
  let captured;
  registerFn(
    { registerTool: (tool) => (captured = tool) },
    config,
  );
  assert.ok(captured, "tool registered");
  return captured;
}

async function propose(config, tool) {
  const res = await tool.execute("prop", {
    action: "propose_memory",
    kind: "decision",
    scope: "global",
    title: "Terminology test",
    body: "approve/save, never Git commit.",
  });
  assert.equal(res.details.ok, true);
  return res.details;
}

test("approve_proposal approved:false does not publish and returns approval_required", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);
  const prop = await propose(config, tool);

  const res = await tool.execute("t1", {
    action: "approve_proposal",
    proposal_id: prop.proposal_id,
    approved: false,
  });
  assert.equal(res.details.ok, false);
  assert.equal(res.details.error, "approval_required");
  assert.equal(res.details.proposal_id, prop.proposal_id);
  // not published
  assert.ok(
    !fs.existsSync(path.join(config._mem, prop.relPath)),
    "no file published on rejected approval",
  );

  // not consumed: same proposal can still be approved afterwards
  const again = await tool.execute("t2", {
    action: "approve_proposal",
    proposal_id: prop.proposal_id,
    approved: true,
  });
  assert.equal(again.details.ok, true);
  assert.ok(fs.existsSync(path.join(config._mem, prop.relPath)));
});

test("approve_proposal approved:true publishes", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);
  const prop = await propose(config, tool);

  const res = await tool.execute("t3", {
    action: "approve_proposal",
    proposal_id: prop.proposal_id,
    approved: true,
  });
  assert.equal(res.details.ok, true);
  const file = path.join(config._mem, res.details.relPath);
  assert.ok(fs.existsSync(file), `approved memory exists at ${file}`);
  assert.equal(res.details.relPath, prop.relPath);
  assert.equal(res.details.deprecated, undefined, "official action not deprecated");
});

test("legacy commit_proposal confirmed:true still publishes and is marked deprecated", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);
  const prop = await propose(config, tool);

  const res = await tool.execute("t4", {
    action: "commit_proposal",
    proposal_id: prop.proposal_id,
    confirmed: true,
  });
  assert.equal(res.details.ok, true);
  assert.equal(res.details.deprecated, true);
  assert.match(res.details.note, /Use approve_proposal with approved:true/);
  const file = path.join(config._mem, res.details.relPath);
  assert.ok(fs.existsSync(file), `legacy-committed memory exists at ${file}`);
});

test("approve_proposal approved omitted/absent rejects without consuming", async () => {
  const { registerSharedMemoryWriteTool } = await load();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);
  const prop = await propose(config, tool);

  const res = await tool.execute("t5", {
    action: "approve_proposal",
    proposal_id: prop.proposal_id,
  });
  assert.equal(res.details.ok, false);
  assert.equal(res.details.error, "approval_required");
  assert.ok(!fs.existsSync(path.join(config._mem, prop.relPath)));

  // Omitted approval must not consume the proposal; user can approve it later.
  const retry = await tool.execute("t5-retry", {
    action: "approve_proposal",
    proposal_id: prop.proposal_id,
    approved: true,
  });
  assert.equal(retry.details.ok, true);
  assert.ok(fs.existsSync(path.join(config._mem, prop.relPath)));
});
