import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { storagePartition, memoryRelPath, checkpointRelPath } = await import(
  path.join(root, "src/paths.ts")
);

test("storagePartition groups by Asia/Jakarta calendar day", () => {
  // 2026-08-18 16:30 UTC == 2026-08-18 23:30 WIB -> same day
  assert.deepEqual(storagePartition("2026-08-18T16:30:00Z"), {
    yyyy: "2026",
    mm: "08",
    dd: "18",
  });
  // 2026-08-18 17:30 UTC == 2026-08-19 00:30 WIB -> next day (UTC rollover)
  assert.deepEqual(storagePartition("2026-08-18T17:30:00Z"), {
    yyyy: "2026",
    mm: "08",
    dd: "19",
  });
});

test("memory/checkpoint rel paths include YYYY/MM/DD", () => {
  const id = "mem_11111111-2222-4333-8444-555555555555";
  assert.equal(
    memoryRelPath(id, "2026-08-12T10:00:00Z"),
    `memories/2026/08/12/${id}.md`,
  );
  const cid = "chk_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(
    checkpointRelPath(cid, "2026-08-18T17:30:00Z"),
    `handoffs/2026/08/19/${cid}.md`,
  );
});
