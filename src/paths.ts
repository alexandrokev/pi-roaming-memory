import path from "node:path";
import { normalizeCanonicalBody } from "./integrity.js";

const WIB_TIME_ZONE = "Asia/Jakarta";

/**
 * Partition key for canonical storage folders, rendered in Western Indonesian
 * Time (Asia/Jakarta) so folder grouping matches the local calendar day.
 * Files keep canonical UTC `created_at`; folder placement is display/sort
 * metadata only and never affects conflict or continuation precedence.
 */
export function storagePartition(isoOrDate: string | Date = new Date()): {
  yyyy: string;
  mm: string;
  dd: string;
} {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const values = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return { yyyy: values.year, mm: values.month, dd: values.day };
}

export function memoryRelPath(id: string, createdAt: string): string {
  const { yyyy, mm, dd } = storagePartition(createdAt);
  return path.posix.join("memories", yyyy, mm, dd, `${id}.md`);
}

export function checkpointRelPath(id: string, createdAt: string): string {
  const { yyyy, mm, dd } = storagePartition(createdAt);
  return path.posix.join("handoffs", yyyy, mm, dd, `${id}.md`);
}

export function tombstoneRelPath(id: string, createdAt: string): string {
  const { yyyy, mm, dd } = storagePartition(createdAt);
  return path.posix.join("tombstones", yyyy, mm, dd, `${id}.md`);
}

export function resolutionRelPath(id: string, createdAt: string): string {
  const { yyyy, mm, dd } = storagePartition(createdAt);
  return path.posix.join("resolutions", yyyy, mm, dd, `${id}.md`);
}

export function serializeNote(
  meta: Record<string, unknown>,
  body: string,
): string {
  const keys = [
    "schema",
    ...Object.keys(meta).filter(
      (k) => k !== "schema" && k !== "integrity_sha256",
    ),
    "integrity_sha256",
  ];
  const seen = new Set<string>();
  const lines: string[] = ["---"];
  for (const k of keys) {
    if (seen.has(k) || !(k in meta) || meta[k] === undefined) continue;
    seen.add(k);
    lines.push(`${k}: ${formatYamlScalar(meta[k])}`);
  }
  lines.push("---");
  const normalizedBody = normalizeCanonicalBody(body);
  return lines.join("\n") + "\n" + normalizedBody;
}

function formatYamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[${v.map((x) => formatBare(x)).join(", ")}]`;
  }
  return formatBare(v);
}

// YAML 1.1/1.2 ambiguous or numeric-looking strings that would parse back
// as null/bool/number (or Date) — always JSON-quote them to keep strings.
const YAML_AMBIGUOUS_SCALAR =
  /^(null|NULL|Null|~|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;
const YAML_NUMERIC_SCALAR =
  /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$|^[+-]?0[xX][0-9a-fA-F]+$|^[+-]?0[oO][0-7]+$|^[+-]?0[bB][01]+$/;
const YAML_SPECIAL_FLOAT =
  /^[+-]?(\.inf|\.Inf|\.INF|\.nan|\.NaN|\.NAN)$/;
const YAML_DATE_SCALAR =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function formatBare(v: unknown): string {
  if (typeof v !== "string") return String(v);
  if (v === "") return '""';
  if (
    YAML_AMBIGUOUS_SCALAR.test(v) ||
    YAML_NUMERIC_SCALAR.test(v) ||
    YAML_SPECIAL_FLOAT.test(v) ||
    YAML_DATE_SCALAR.test(v)
  ) {
    return JSON.stringify(v);
  }
  if (/[:#\[\]{},\n]/.test(v) || v.includes(" ")) return JSON.stringify(v);
  return v;
}
