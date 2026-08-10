import path from "node:path";

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
    if (seen.has(k) || !(k in meta)) continue;
    seen.add(k);
    lines.push(`${k}: ${formatYamlScalar(meta[k])}`);
  }
  lines.push("---");
  const normalizedBody = body.startsWith("\n") ? body : `\n${body}`;
  const withTrailing = normalizedBody.endsWith("\n")
    ? normalizedBody
    : normalizedBody + "\n";
  return lines.join("\n") + "\n" + withTrailing;
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

function formatBare(v: unknown): string {
  if (typeof v !== "string") return String(v);
  if (v === "") return '""';
  if (/[:#\[\]{},\n]/.test(v) || v.includes(" ")) return JSON.stringify(v);
  return v;
}
