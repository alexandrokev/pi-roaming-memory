import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assert.equal(ok.config.handoffThresholdPercent, 75);
  assert.equal(ok.config.handoffRearmPercent, 25);
});

test("loadConfig accepts custom handoff percentages", async () => {
  const { loadConfig } = await load();
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
      handoffThresholdPercent: 80,
      handoffRearmPercent: 10,
    }),
  );
  const result = loadConfig(cfgPath);
  assert.equal(result.ok, true);
  assert.equal(result.config.handoffThresholdPercent, 80);
  assert.equal(result.config.handoffRearmPercent, 10);
});

test("loadConfig rejects invalid handoff percentages", async () => {
  const { loadConfig } = await load();
  for (const [key, value] of [
    ["handoffThresholdPercent", -1],
    ["handoffThresholdPercent", 0],
    ["handoffThresholdPercent", 101],
    ["handoffThresholdPercent", "75"],
    ["handoffThresholdPercent", null],
    ["handoffRearmPercent", -1],
    ["handoffRearmPercent", 0],
    ["handoffRearmPercent", 101],
    ["handoffRearmPercent", "25"],
    ["handoffRearmPercent", null],
  ]) {
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
        [key]: value,
      }),
    );
    const result = loadConfig(cfgPath);
    assert.equal(result.ok, false, `${key}=${String(value)}`);
  }
});

test("loadConfig defaults memoryProposeNudgeMode to status", async () => {
  const { loadConfig } = await load();
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
    }),
  );
  const result = loadConfig(cfgPath);
  assert.equal(result.ok, true);
  assert.equal(result.config.memoryProposeNudgeMode, "status");
});

test("loadConfig accepts status and followUp nudge modes", async () => {
  const { loadConfig } = await load();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-cfg-"));
  const vault = path.join(tmp, "vault");
  fs.mkdirSync(vault);
  for (const mode of ["status", "followUp"]) {
    const cfgPath = path.join(tmp, `config-${mode}.json`);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        schemaVersion: 1,
        vaultRoot: vault,
        memoryRoot: "AI Memory",
        memoryProposeNudgeMode: mode,
      }),
    );
    const result = loadConfig(cfgPath);
    assert.equal(result.ok, true);
    assert.equal(result.config.memoryProposeNudgeMode, mode);
  }
});

test("loadConfig rejects invalid memoryProposeNudgeMode", async () => {
  const { loadConfig } = await load();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-cfg-"));
  const vault = path.join(tmp, "vault");
  fs.mkdirSync(vault);
  for (const value of ["toast", "notify", "", 1, [], null]) {
    const cfgPath = path.join(tmp, `config-bad-${String(value)}.json`);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        schemaVersion: 1,
        vaultRoot: vault,
        memoryRoot: "AI Memory",
        memoryProposeNudgeMode: value,
      }),
    );
    const result = loadConfig(cfgPath);
    assert.equal(result.ok, false, `mode=${String(value)}`);
  }
});
