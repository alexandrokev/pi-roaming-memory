import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return import(path.join(root, "src/scanner.ts"));
}

test("scan synthetic vault classifies trusts", async () => {
  const { scanMemoryRoot } = await load();
  const mem = path.join(root, "fixtures/synthetic-vault/AI Memory");
  const report = scanMemoryRoot(mem);

  assert.ok(report.objects.length >= 10);
  assert.equal(report.standing.present, true);
  assert.equal(report.standing.trust, "conflicted");
  assert.ok(report.standing.conflictCopies.length >= 1);

  const valid = report.objects.find(
    (o) => o.id === "mem_11111111-1111-4111-8111-111111111111",
  );
  assert.ok(valid);
  assert.equal(valid.trust, "approved");

  const badHash = report.objects.find(
    (o) => o.id === "mem_dddd4444-dddd-4ddd-8ddd-dddddddddddd",
  );
  assert.ok(badHash);
  assert.equal(badHash.trust, "invalid");
  assert.ok(badHash.issues.includes("integrity_mismatch"));

  const inbox = report.objects.find((o) =>
    o.relPath.endsWith("inbox/note-prompt-injection.md"),
  );
  assert.ok(inbox);
  assert.equal(inbox.trust, "inbox");

  const stv = report.objects.filter((o) =>
    o.issues.includes("stversions_excluded"),
  );
  assert.ok(stv.length >= 1);

  const conflicts = report.objects.filter((o) => o.trust === "conflicted");
  assert.ok(conflicts.length >= 1);

  // dirty checkpoint still readable/approved schema-wise
  const dirty = report.objects.find(
    (o) => o.id === "chk_99999999-9999-4999-8999-999999999999",
  );
  assert.ok(dirty);
  assert.equal(dirty.kind, "checkpoint");
  assert.equal(dirty.trust, "approved");
  assert.equal(dirty.meta.workspace_dirty, true);
});
