import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/handoff-instruction.ts"))),
    ...(await import(path.join(root, "src/pending-checkpoint.ts"))),
  };
}

const DRAFT = [
  "## Goal",
  "",
  "Ship FTS v2",
  "",
  "## Completed",
  "",
  "- wired rebuild swap",
  "- bounded search tests",
  "",
  "## Current state",
  "",
  "FTS projection green on Mac; projection swap in place.",
  "",
  "## Remaining",
  "",
  "- windows peer run",
  "",
  "## Blockers",
  "",
  "- (none)",
  "",
  "## Next action",
  "",
  "Run windows peer validation",
  "",
].join("\n");

test("parseHandoffDraft extracts sections", async () => {
  const { parseHandoffDraft } = await load();
  const d = parseHandoffDraft(DRAFT);
  assert.equal(d.goal, "Ship FTS v2");
  assert.deepEqual(d.completed, ["wired rebuild swap", "bounded search tests"]);
  assert.equal(
    d.currentState,
    "FTS projection green on Mac; projection swap in place.",
  );
  assert.deepEqual(d.remaining, ["windows peer run"]);
  assert.deepEqual(d.blockers, []); // "- none" filtered
  assert.equal(d.nextAction, "Run windows peer validation");
});

test("parseHandoffDraft keeps defaults only for missing sections", async () => {
  const { parseHandoffDraft } = await load();
  const d = parseHandoffDraft("");
  assert.equal(d.goal, "Active work checkpoint");
  assert.deepEqual(d.completed, []);
  assert.equal(d.currentState, "");
  assert.deepEqual(d.remaining, []);
  assert.deepEqual(d.blockers, []);
  assert.equal(d.nextAction, "Continue work");
});

test("draftHasSubstance false for empty/default-only/short input", async () => {
  const { parseHandoffDraft, draftHasSubstance } = await load();
  assert.equal(draftHasSubstance(parseHandoffDraft("")), false);
  assert.equal(draftHasSubstance(parseHandoffDraft("   ")), false);
  assert.equal(draftHasSubstance(parseHandoffDraft("short")), false);
  // empty template with all defaults → no substance
  const template = [
    "## Goal",
    "",
    "Active work checkpoint",
    "",
    "## Completed",
    "",
    "(none)",
    "",
    "## Current state",
    "",
    "(none)",
    "",
    "## Remaining",
    "",
    "(none)",
    "",
    "## Blockers",
    "",
    "(none)",
    "",
    "## Next action",
    "",
    "Continue work",
    "",
  ].join("\n");
  assert.equal(draftHasSubstance(parseHandoffDraft(template)), false);
});

test("draftHasSubstance true for substantive drafts", async () => {
  const { parseHandoffDraft, draftHasSubstance } = await load();
  assert.equal(draftHasSubstance(parseHandoffDraft(DRAFT)), true);
  // long section-less current_state text
  const longState =
    "This is a fairly long current state description that goes well beyond twenty characters for sure.";
  assert.equal(draftHasSubstance(parseHandoffDraft(longState)), true);
  // non-default goal with enough raw length
  const goalOnly =
    "## Goal\n\nShip FTS v2 with full tests before end of week";
  assert.equal(draftHasSubstance(parseHandoffDraft(goalOnly)), true);
});

test("buildHandoffFollowUpInstruction mentions tool, action, fields, cwd, /lanjut", async () => {
  const { buildHandoffFollowUpInstruction } = await load();
  for (const reason of ["manual", "threshold", "post-compact"]) {
    const inst = buildHandoffFollowUpInstruction({
      reason,
      tokens: 160_000,
      cwd: "/tmp/work",
    });
    assert.ok(inst.includes("shared_memory_write"), reason);
    assert.ok(inst.includes("publish_checkpoint"), reason);
    assert.ok(inst.includes("completed"), reason);
    assert.ok(inst.includes("current_state"), reason);
    assert.ok(inst.includes("remaining"), reason);
    assert.ok(inst.includes("blockers"), reason);
    assert.ok(inst.includes("next_action"), reason);
    assert.ok(inst.includes("/lanjut"), reason);
    assert.ok(inst.includes("/tmp/work"), reason);
    assert.ok(inst.includes("~160k"), reason);
    const percentInst = buildHandoffFollowUpInstruction({
      reason,
      percent: 75,
      cwd: "/tmp/work",
    });
    assert.ok(percentInst.includes("75%"), reason);
  }
});

test("pending checkpoint cwd helpers (read; keep until overwritten)", async () => {
  const {
    setPendingCheckpointCwd,
    takePendingCheckpointCwd,
    getPendingCheckpointCwd,
  } = await load();
  setPendingCheckpointCwd("/tmp/a");
  assert.equal(getPendingCheckpointCwd(), "/tmp/a");
  assert.equal(takePendingCheckpointCwd(), "/tmp/a");
  // take does not clear
  assert.equal(getPendingCheckpointCwd(), "/tmp/a");
  setPendingCheckpointCwd("/tmp/b");
  assert.equal(getPendingCheckpointCwd(), "/tmp/b");
});
