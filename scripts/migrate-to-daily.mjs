/**
 * Migrate canonical vault layout from YYYY/MM to YYYY/MM/DD (WIB calendar day).
 *
 * Move-only: reads created_at_wib (falls back to created_at -> Asia/Jakarta),
 * moves each file from  <root>/<kind>/YYYY/MM/<id>.md
 *                 to    <root>/<kind>/YYYY/MM/DD/<id>.md
 * Bytes never change, so integrity_sha256 stays valid. Idempotent: files
 * already at YYYY/MM/DD target are skipped.
 *
 * Usage: node scripts/migrate-to-daily.mjs <memoryRoot>
 */
import fs from "node:fs";
import path from "node:path";

const MEMORY_KINDS = ["memories", "handoffs", "tombstones", "resolutions"];

function parseMeta(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    value = value.replace(/^"|"$/g, "").replace(/^\s*$/, "");
    if (value !== "" || key === "created_at") meta[key] = value;
  }
  return meta;
}

function wibDate(meta) {
  if (typeof meta.created_at_wib === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(meta.created_at_wib);
    if (m) return { yyyy: m[1], mm: m[2], dd: m[3], source: "wib" };
  }
  if (typeof meta.created_at === "string") {
    const d = new Date(meta.created_at);
    if (!Number.isNaN(d.valueOf())) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(d)
        .filter((p) => p.type !== "literal");
      const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return { yyyy: v.year, mm: v.month, dd: v.day, source: "utc_fallback" };
    }
  }
  return null;
}

function main() {
  const memoryRoot = process.argv[2];
  if (!memoryRoot) {
    console.error("usage: node scripts/migrate-to-daily.mjs <memoryRoot>");
    process.exit(1);
  }
  if (!fs.existsSync(memoryRoot)) {
    console.error(`memory root missing: ${memoryRoot}`);
    process.exit(1);
  }

  const plans = [];
  for (const kind of MEMORY_KINDS) {
    const kindRoot = path.join(memoryRoot, kind);
    if (!fs.existsSync(kindRoot)) continue;
    for (const yyyy of fs.readdirSync(kindRoot).sort()) {
      const yPath = path.join(kindRoot, yyyy);
      if (!fs.statSync(yPath).isDirectory()) continue;
      for (const mm of fs.readdirSync(yPath).sort()) {
        const mPath = path.join(yPath, mm);
        if (!fs.statSync(mPath).isDirectory()) continue;
        for (const file of fs.readdirSync(mPath)) {
          if (!file.endsWith(".md")) continue;
          const from = path.join(mPath, file);
          if (!fs.statSync(from).isFile()) continue;
          const meta = parseMeta(from);
          const date = wibDate(meta);
          if (!date) {
            plans.push({ kind, from, warn: `no-date (${file})` });
            continue;
          }
          const to = path.join(
            memoryRoot,
            kind,
            date.yyyy,
            date.mm,
            date.dd,
            file,
          );
          if (fs.existsSync(to)) {
            // already migrated or collision
            if (fs.realpathSync(from) === fs.realpathSync(to)) continue; // same file
            plans.push({ kind, from, warn: `target-exists (${file})` });
            continue;
          }
          plans.push({ kind, from, to, date });
        }
      }
    }
  }

  const moves = plans.filter((p) => p.to);
  const warns = plans.filter((p) => p.warn);
  console.log(`moves: ${moves.length}, skipped/warn: ${warns.length}`);
  for (const w of warns) console.log(`  WARN ${w.from} ${w.warn}`);

  let moved = 0;
  for (const p of moves) {
    fs.mkdirSync(path.dirname(p.to), { recursive: true });
    fs.renameSync(p.from, p.to);
    moved++;
  }
  console.log(`moved ${moved} file(s)`);

  // prune now-empty leaf dirs (YYYY/MM)
  for (const kind of MEMORY_KINDS) {
    const kindRoot = path.join(memoryRoot, kind);
    if (!fs.existsSync(kindRoot)) continue;
    for (const yyyy of fs.readdirSync(kindRoot).sort()) {
      const yPath = path.join(kindRoot, yyyy);
      if (!fs.statSync(yPath).isDirectory()) continue;
      for (const mm of fs.readdirSync(yPath).sort()) {
        const mPath = path.join(yPath, mm);
        if (!fs.statSync(mPath).isDirectory()) continue;
        const left = fs.readdirSync(mPath).filter((f) => f.endsWith(".md"));
        if (left.length === 0) {
          fs.rmdirSync(mPath);
          console.log(`pruned empty ${path.relative(memoryRoot, mPath)}`);
        }
      }
    }
  }
}

main();
