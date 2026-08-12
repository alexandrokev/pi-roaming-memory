import { formatWibTimestamp } from "./timestamp.js";

export type TrustClass =
  | "standing"
  | "approved"
  | "inbox"
  | "imported"
  | "conflicted"
  | "invalid";

export type NoteKind =
  | "memory"
  | "checkpoint"
  | "tombstone"
  | "resolution"
  | "standing"
  | "inbox"
  | "unknown";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; kind: NoteKind; trust: TrustClass }
  | { ok: false; kind: NoteKind; trust: "invalid"; issues: ValidationIssue[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MEMORY_KINDS = new Set([
  "decision",
  "convention",
  "correction",
  "pitfall",
  "preference",
  "reference",
]);

function reqString(
  meta: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): string | null {
  const v = meta[key];
  if (typeof v !== "string" || !v) {
    issues.push({ path: key, message: "required string" });
    return null;
  }
  return v;
}

function reqId(
  meta: Record<string, unknown>,
  key: string,
  prefix: string,
  issues: ValidationIssue[],
): void {
  const v = reqString(meta, key, issues);
  if (!v) return;
  if (!v.startsWith(prefix)) {
    issues.push({ path: key, message: `must start with ${prefix}` });
    return;
  }
  const uuid = v.slice(prefix.length);
  if (!UUID_RE.test(uuid)) {
    issues.push({ path: key, message: "invalid uuid" });
  }
}

export function detectSchemaKind(meta: Record<string, unknown>): NoteKind {
  const schema = meta.schema;
  if (typeof schema !== "string") return "unknown";
  if (schema === "pi-roaming-memory/memory@1") return "memory";
  if (schema === "pi-roaming-memory/checkpoint@1") return "checkpoint";
  if (schema === "pi-roaming-memory/tombstone@1") return "tombstone";
  if (schema === "pi-roaming-memory/resolution@1") return "resolution";
  return "unknown";
}

export function validateManagedMeta(
  meta: Record<string, unknown>,
): ValidationResult {
  const kind = detectSchemaKind(meta);
  const issues: ValidationIssue[] = [];

  if (kind === "unknown") {
    return {
      ok: false,
      kind,
      trust: "invalid",
      issues: [{ path: "schema", message: "unknown or missing schema" }],
    };
  }

  const createdAt = reqString(meta, "created_at", issues);
  let expectedCreatedAtWib: string | null = null;
  if (createdAt) {
    try {
      expectedCreatedAtWib = formatWibTimestamp(createdAt);
    } catch {
      issues.push({ path: "created_at", message: "invalid timestamp" });
    }
  }
  if (meta.created_at_wib !== undefined) {
    if (typeof meta.created_at_wib !== "string") {
      issues.push({ path: "created_at_wib", message: "must be string" });
    } else if (
      expectedCreatedAtWib !== null &&
      meta.created_at_wib !== expectedCreatedAtWib
    ) {
      issues.push({
        path: "created_at_wib",
        message: "must match created_at in Asia/Jakarta",
      });
    }
  }
  reqString(meta, "origin_device_id", issues);
  if (
    typeof meta.origin_device_id === "string" &&
    !UUID_RE.test(meta.origin_device_id)
  ) {
    issues.push({ path: "origin_device_id", message: "invalid uuid" });
  }
  reqString(meta, "integrity_sha256", issues);

  if (kind === "memory") {
    reqId(meta, "id", "mem_", issues);
    const mk = reqString(meta, "kind", issues);
    if (mk && !MEMORY_KINDS.has(mk)) {
      issues.push({ path: "kind", message: "invalid memory kind" });
    }
    if (meta.trust !== "approved") {
      issues.push({ path: "trust", message: "managed memory trust must be approved" });
    }
    const scope = reqString(meta, "scope", issues);
    if (scope && !["global", "project", "workstream"].includes(scope)) {
      issues.push({ path: "scope", message: "invalid scope" });
    }
    if (scope === "project" && typeof meta.project_id !== "string") {
      issues.push({ path: "project_id", message: "required for project scope" });
    }
    if (scope === "workstream") {
      if (typeof meta.project_id !== "string") {
        issues.push({ path: "project_id", message: "required for workstream scope" });
      }
      if (typeof meta.workstream_id !== "string") {
        issues.push({
          path: "workstream_id",
          message: "required for workstream scope",
        });
      }
    }
    if (mk === "correction") {
      if (!Array.isArray(meta.supersedes) || meta.supersedes.length === 0) {
        issues.push({
          path: "supersedes",
          message: "correction requires non-empty supersedes",
        });
      }
    }
    if (meta.supersedes !== undefined && !Array.isArray(meta.supersedes)) {
      issues.push({ path: "supersedes", message: "must be array" });
    }
  } else if (kind === "checkpoint") {
    reqId(meta, "id", "chk_", issues);
    reqString(meta, "project_id", issues);
    reqString(meta, "workstream_id", issues);
    if (typeof meta.workspace_dirty !== "boolean") {
      issues.push({ path: "workspace_dirty", message: "required boolean" });
    }
    if (
      meta.validation_state !== "unverified" &&
      meta.validation_state !== "checked" &&
      meta.validation_state !== "verified"
    ) {
      issues.push({ path: "validation_state", message: "invalid" });
    }
    if (meta.changed_paths !== undefined && !Array.isArray(meta.changed_paths)) {
      issues.push({ path: "changed_paths", message: "must be array" });
    }
  } else if (kind === "tombstone") {
    reqId(meta, "id", "tmb_", issues);
    reqId(meta, "target_id", "mem_", issues);
    reqString(meta, "reason_code", issues);
  } else if (kind === "resolution") {
    reqId(meta, "id", "res_", issues);
    for (const k of ["conflict_ids", "accepts", "rejects"] as const) {
      if (!Array.isArray(meta[k])) {
        issues.push({ path: k, message: "must be array" });
      }
    }
  }

  if (issues.length) {
    return { ok: false, kind, trust: "invalid", issues };
  }
  return { ok: true, kind, trust: "approved" };
}

export function validateStandingBody(body: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (Buffer.byteLength(body, "utf8") > 16 * 1024) {
    issues.push({ path: "body", message: "STANDING.md exceeds 16 KiB" });
  }
  if (!body.startsWith("# Standing Instructions")) {
    issues.push({
      path: "body",
      message: "must start with # Standing Instructions",
    });
  }
  for (const h of ["## Preferences", "## Safety Rules", "## Workflow"]) {
    if (!body.includes(h)) {
      issues.push({ path: "body", message: `missing section ${h}` });
    }
  }
  if (issues.length) {
    return { ok: false, kind: "standing", trust: "invalid", issues };
  }
  return { ok: true, kind: "standing", trust: "standing" };
}
