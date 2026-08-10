import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const parser = await import(path.join(root, "src/canonical-parser.ts"));
  const integ = await import(path.join(root, "src/integrity.ts"));
  const schema = await import(path.join(root, "src/schema-validator.ts"));
  return { ...parser, ...integ, ...schema };
}

test("valid fixture memory parses and integrity matches", async () => {
  const { parseCanonicalMarkdown, verifyIntegrity, validateManagedMeta } =
    await load();
  const file = path.join(
    root,
    "fixtures/synthetic-vault/AI Memory/memories/2026/08/mem_11111111-1111-4111-8111-111111111111.md",
  );
  const raw = fs.readFileSync(file);
  const parsed = parseCanonicalMarkdown(raw);
  assert.equal(parsed.ok, true);
  const v = validateManagedMeta(parsed.meta);
  assert.equal(v.ok, true);
  const integ = verifyIntegrity(parsed.meta, parsed.body);
  assert.equal(integ.ok, true);
});

test("integrity mismatch fixture is detected", async () => {
  const { parseCanonicalMarkdown, verifyIntegrity } = await load();
  const file = path.join(
    root,
    "fixtures/synthetic-vault/AI Memory/memories/2026/08/mem_dddd4444-dddd-4ddd-8ddd-dddddddddddd.md",
  );
  const parsed = parseCanonicalMarkdown(fs.readFileSync(file));
  assert.equal(parsed.ok, true);
  const integ = verifyIntegrity(parsed.meta, parsed.body);
  assert.equal(integ.ok, false);
});

test("duplicate keys fail closed", async () => {
  const { parseCanonicalMarkdown } = await load();
  const file = path.join(root, "fixtures/invalid/duplicate-keys.md");
  const parsed = parseCanonicalMarkdown(fs.readFileSync(file, "utf8"));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "duplicate_key");
});

test("custom yaml tags fail closed", async () => {
  const { parseCanonicalMarkdown } = await load();
  const file = path.join(root, "fixtures/invalid/bad-yaml-tag.md");
  const parsed = parseCanonicalMarkdown(fs.readFileSync(file, "utf8"));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "custom_tag");
});

test("oversized body fails closed", async () => {
  const { parseCanonicalMarkdown } = await load();
  const file = path.join(root, "fixtures/invalid/oversized-body.md");
  const parsed = parseCanonicalMarkdown(fs.readFileSync(file), {
    maxBytes: 64 * 1024,
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "too_large");
});

test("STANDING.md shape validates", async () => {
  const { validateStandingBody } = await load();
  const body = fs.readFileSync(
    path.join(root, "fixtures/synthetic-vault/AI Memory/STANDING.md"),
    "utf8",
  );
  const v = validateStandingBody(body);
  assert.equal(v.ok, true);
  assert.equal(v.trust, "standing");
});

test("correction requires supersedes", async () => {
  const { validateManagedMeta } = await load();
  const v = validateManagedMeta({
    schema: "pi-roaming-memory/memory@1",
    id: "mem_550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-08-10T00:00:00Z",
    origin_device_id: "4cf28a08-8c86-431a-8ad2-10cb27b56b16",
    kind: "correction",
    trust: "approved",
    scope: "global",
    supersedes: [],
    integrity_sha256: "ab",
  });
  assert.equal(v.ok, false);
});
