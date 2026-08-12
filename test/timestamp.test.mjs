import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/timestamp.ts"))),
    ...(await import(path.join(root, "src/write-service.ts"))),
    ...(await import(path.join(root, "src/canonical-parser.ts"))),
    ...(await import(path.join(root, "src/integrity.ts"))),
  };
}

function tmpConfig() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-time-"));
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
    handoffMode: "shadow",
    hermesFallback: true,
  };
}

test("formatWibTimestamp converts UTC timestamp to WIB", async () => {
  const { formatWibTimestamp } = await load();

  assert.equal(
    formatWibTimestamp("2026-08-10T00:00:00.000Z"),
    "2026-08-10 07:00:00 WIB",
  );
  assert.equal(
    formatWibTimestamp("2026-12-31T23:59:59.000Z"),
    "2027-01-01 06:59:59 WIB",
  );
});

test("new notes include WIB display timestamp without changing canonical UTC", async () => {
  const { proposeMemory, parseCanonicalMarkdown, verifyIntegrity } = await load();
  const proposal = proposeMemory(tmpConfig(), {
    kind: "decision",
    scope: "global",
    title: "Timestamp display",
    body: "Keep canonical UTC for integrity and ordering.\n",
  });

  assert.equal(proposal.ok, true);
  const parsed = parseCanonicalMarkdown(proposal.proposal.bytesUtf8);
  assert.equal(parsed.ok, true);
  assert.equal(typeof parsed.meta.created_at, "string");
  assert.equal(typeof parsed.meta.created_at_wib, "string");
  assert.match(parsed.meta.created_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.match(
    parsed.meta.created_at_wib,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} WIB$/,
  );
  assert.equal(verifyIntegrity(parsed.meta, parsed.body).ok, true);
});

test("mismatched WIB display timestamp fails schema validation", async () => {
  const { validateManagedMeta } = await import(
    path.join(root, "src/schema-validator.ts")
  );
  const validation = validateManagedMeta({
    schema: "pi-roaming-memory/memory@1",
    id: "mem_550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-08-10T00:00:00.000Z",
    created_at_wib: "2026-08-10 00:00:00 WIB",
    origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
    kind: "decision",
    trust: "approved",
    scope: "global",
    title: "Mismatched display timestamp",
    tags: [],
    supersedes: [],
    integrity_sha256: "ab",
  });

  assert.equal(validation.ok, false);
  assert.ok(
    validation.issues.some((issue) => issue.path === "created_at_wib"),
  );
});

test("invalid created_at is invalid even without WIB display metadata", async () => {
  const { validateManagedMeta } = await import(
    path.join(root, "src/schema-validator.ts")
  );
  const validation = validateManagedMeta({
    schema: "pi-roaming-memory/memory@1",
    id: "mem_550e8400-e29b-41d4-a716-446655440000",
    created_at: "not-a-time",
    origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
    kind: "decision",
    trust: "approved",
    scope: "global",
    title: "Invalid UTC timestamp",
    tags: [],
    supersedes: [],
    integrity_sha256: "ab",
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.path === "created_at"));
});

test("invalid created_at rejects checkpoint proposal", async () => {
  const { proposeCheckpointNote } = await load();
  const proposal = proposeCheckpointNote(
    tmpConfig(),
    {
      id: "chk_550e8400-e29b-41d4-a716-446655440000",
      created_at: "not-a-time",
      origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
      project_id: "prj_example",
      workstream_id: "wrk_550e8400-e29b-41d4-a716-446655440000",
      workspace_dirty: false,
      validation_state: "checked",
    },
    "## Goal\n\nTest invalid time.\n",
  );

  assert.equal(proposal.ok, false);
  assert.equal(proposal.error, "invalid_created_at");
});
