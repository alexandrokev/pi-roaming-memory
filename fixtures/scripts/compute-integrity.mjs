#!/usr/bin/env node
/**
 * Compute integrity_sha256 for a canonical note body+frontmatter.
 *
 * Spec (docs/DESIGN.md §9):
 *   sha256( JCS(metadata without integrity_sha256) + "\n" + utf8(body) )
 *
 * JCS here is a minimal RFC 8785-compatible canonical JSON:
 * - object keys sorted lexicographically
 * - no insignificant whitespace
 * - only JSON-safe scalars used in fixtures
 *
 * Usage:
 *   node fixtures/scripts/compute-integrity.mjs <file.md>
 *   node fixtures/scripts/compute-integrity.mjs --write <file.md>
 */
import fs from "node:fs";
import crypto from "node:crypto";

function jcs(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jcs).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported type: ${typeof value}`);
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) throw new Error("missing opening frontmatter");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("missing closing frontmatter");
  const yaml = text.slice(4, end);
  const body = text.slice(end + 5);
  return { yaml, body };
}

// Minimal YAML subset sufficient for fixtures (no anchors/tags).
function parseSimpleYaml(yaml) {
  const lines = yaml.split("\n");
  const root = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) throw new Error(`unsupported yaml line: ${line}`);
    const key = m[1];
    let raw = m[2];
    if (raw === "" || raw === "|" || raw === ">") {
      throw new Error(`multiline unsupported at ${key}`);
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      root[key] = inner
        ? inner.split(",").map((s) => unquote(s.trim()))
        : [];
    } else if (raw === "null") {
      root[key] = null;
    } else if (raw === "true" || raw === "false") {
      root[key] = raw === "true";
    } else if (/^-?\d+$/.test(raw)) {
      root[key] = Number(raw);
    } else {
      root[key] = unquote(raw);
    }
    i++;
  }
  return root;
}

function unquote(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function dumpSimpleYaml(obj) {
  const keys = Object.keys(obj);
  // keep human order: schema first, integrity last if present
  const ordered = [
    ...keys.filter((k) => k === "schema"),
    ...keys.filter((k) => k !== "schema" && k !== "integrity_sha256"),
    ...keys.filter((k) => k === "integrity_sha256"),
  ];
  return ordered
    .map((k) => {
      const v = obj[k];
      if (v === null) return `${k}: null`;
      if (typeof v === "boolean") return `${k}: ${v}`;
      if (typeof v === "number") return `${k}: ${v}`;
      if (Array.isArray(v)) {
        if (v.length === 0) return `${k}: []`;
        const parts = v.map((x) =>
          typeof x === "string" && /[:#\[\]{},]/.test(x) ? JSON.stringify(x) : String(x),
        );
        return `${k}: [${parts.join(", ")}]`;
      }
      return `${k}: ${String(v)}`;
    })
    .join("\n");
}

export function computeIntegrity(meta, body) {
  const { integrity_sha256: _drop, ...rest } = meta;
  const canonical = jcs(rest) + "\n" + body;
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function main() {
  const args = process.argv.slice(2);
  const write = args[0] === "--write";
  const file = write ? args[1] : args[0];
  if (!file) {
    console.error("usage: compute-integrity.mjs [--write] <file.md>");
    process.exit(2);
  }
  const text = fs.readFileSync(file, "utf8");
  const { yaml, body } = parseFrontmatter(text);
  const meta = parseSimpleYaml(yaml);
  const hash = computeIntegrity(meta, body);
  if (!write) {
    console.log(hash);
    return;
  }
  meta.integrity_sha256 = hash;
  const out = `---\n${dumpSimpleYaml(meta)}\n---\n${body}`;
  fs.writeFileSync(file, out);
  console.log(`wrote ${file} integrity_sha256=${hash}`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href
  || process.argv[1]?.endsWith('compute-integrity.mjs');
if (isMain) main();
