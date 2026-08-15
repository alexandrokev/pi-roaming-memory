import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPolicy() {
  return import(path.join(root, "src/memory-policy.ts"));
}

function writeConfig(tmp, extra = {}) {
  const vault = path.join(tmp, "vault");
  fs.mkdirSync(vault, { recursive: true });
  const cfgPath = path.join(tmp, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      schemaVersion: 1,
      vaultRoot: vault,
      memoryRoot: "AI Memory",
      ...extra,
    }),
  );
  return cfgPath;
}

test("formatMemoryPolicyInjection wraps policy, mentions tools + approve gate", async () => {
  const { formatMemoryPolicyInjection, ROAMING_MEMORY_POLICY } =
    await loadPolicy();
  const inj = formatMemoryPolicyInjection();
  assert.ok(inj.startsWith("<roaming-memory-policy>"));
  assert.ok(inj.endsWith("</roaming-memory-policy>"));
  assert.ok(inj.includes(ROAMING_MEMORY_POLICY));
  for (const needle of [
    "shared_memory",
    "propose_memory",
    "approve_proposal",
    "approved",
  ]) {
    assert.ok(inj.includes(needle), `missing ${needle}`);
  }
});

test("ROAMING_MEMORY_POLICY covers READ/WRITE rules", async () => {
  const { ROAMING_MEMORY_POLICY } = await loadPolicy();
  assert.ok(ROAMING_MEMORY_POLICY.includes("action=search"));
  assert.ok(ROAMING_MEMORY_POLICY.includes("untrusted reference data"));
  assert.ok(ROAMING_MEMORY_POLICY.includes("NEVER call approve_proposal"));
  assert.ok(ROAMING_MEMORY_POLICY.includes("STANDING.md"));
  assert.ok(ROAMING_MEMORY_POLICY.includes("publish_checkpoint"));
});

test("buildProposeNudgeInstruction proposes only, forbids self-approve", async () => {
  const { buildProposeNudgeInstruction } = await loadPolicy();
  const inst = buildProposeNudgeInstruction({ turns: 14 });
  assert.ok(inst.includes("propose_memory"));
  assert.ok(inst.includes("No durable roaming memory candidates."));
  assert.match(inst, /Do NOT call approve_proposal/);
  assert.match(inst, /Do NOT call publish_checkpoint/);
  assert.ok(inst.includes("14"));
  // default turns when opts omitted
  assert.ok(buildProposeNudgeInstruction().includes("14"));
});

test("buildProposeNudgeStatusText is one line and status key stable", async () => {
  const { buildProposeNudgeStatusText, PROPOSE_NUDGE_STATUS_KEY } =
    await loadPolicy();
  assert.equal(PROPOSE_NUDGE_STATUS_KEY, "roaming-memory-propose");
  const text = buildProposeNudgeStatusText();
  assert.ok(text.length > 0);
  assert.ok(!text.includes("\n"), "status text must be a single line");
});

test("shouldNudgePropose boundaries", async () => {
  const { shouldNudgePropose } = await loadPolicy();
  assert.equal(shouldNudgePropose(0, 14), false);
  assert.equal(shouldNudgePropose(13, 14), false);
  assert.equal(shouldNudgePropose(14, 14), true);
  assert.equal(shouldNudgePropose(20, 14), true);
  assert.equal(shouldNudgePropose(2, 3), false);
  assert.equal(shouldNudgePropose(3, 3), true);
  assert.equal(shouldNudgePropose(101, 100), true);
});

test("loadConfig defaults: enableMemoryPolicy true, nudge turns 14", async () => {
  const { loadConfig } = await import(path.join(root, "src/config.ts"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-pol-"));
  const ok = loadConfig(writeConfig(tmp));
  assert.equal(ok.ok, true);
  assert.equal(ok.config.enableMemoryPolicy, true);
  assert.equal(ok.config.enableMemoryProposeNudge, true);
  assert.equal(ok.config.memoryProposeNudgeTurns, 14);
});

test("loadConfig respects enableMemoryPolicy false and custom nudge turns (clamped 3..100)", async () => {
  const { loadConfig } = await import(path.join(root, "src/config.ts"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-pol-"));
  const ok = loadConfig(
    writeConfig(tmp, {
      enableMemoryPolicy: false,
      enableMemoryProposeNudge: false,
      memoryProposeNudgeTurns: 7,
    }),
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.config.enableMemoryPolicy, false);
  assert.equal(ok.config.enableMemoryProposeNudge, false);
  assert.equal(ok.config.memoryProposeNudgeTurns, 7);

  const hi = loadConfig(writeConfig(tmp, { memoryProposeNudgeTurns: 500 }));
  assert.equal(hi.config.memoryProposeNudgeTurns, 100);

  const lo = loadConfig(writeConfig(tmp, { memoryProposeNudgeTurns: 1 }));
  assert.equal(lo.config.memoryProposeNudgeTurns, 3);
});
