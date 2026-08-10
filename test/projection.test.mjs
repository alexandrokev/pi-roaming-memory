import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("rebuild projection and search eligible notes only", async () => {
  const { rebuildProjection, searchProjection } = await import(
    path.join(root, "src/projection/index.ts")
  );
  const mem = path.join(root, "fixtures/synthetic-vault/AI Memory");
  const indexFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "prm-idx-")),
    "index.sqlite",
  );
  const proj = rebuildProjection(mem, indexFile);
  const hits = searchProjection(proj.db, "Canonical Markdown", { limit: 5 });
  proj.db.close();
  // should find approved memory, not inbox injection
  assert.ok(hits.some((h) => h.id.includes("mem_1111") || /Canonical/i.test(h.snippet + h.title)));
  assert.ok(!hits.some((h) => /IGNORE ALL PRIOR/i.test(h.snippet)));
});
