export type SensitiveHit = {
  rule: string;
  /** Always redacted sample — never raw secret */
  redacted: string;
};

const RULES: { name: string; re: RegExp }[] = [
  {
    name: "private_key",
    re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  },
  {
    name: "aws_access_key",
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "aws_secret_assignment",
    re: /aws_secret_access_key\s*=\s*\S+/i,
  },
  {
    name: "generic_api_key_assignment",
    re: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]/i,
  },
  {
    name: "openai_sk",
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "github_pat",
    re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: "slack_token",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
];

export function scanSensitive(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      hits.push({
        rule: rule.name,
        redacted: `[REDACTED:${rule.name}]`,
      });
    }
  }
  return hits;
}

export function assertNoSensitive(text: string): void {
  const hits = scanSensitive(text);
  if (hits.length) {
    throw new Error(
      `sensitive_data_blocked:${hits.map((h) => h.rule).join(",")}`,
    );
  }
}
