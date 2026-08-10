import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function load() {
  return import(path.join(root, "src/config.ts"));
}

test("loadConfig rejects missing and relative vaultRoot", async () => {
  const { loadConfig } = await load();
  const missing = loadConfig(path.join(os.tmpdir(), "no-such-prm-config.json"));
  assert.equal(missing.ok, false);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-cfg-"));
  const cfgPath = path.join(tmp, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      schemaVersion: 1,
      vaultRoot: "relative/nope",
      memoryRoot: "AI Memory",
    }),
  );
  const bad = loadConfig(cfgPath);
  assert.equal(bad.ok, false);
});

test("loadConfig accepts absolute vaultRoot", async () => {
  const { loadConfig, memoryRootAbs } = await load();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-cfg-"));
  const vault = path.join(tmp, "vault");
  fs.mkdirSync(vault);
  const cfgPath = path.join(tmp, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      schemaVersion: 1,
      vaultRoot: vault,
      memoryRoot: "AI Memory",
      handoffMode: "shadow",
    }),
  );
  const ok = loadConfig(cfgPath);
  assert.equal(ok.ok, true);
  assert.equal(memoryRootAbs(ok.config), path.resolve(vault, "AI Memory"));
  assert.equal(ok.config.handoffMode, "shadow");
});
