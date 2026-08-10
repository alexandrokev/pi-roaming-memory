import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const load = () => import(path.join(root, "src/atomic-publisher.ts"));

test("publish create-only and refuse overwrite", async () => {
  const { publishCanonical } = await load();
  const mem = fs.mkdtempSync(path.join(os.tmpdir(), "prm-pub-"));
  const r1 = publishCanonical({
    memoryRootAbs: mem,
    relPath: "memories/2026/08/a.md",
    bytes: "hello\n",
  });
  assert.equal(r1.ok, true);
  assert.equal(fs.readFileSync(r1.absPath, "utf8"), "hello\n");

  const r2 = publishCanonical({
    memoryRootAbs: mem,
    relPath: "memories/2026/08/a.md",
    bytes: "other\n",
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "already_exists");
  assert.equal(fs.readFileSync(r1.absPath, "utf8"), "hello\n");
});

test("reject path escape", async () => {
  const { publishCanonical } = await load();
  const mem = fs.mkdtempSync(path.join(os.tmpdir(), "prm-pub-"));
  const r = publishCanonical({
    memoryRootAbs: mem,
    relPath: "../outside.md",
    bytes: "x",
  });
  assert.equal(r.ok, false);
});
