import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return {
    ...(await import(path.join(root, "src/write-service.ts"))),
    ...(await import(path.join(root, "src/sensitive.ts"))),
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
