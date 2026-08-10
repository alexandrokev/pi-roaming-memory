import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/write-service.ts"))),
    ...(await import(path.join(root, "src/sensitive.ts"))),
    ...(await import(path.join(root, "src/scanner.ts"))),
    ...(await import(path.join(root, "src/integrity.ts"))),
    ...(await import(path.join(root, "src/paths.ts"))),
    ...(await import(path.join(root, "src/canonical-parser.ts"))),
  };
}

function tmpConfig() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-w-"));
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
    _mem: mem,
    _runtime: runtime,
  };
}

test("propose + commit memory; double commit fails; secret blocked", async () => {
  const { proposeMemory, commitProposal, scanSensitive } = await load();
  const config = tmpConfig();

  const secret = proposeMemory(config, {
    kind: "decision",
    scope: "global",
    title: "bad",
    body: "aws_access_key_id=AKIAIOSFODNN7EXAMPLE\n",
  });
  assert.equal(secret.ok, false);

  const p = proposeMemory(config, {
    kind: "decision",
    scope: "global",
    title: "Ship FTS first",
    body: "Use SQLite FTS before vectors.\n",
    tags: ["search"],
  });
  assert.equal(p.ok, true);
  const id = p.proposal.id;

  const unconfirmed = commitProposal(config, id, { confirmed: false });
  assert.equal(unconfirmed.ok, false);

  const ok = commitProposal(config, id, { confirmed: true });
  assert.equal(ok.ok, true);
  assert.ok(ok.id.startsWith("mem_"));
  assert.ok(fs.existsSync(path.join(config._mem, ok.relPath)));

  const again = commitProposal(config, id, { confirmed: true });
  assert.equal(again.ok, false);

  // STANDING cannot be proposed via path — memory paths only
  assert.ok(!ok.relPath.includes("STANDING"));
});

test("sensitive scanner flags known patterns", async () => {
  const { scanSensitive } = await load();
  const hits = scanSensitive("token: 'ghp_abcdefghijklmnopqrstuv'");
  assert.ok(hits.length >= 1);
});

test("committed memory scans approved, no integrity_mismatch", async () => {
  const { proposeMemory, commitProposal, scanMemoryRoot } = await load();
  const config = tmpConfig();

  const p = proposeMemory(config, {
    kind: "decision",
    scope: "global",
    title: "Scan after commit",
    body: "Body with leading newline normalization.\n",
    tags: ["search"],
  });
  assert.equal(p.ok, true);
  const ok = commitProposal(config, p.proposal.id, { confirmed: true });
  assert.equal(ok.ok, true);

  const report = scanMemoryRoot(config._mem);
  const obj = report.objects.find((o) => o.id === ok.id);
  assert.ok(obj);
  assert.equal(obj.kind, "memory");
  assert.equal(obj.trust, "approved");
  assert.ok(!obj.issues.includes("integrity_mismatch"));
});

test("committed checkpoint scans approved, no integrity_mismatch", async () => {
  const { proposeCheckpointNote, commitProposal, scanMemoryRoot } = await load();
  const config = tmpConfig();

  const meta = {
    origin_device_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    project_id:
      "prj_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    workstream_id: "wrk_88888888-8888-4888-8888-888888888888",
    parent_checkpoint_id: null,
    pi_session_id: null,
    repository_remote_fingerprint:
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    branch: "main",
    head_commit: "89abcdef0123456789abcdef0123456789abcdef",
    workspace_dirty: true,
    changed_paths: ["src/example.ts", "README.md"],
    validation_state: "checked",
  };
  const body =
    "## Goal\n\nDo the thing.\n\n## Next action\n\nShip it.\n";
  const p = proposeCheckpointNote(config, meta, body);
  assert.equal(p.ok, true);
  const ok = commitProposal(config, p.proposal.id, { confirmed: true });
  assert.equal(ok.ok, true);
  assert.ok(ok.id.startsWith("chk_"));

  const report = scanMemoryRoot(config._mem);
  const obj = report.objects.find((o) => o.id === ok.id);
  assert.ok(obj);
  assert.equal(obj.kind, "checkpoint");
  assert.equal(obj.trust, "approved");
  assert.ok(!obj.issues.includes("integrity_mismatch"));
});

test("committed tombstone + resolution scan approved", async () => {
  const { proposeTombstone, proposeResolution, commitProposal, scanMemoryRoot } =
    await load();
  const config = tmpConfig();

  const t = proposeTombstone(
    config,
    "mem_11111111-1111-4111-8111-111111111111",
    "superseded",
  );
  assert.equal(t.ok, true);
  const tc = commitProposal(config, t.proposal.id, { confirmed: true });
  assert.equal(tc.ok, true);

  const r = proposeResolution(
    config,
    ["mem_22222222-2222-4222-8222-222222222222"],
    ["mem_22222222-2222-4222-8222-222222222222"],
    ["mem_33333333-3333-4333-8333-333333333333"],
    "Accept the corrected variant; reject the stale one.",
  );
  assert.equal(r.ok, true);
  const rc = commitProposal(config, r.proposal.id, { confirmed: true });
  assert.equal(rc.ok, true);

  const report = scanMemoryRoot(config._mem);
  const tobj = report.objects.find((o) => o.id === tc.id);
  assert.ok(tobj);
  assert.equal(tobj.kind, "tombstone");
  assert.equal(tobj.trust, "approved");
  assert.ok(!tobj.issues.includes("integrity_mismatch"));

  const robj = report.objects.find((o) => o.id === rc.id);
  assert.ok(robj);
  assert.equal(robj.kind, "resolution");
  assert.equal(robj.trust, "approved");
  assert.ok(!robj.issues.includes("integrity_mismatch"));
});

test("commitProposal rejects integrity mismatch before publish", async () => {
  const { getProposalStore, commitProposal, memoryRelPath, serializeNote, computeIntegritySha256, normalizeCanonicalBody } =
    await load();
  const config = tmpConfig();

  const meta = {
    schema: "pi-roaming-memory/memory@1",
    id: "mem_550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-08-10T00:00:00Z",
    origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
    kind: "decision",
    trust: "approved",
    scope: "global",
    title: "Tamper test",
    tags: [],
    supersedes: [],
  };
  const body = "Clean body.\n";
  meta.integrity_sha256 = computeIntegritySha256(
    meta,
    normalizeCanonicalBody(body),
  );
  const bytes = serializeNote(meta, body);
  const tampered = bytes.replace("Clean body.", "TAMPERED body.");
  assert.notEqual(tampered, bytes);

  const relPath = memoryRelPath(
    "mem_550e8400-e29b-41d4-a716-446655440000",
    "2026-08-10T00:00:00Z",
  );
  const store = getProposalStore(config);
  const prop = store.put({
    kind: "memory",
    relPath,
    bytesUtf8: tampered,
    meta,
    preview: tampered.slice(0, 2000),
    warnings: [],
  });

  const res = commitProposal(config, prop.id, { confirmed: true });
  assert.equal(res.ok, false);
  assert.equal(res.error, "integrity_mismatch");
  // nothing published
  const target = path.join(config._mem, relPath);
  assert.ok(!fs.existsSync(target));
});

test("adversarial YAML scalars survive serialize/parse/verify roundtrip", async () => {
  const { serializeNote, parseCanonicalMarkdown, computeIntegritySha256, normalizeCanonicalBody, verifyIntegrity } =
    await load();

  for (const title of ["2024", "null", "true"]) {
    const meta = {
      schema: "pi-roaming-memory/memory@1",
      id: "mem_550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-08-10T00:00:00Z",
      origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
      kind: "decision",
      trust: "approved",
      scope: "global",
      title,
      tags: ["2024", "true", "null", "yes", "v1.0", "1.5", "0x1F"],
      supersedes: [],
    };
    const bodyRaw = "\n\nAdversarial body.\n\n\n";
    const body = normalizeCanonicalBody(bodyRaw);
    meta.integrity_sha256 = computeIntegritySha256(meta, body);
    const raw = serializeNote(meta, bodyRaw);

    const parsed = parseCanonicalMarkdown(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.body, "\nAdversarial body.\n");
    assert.equal(parsed.meta.title, title);
    assert.deepEqual(parsed.meta.tags, [
      "2024",
      "true",
      "null",
      "yes",
      "v1.0",
      "1.5",
      "0x1F",
    ]);
    const integ = verifyIntegrity(parsed.meta, parsed.body);
    assert.equal(integ.ok, true);
  }
});
