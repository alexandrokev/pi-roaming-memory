import fs from "node:fs";
import path from "node:path";
import { parseCanonicalMarkdown } from "./canonical-parser.js";
import { verifyIntegrity } from "./integrity.js";
import {
  detectSchemaKind,
  validateManagedMeta,
  validateStandingBody,
  type NoteKind,
  type TrustClass,
} from "./schema-validator.js";
import {
  isStversionsPath,
  isSyncConflictName,
} from "./vault-boundary.js";

export type ScannedObject = {
  relPath: string;
  kind: NoteKind;
  trust: TrustClass;
  id: string | null;
  title: string | null;
  issues: string[];
  meta: Record<string, unknown> | null;
  bodyPreview: string | null;
};

export type ScanReport = {
  memoryRoot: string;
  objects: ScannedObject[];
  standing: {
    present: boolean;
    trust: TrustClass;
    conflictCopies: string[];
    issues: string[];
  };
  counts: Record<string, number>;
};

function walkFiles(root: string, base = root, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const abs = path.join(root, ent.name);
    const rel = path.relative(base, abs).replace(/\\/g, "/");
    if (ent.isSymbolicLink()) {
      // record as invalid path later via explicit check
      out.push(abs);
      continue;
    }
    if (ent.isDirectory()) {
      if (ent.name === ".git") continue;
      walkFiles(abs, base, out);
      continue;
    }
    if (ent.isFile()) out.push(abs);
  }
  return out;
}

function preview(body: string, n = 160): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n) + "…";
}

export function scanMemoryRoot(
  memoryRootAbs: string,
  opts: { maxReadBytes?: number } = {},
): ScanReport {
  const maxReadBytes = opts.maxReadBytes ?? 131072;
  const objects: ScannedObject[] = [];
  const standingConflicts: string[] = [];
  let standingPresent = false;
  let standingTrust: TrustClass = "invalid";
  const standingIssues: string[] = [];

  const files = walkFiles(memoryRootAbs);
  // case-fold detection
  const lowerMap = new Map<string, string[]>();
  for (const abs of files) {
    const rel = path.relative(memoryRootAbs, abs).replace(/\\/g, "/");
    const key = rel.toLowerCase();
    const list = lowerMap.get(key) ?? [];
    list.push(rel);
    lowerMap.set(key, list);
  }
  const casefold = new Set<string>();
  for (const [, list] of lowerMap) {
    if (new Set(list).size > 1) {
      for (const r of list) casefold.add(r);
    }
  }

  for (const abs of files) {
    const rel = path.relative(memoryRootAbs, abs).replace(/\\/g, "/");
    const base = path.basename(rel);

    // skip non-markdown except we still want to know unknown files? only .md
    if (!base.toLowerCase().endsWith(".md") && base !== "README.md") {
      continue;
    }
    if (base === "README.md") continue;

    if (isStversionsPath(rel)) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: ["stversions_excluded"],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch (err) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: [`io:${err instanceof Error ? err.message : String(err)}`],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }
    if (st.isSymbolicLink()) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: ["symlink"],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    if (casefold.has(rel)) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: ["casefold_collision"],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    if (isSyncConflictName(base) || isSyncConflictName(rel)) {
      if (base.startsWith("STANDING.sync-conflict")) {
        standingConflicts.push(rel);
      }
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "conflicted",
        id: null,
        title: null,
        issues: ["sync_conflict_copy"],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    // Inbox ordinary markdown
    if (rel === "inbox" || rel.startsWith("inbox/")) {
      objects.push({
        relPath: rel,
        kind: "inbox",
        trust: "inbox",
        id: null,
        title: base,
        issues: [],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch (err) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: [`read:${err instanceof Error ? err.message : String(err)}`],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    if (base === "STANDING.md" && path.dirname(rel) === ".") {
      standingPresent = true;
      const text = buf.toString("utf8");
      const v = validateStandingBody(text);
      if (!v.ok) {
        standingTrust = "invalid";
        standingIssues.push(...v.issues.map((i) => i.message));
      } else {
        standingTrust = "standing";
      }
      objects.push({
        relPath: rel,
        kind: "standing",
        trust: standingConflicts.length ? "conflicted" : standingTrust,
        id: null,
        title: "STANDING.md",
        issues: standingConflicts.length
          ? ["standing_conflict_copy_present"]
          : standingIssues.slice(),
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    const parsed = parseCanonicalMarkdown(buf, { maxBytes: maxReadBytes });
    if (!parsed.ok) {
      objects.push({
        relPath: rel,
        kind: "unknown",
        trust: "invalid",
        id: null,
        title: null,
        issues: [`parse:${parsed.code}:${parsed.message}`],
        meta: null,
        bodyPreview: null,
      });
      continue;
    }

    const kind = detectSchemaKind(parsed.meta);
    const validated = validateManagedMeta(parsed.meta);
    const issues: string[] = [];
    if (!validated.ok) {
      issues.push(...validated.issues.map((i) => `${i.path}:${i.message}`));
    }
    const integ = verifyIntegrity(parsed.meta, parsed.body);
    if (!integ.ok) {
      issues.push("integrity_mismatch");
    }

    const id = typeof parsed.meta.id === "string" ? parsed.meta.id : null;
    const title =
      typeof parsed.meta.title === "string"
        ? parsed.meta.title
        : id;

    objects.push({
      relPath: rel,
      kind,
      trust: issues.length ? "invalid" : validated.ok ? validated.trust : "invalid",
      id,
      title,
      issues,
      meta: parsed.meta,
      bodyPreview: preview(parsed.body),
    });
  }

  // If standing conflicts exist, force standing trust conflicted
  if (standingConflicts.length) {
    standingTrust = "conflicted";
    standingIssues.push("standing_conflict_copy_present");
    for (const o of objects) {
      if (o.kind === "standing") {
        o.trust = "conflicted";
        if (!o.issues.includes("standing_conflict_copy_present")) {
          o.issues.push("standing_conflict_copy_present");
        }
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const o of objects) {
    const k = `${o.kind}:${o.trust}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return {
    memoryRoot: memoryRootAbs,
    objects,
    standing: {
      present: standingPresent,
      trust: standingConflicts.length
        ? "conflicted"
        : standingPresent
          ? standingTrust
          : "invalid",
      conflictCopies: standingConflicts,
      issues: standingIssues,
    },
    counts,
  };
}

export function getById(
  report: ScanReport,
  id: string,
): ScannedObject | undefined {
  return report.objects.find((o) => o.id === id);
}
