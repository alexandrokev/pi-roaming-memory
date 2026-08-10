import crypto from "node:crypto";

/** Minimal RFC 8785-style JCS for JSON-safe fixture/meta values. */
export function jcs(value: unknown): string {
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
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(obj[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported jcs type: ${typeof value}`);
}

export function computeIntegritySha256(
  meta: Record<string, unknown>,
  body: string,
): string {
  const { integrity_sha256: _drop, ...rest } = meta;
  const canonical = jcs(rest) + "\n" + body;
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyIntegrity(
  meta: Record<string, unknown>,
  body: string,
): { ok: true } | { ok: false; expected: string; actual: unknown } {
  const expected = computeIntegritySha256(meta, body);
  const actual = meta.integrity_sha256;
  if (typeof actual !== "string" || actual.toLowerCase() !== expected) {
    return { ok: false, expected, actual };
  }
  return { ok: true };
}
