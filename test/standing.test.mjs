import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("standing conflict disables injection; approval enables", async () => {
  const {
    evaluateStanding,
    saveStandingApproval,
    sha256Text,
  } = await import(path.join(root, "src/standing.ts"));

  const fixture = path.join(root, "fixtures/synthetic-vault/AI Memory");
  const approval = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "prm-st-")),
    "standing-approval.json",
  );

  const conflicted = evaluateStanding(fixture, approval);
  assert.equal(conflicted.injectable, false);
  assert.equal(conflicted.trust, "conflicted");

  // clean vault without conflict copy
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prm-stv-"));
  const mem = path.join(tmp, "AI Memory");
  fs.mkdirSync(mem);
  const body = fs.readFileSync(path.join(fixture, "STANDING.md"), "utf8");
  fs.writeFileSync(path.join(mem, "STANDING.md"), body);

  const unapproved = evaluateStanding(mem, approval);
  assert.equal(unapproved.injectable, false);
  assert.equal(unapproved.trust, "unapproved");
  assert.ok(unapproved.hash);

  saveStandingApproval(approval, unapproved.hash);
  const ok = evaluateStanding(mem, approval);
  assert.equal(ok.injectable, true);
  assert.equal(ok.trust, "standing");
  assert.equal(ok.hash, sha256Text(body));
});
