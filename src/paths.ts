import path from "node:path";
import { normalizeCanonicalBody } from "./integrity.js";

/** YYYY/MM from RFC3339 or Date. */
export function yearMonth(isoOrDate: string | Date = new Date()): {
  yyyy: string;
  mm: string;
} {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { yyyy, mm };
}

export function memoryRelPath(id: string, createdAt: string): string {
  const { yyyy, mm } = yearMonth(createdAt);
  return path.posix.join("memories", yyyy, mm, `${id}.md`);
}

export function checkpointRelPath(id: string, createdAt: string): string {
  const { yyyy, mm } = yearMonth(createdAt);
  return path.posix.join("handoffs", yyyy, mm, `${id}.md`);
}

export function tombstoneRelPath(id: string, createdAt: string): string {
  const { yyyy, mm } = yearMonth(createdAt);
  return path.posix.join("tombstones", yyyy, mm, `${id}.md`);
}

export function resolutionRelPath(id: string, createdAt: string): string {
  const { yyyy, mm } = yearMonth(createdAt);
  return path.posix.join("resolutions", yyyy, mm, `${id}.md`);
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
