/**
 * Fail-closed Markdown + YAML frontmatter parser for Canonical Notes.
 * Rejects custom tags, alias bombs, duplicate keys, non-UTF8-replaced text,
 * and oversized payloads.
 */

export type ParseFailureCode =
  | "not_utf8_roundtrip"
  | "missing_frontmatter"
  | "yaml_error"
  | "duplicate_key"
  | "custom_tag"
  | "alias_forbidden"
  | "too_large"
  | "empty_body_separator";

export type ParseResult =
  | {
      ok: true;
      meta: Record<string, unknown>;
      body: string;
      raw: string;
    }
  | {
      ok: false;
      code: ParseFailureCode;
      message: string;
    };

const DEFAULT_MAX_BYTES = 256 * 1024;
const MAX_YAML_LINES = 400;
const MAX_NESTING = 8;

export function parseCanonicalMarkdown(
  raw: string | Buffer,
  opts: { maxBytes?: number } = {},
): ParseResult {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  if (buf.byteLength > maxBytes) {
    return {
      ok: false,
      code: "too_large",
      message: `exceeds maxBytes ${maxBytes}`,
    };
  }
  const text = buf.toString("utf8");
  // Reject non-UTF8 that needed replacement (when source was Buffer with invalid seqs)
  if (Buffer.isBuffer(raw) && !buf.equals(Buffer.from(text, "utf8"))) {
    return {
      ok: false,
      code: "not_utf8_roundtrip",
      message: "invalid UTF-8",
    };
  }
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return {
      ok: false,
      code: "missing_frontmatter",
      message: "opening --- required",
    };
  }
  const nl = text.startsWith("---\r\n") ? "\r\n" : "\n";
  const openLen = 3 + nl.length;
  const closeToken = `${nl}---${nl}`;
  const closeAt = text.indexOf(closeToken, openLen);
  if (closeAt === -1) {
    return {
      ok: false,
      code: "missing_frontmatter",
      message: "closing --- required",
    };
  }
  const yamlText = text.slice(openLen, closeAt);
  const body = text.slice(closeAt + closeToken.length);

  if (yamlText.split(/\r?\n/).length > MAX_YAML_LINES) {
    return {
      ok: false,
      code: "too_large",
      message: "yaml line count exceeded",
    };
  }

  // Hard reject dangerous YAML features before structured parse.
  if (/(^|\s)!!\w/.test(yamlText)) {
    return {
      ok: false,
      code: "custom_tag",
      message: "custom YAML tags forbidden",
    };
  }
  if (/&\w+|\*\w+/.test(yamlText)) {
    return {
      ok: false,
      code: "alias_forbidden",
      message: "YAML anchors/aliases forbidden",
    };
  }

  try {
    const meta = parseStrictYamlSubset(yamlText);
    return { ok: true, meta, body, raw: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("duplicate_key:")) {
      return {
        ok: false,
        code: "duplicate_key",
        message: msg,
      };
    }
    return { ok: false, code: "yaml_error", message: msg };
  }
}

/**
 * Minimal YAML 1.2 subset: flat mapping, scalars, flow sequences.
 * Intentionally tiny — Canonical Notes do not need nested maps yet.
 */
function parseStrictYamlSubset(yaml: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const seen = new Set<string>();
  const lines = yaml.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      throw new Error("nested yaml blocks unsupported");
    }
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) throw new Error(`unsupported yaml line: ${line}`);
    const key = m[1];
    if (seen.has(key)) throw new Error(`duplicate_key:${key}`);
    seen.add(key);
    root[key] = parseScalar(m[2]);
  }
  // nesting guard placeholder for future nested support
  void MAX_NESTING;
  return root;
}

function parseScalar(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => coerceBare(part.trim()));
  }
  return coerceBare(s);
}

function coerceBare(s: string): string | number | boolean | null {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  if (s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}
