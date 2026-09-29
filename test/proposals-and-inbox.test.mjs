import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadCore() {
  return {
    ...(await import(path.join(root, "src/proposal-store.ts"))),
    ...(await import(path.join(root, "src/write-service.ts"))),
    ...(await import(path.join(root, "src/scanner.ts"))),
  };
}

async function loadTool() {
  return await import(path.join(root, "src/tools/shared-memory-write.ts"));
}

function tmpConfig() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-queue-"));
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

function registerTool(config, registerFn) {
  let captured;
  registerFn({ registerTool: (tool) => (captured = tool) }, config);
  assert.ok(captured, "tool registered");
  return captured;
}

function proposalFile(storeDir, id) {
  return path.join(storeDir, `${id}.json`);
}

test("ProposalStore: 30-day TTL, no delete on expired read, list newest-first, reject removes", async () => {
  const { ProposalStore } = await loadCore();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-props-"));
  const store = new ProposalStore(dir);

  const older = store.put({
    kind: "memory",
    relPath: "a.md",
    bytesUtf8: "x",
    meta: { title: "older" },
    preview: "x",
    warnings: [],
  });
  const newer = store.put({
    kind: "memory",
    relPath: "b.md",
    bytesUtf8: "y",
    meta: { title: "newer" },
    preview: "y",
    warnings: [],
  });

  const raw = JSON.parse(fs.readFileSync(proposalFile(dir, older.id), "utf8"));
  const span = Date.parse(raw.expiresAt) - Date.parse(raw.createdAt);
  assert.ok(
    span >= 29 * 24 * 60 * 60 * 1000,
    `default ttl ~30 days, got ${span}ms`,
  );

  raw.createdAt = new Date(Date.now() - 60_000).toISOString();
  raw.expiresAt = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(proposalFile(dir, older.id), JSON.stringify(raw, null, 2));

  assert.ok(store.get(older.id), "expired proposal stays readable");
  assert.ok(
    fs.existsSync(proposalFile(dir, older.id)),
    "expired proposal must not be auto-deleted on read",
  );

  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, newer.id, "newest first");

  store.reject(older.id);
  assert.ok(!fs.existsSync(proposalFile(dir, older.id)), "reject deletes file");
  assert.equal(store.list().length, 1);

  // Identical createdAt must fall back to the deterministic id tie-breaker.
  const tieOne = store.put({
    kind: "memory",
    relPath: "c.md",
    bytesUtf8: "z",
    meta: { title: "tie one" },
    preview: "z",
    warnings: [],
  });
  const tieTwo = store.put({
    kind: "memory",
    relPath: "d.md",
    bytesUtf8: "w",
    meta: { title: "tie two" },
    preview: "w",
    warnings: [],
  });
  const sharedCreatedAt = new Date().toISOString();
  for (const id of [tieOne.id, tieTwo.id]) {
    const file = proposalFile(dir, id);
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    doc.createdAt = sharedCreatedAt;
    fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  }
  const orderedTieIds = store
    .list()
    .map((p) => p.id)
    .filter((id) => id === tieOne.id || id === tieTwo.id);
  assert.deepEqual(
    orderedTieIds,
    [tieOne.id, tieTwo.id].sort((a, b) => b.localeCompare(a)),
    "identical createdAt orders by descending id tie-breaker",
  );
});

test("saveInboxNote: stages under inbox/, scans as untrusted inbox, blocks secrets", async () => {
  const { saveInboxNote, scanMemoryRoot } = await loadCore();
  const config = tmpConfig();

  const r = saveInboxNote(config, {
    title: "Loose Thought!",
    body: "remember this\n",
    tags: ["scratch"],
  });
  assert.equal(r.ok, true);
  assert.match(r.relPath, /^inbox\/\d{4}\/\d{2}\/\d{2}\//);
  assert.match(r.relPath, /loose-thought-[0-9a-f]{8}\.md$/);

  const abs = path.join(config._mem, r.relPath);
  assert.ok(fs.existsSync(abs), `inbox note exists at ${abs}`);
  const text = fs.readFileSync(abs, "utf8");
  assert.match(text, /schema: pi-roaming-memory\/inbox@1/);
  assert.match(text, /trust: inbox/);
  assert.match(text, /remember this/);

  const report = scanMemoryRoot(config._mem);
  const obj = report.objects.find((o) => o.relPath === r.relPath);
  assert.ok(obj);
  assert.equal(obj.kind, "inbox");
  assert.equal(obj.trust, "inbox");

  const bad = saveInboxNote(config, {
    title: "secret",
    body: "aws_access_key_id=AKIAIOSFODNN7EXAMPLE\n",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /sensitive_data_blocked/);
});

test("write tool: list_proposals, reject_proposal, batch_approve, save_inbox", async () => {
  const { registerSharedMemoryWriteTool } = await loadTool();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);

  const propose = async (label, title, body) => {
    const res = await tool.execute(label, {
      action: "propose_memory",
      kind: "decision",
      scope: "global",
      title,
      body,
    });
    assert.equal(res.details.ok, true, `${title} proposed`);
    return res.details;
  };

  const p1 = await propose("c1", "First", "one\n");
  const p2 = await propose("c2", "Second", "two\n");

  const listed = (await tool.execute("l1", { action: "list_proposals" })).details;
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 2);
  assert.ok(
    listed.proposals.some((x) => x.id === p1.proposal_id && x.title === "First"),
    "list_proposals reports id and title",
  );

  const rejected = (
    await tool.execute("r1", {
      action: "reject_proposal",
      proposal_id: p1.proposal_id,
    })
  ).details;
  assert.equal(rejected.ok, true);
  assert.equal(rejected.status, "rejected");
  assert.equal(
    (await tool.execute("l2", { action: "list_proposals" })).details.count,
    1,
  );

  const refused = (
    await tool.execute("b0", {
      action: "batch_approve",
      proposal_ids: [p2.proposal_id],
    })
  ).details;
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "approval_required");
  assert.ok(
    !fs.existsSync(path.join(config._mem, p2.relPath)),
    "no publish without approved:true",
  );

  const p3 = await propose("c3", "Third", "three\n");
  const batch = (
    await tool.execute("b1", {
      action: "batch_approve",
      proposal_ids: [p2.proposal_id, p3.proposal_id],
      approved: true,
    })
  ).details;
  assert.equal(batch.ok, true);
  assert.equal(batch.approved, 2);
  assert.equal(batch.failed, 0);
  assert.equal(batch.results.length, 2);
  for (const r of batch.results) {
    assert.equal(r.ok, true);
    assert.ok(fs.existsSync(path.join(config._mem, r.relPath)));
  }
  assert.equal(
    (await tool.execute("l3", { action: "list_proposals" })).details.count,
    0,
  );

  const inbox = (
    await tool.execute("i1", {
      action: "save_inbox",
      title: "Idea",
      body: "draft body\n",
    })
  ).details;
  assert.equal(inbox.ok, true);
  assert.match(inbox.relPath, /^inbox\//);
  assert.ok(fs.existsSync(path.join(config._mem, inbox.relPath)));
});

test("ProposalStore: path traversal proposal ids are rejected without touching outside files", async () => {
  const { ProposalStore } = await loadCore();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prm-trav-"));
  const storeDir = path.join(base, "proposals");
  const store = new ProposalStore(storeDir);

  const sentinel = path.join(base, "sentinel.json");
  fs.writeFileSync(sentinel, "keep\n");

  for (const badId of ["../sentinel", "../../etc/passwd"]) {
    assert.equal(store.get(badId), null, `get(${badId}) returns null`);
    store.reject(badId);
  }

  assert.ok(fs.existsSync(sentinel), "outside file still exists");
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep\n", "outside file untouched");
});

test("write tool: reject_proposal with traversal id does not touch outside files", async () => {
  const { registerSharedMemoryWriteTool } = await loadTool();
  const config = tmpConfig();
  const tool = registerTool(config, registerSharedMemoryWriteTool);

  const sentinel = path.join(config._runtime, "sentinel.json");
  fs.writeFileSync(sentinel, "keep\n");

  for (const badId of ["../sentinel", "../../etc/passwd"]) {
    const res = (
      await tool.execute("t1", {
        action: "reject_proposal",
        proposal_id: badId,
      })
    ).details;
    assert.equal(res.ok, true);
    assert.equal(res.status, "not_found");
  }

  assert.ok(fs.existsSync(sentinel), "outside file still exists");
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep\n", "outside file untouched");
});

test("saveInboxNote: secret in tags or kind is blocked before publish", async () => {
  const { saveInboxNote } = await loadCore();
  const config = tmpConfig();

  const badTags = saveInboxNote(config, {
    title: "tagged secret",
    body: "clean body\n",
    tags: ["ghp_1234567890abcdef1234567890abcdef"],
  });
  assert.equal(badTags.ok, false);
  assert.match(badTags.error, /sensitive_data_blocked/);

  const badKind = saveInboxNote(config, {
    title: "kind secret",
    body: "clean body\n",
    kind: "sk-1234567890abcdefghijklmnop",
  });
  assert.equal(badKind.ok, false);
  assert.match(badKind.error, /sensitive_data_blocked/);

  const inboxRoot = path.join(config._mem, "inbox");
  const published = fs.existsSync(inboxRoot)
    ? fs
        .readdirSync(inboxRoot, { recursive: true })
        .filter((f) => String(f).endsWith(".md"))
    : [];
  assert.equal(published.length, 0, "no inbox note published for blocked secret");
});
