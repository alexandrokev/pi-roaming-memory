import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// fileURL path on POSIX is fine; keep decode for spaces

async function load() {
  const mod = await import(
    path.join(root, "src/vault-boundary.ts")
  );
  return mod;
}

test("resolveInsideRoot rejects absolute and parent escapes", async () => {
  const { resolveInsideRoot } = await load();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-vb-"));
  const mem = path.join(tmp, "AI Memory");
  fs.mkdirSync(mem, { recursive: true });
  fs.writeFileSync(path.join(mem, "ok.md"), "x");

  const abs = resolveInsideRoot(mem, "/etc/passwd");
  assert.equal(abs.ok, false);
  assert.equal(abs.code, "outside_root");

  const up = resolveInsideRoot(mem, "../outside.md");
  assert.equal(up.ok, false);
  assert.equal(up.code, "outside_root");

  const ok = resolveInsideRoot(mem, "ok.md");
  assert.equal(ok.ok, true);
  assert.equal(ok.relPath, "ok.md");
});

test("resolveInsideRoot rejects symlink components", async () => {
  const { resolveInsideRoot } = await load();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-vb-"));
  const mem = path.join(tmp, "AI Memory");
  fs.mkdirSync(mem, { recursive: true });
  const target = path.join(tmp, "secret.txt");
  fs.writeFileSync(target, "nope");
  try {
    fs.symlinkSync(target, path.join(mem, "link.md"));
  } catch (err) {
    // Windows without symlink privilege
    if (err && (err.code === "EPERM" || err.code === "EACCES")) {
      return;
    }
    throw err;
  }
  const res = resolveInsideRoot(mem, "link.md");
  assert.equal(res.ok, false);
  assert.equal(res.code, "symlink");
});

test("isSyncConflictName and isStversionsPath", async () => {
  const { isSyncConflictName, isStversionsPath } = await load();
  assert.equal(
    isSyncConflictName(
      "mem_x.sync-conflict-20260810-130000-XYZ123.md",
    ),
    true,
  );
  assert.equal(isSyncConflictName("mem_x.md"), false);
  assert.equal(isStversionsPath(".stversions/foo.md"), true);
  assert.equal(isStversionsPath("memories/a.md"), false);
});
