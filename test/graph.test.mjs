import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("synthetic vault graph marks concurrent supersession", async () => {
  const { scanMemoryRoot } = await import(path.join(root, "src/scanner.ts"));
  const mem = path.join(root, "fixtures/synthetic-vault/AI Memory");
  const report = scanMemoryRoot(mem);
  assert.ok(report.graph);
  // mem_5555 and mem_6666 are concurrent supersessions; resolution accepts 5555
  const g = report.graph;
  const r5555 = g.reasons.get("mem_55555555-5555-4555-8555-555555555555") || [];
  const r6666 = g.reasons.get("mem_66666666-6666-4666-8666-666666666666") || [];
  // with resolution present, 6666 rejected, 5555 may be accepted
  assert.ok(
    r6666.includes("resolution_rejected") ||
      r6666.includes("concurrent_supersession") ||
      r6666.includes("superseded_by_resolution"),
  );
  // tombstoned 4444
  const r4444 = g.reasons.get("mem_44444444-4444-4444-8444-444444444444") || [];
  assert.ok(r4444.includes("tombstoned"));
});
