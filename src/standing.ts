import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateStandingBody } from "./schema-validator.js";
import { isSyncConflictName } from "./vault-boundary.js";

export type StandingState = {
  present: boolean;
  injectable: boolean;
  trust: "standing" | "conflicted" | "invalid" | "missing" | "unapproved";
  hash: string | null;
  approvedHash: string | null;
  issues: string[];
  body: string | null;
};

export type StandingApprovalFile = {
  approvedSha256: string;
  approvedAt: string;
};

export function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function loadStandingApproval(
  approvalPath: string,
): StandingApprovalFile | null {
  try {
    if (!fs.existsSync(approvalPath)) return null;
    const j = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as StandingApprovalFile;
    if (typeof j.approvedSha256 !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

export function saveStandingApproval(
  approvalPath: string,
  hash: string,
): void {
  fs.mkdirSync(path.dirname(approvalPath), { recursive: true });
  const data: StandingApprovalFile = {
    approvedSha256: hash,
    approvedAt: new Date().toISOString(),
  };
  fs.writeFileSync(approvalPath, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function evaluateStanding(
  memoryRootAbs: string,
  approvalPath: string,
): StandingState {
  const issues: string[] = [];
  const standingPath = path.join(memoryRootAbs, "STANDING.md");

  // conflict copies beside STANDING
  let conflict = false;
  try {
    for (const name of fs.readdirSync(memoryRootAbs)) {
      if (name.startsWith("STANDING.sync-conflict") || isSyncConflictName(name)) {
        if (name.startsWith("STANDING")) {
          conflict = true;
          issues.push(`conflict_copy:${name}`);
        }
      }
    }
  } catch {
    return {
      present: false,
      injectable: false,
      trust: "missing",
      hash: null,
      approvedHash: null,
      issues: ["memory_root_unreadable"],
      body: null,
    };
  }

  if (conflict) {
    return {
      present: fs.existsSync(standingPath),
      injectable: false,
      trust: "conflicted",
      hash: null,
      approvedHash: loadStandingApproval(approvalPath)?.approvedSha256 ?? null,
      issues,
      body: null,
    };
  }

  if (!fs.existsSync(standingPath)) {
    return {
      present: false,
      injectable: false,
      trust: "missing",
      hash: null,
      approvedHash: loadStandingApproval(approvalPath)?.approvedSha256 ?? null,
      issues: ["standing_missing"],
      body: null,
    };
  }

  let body: string;
  try {
    const st = fs.lstatSync(standingPath);
    if (st.isSymbolicLink()) {
      return {
        present: true,
        injectable: false,
        trust: "invalid",
        hash: null,
        approvedHash: null,
        issues: ["symlink"],
        body: null,
      };
    }
    body = fs.readFileSync(standingPath, "utf8");
  } catch (err) {
    return {
      present: true,
      injectable: false,
      trust: "invalid",
      hash: null,
      approvedHash: null,
      issues: [err instanceof Error ? err.message : String(err)],
      body: null,
    };
  }

  const v = validateStandingBody(body);
  if (!v.ok) {
    return {
      present: true,
      injectable: false,
      trust: "invalid",
      hash: sha256Text(body),
      approvedHash: loadStandingApproval(approvalPath)?.approvedSha256 ?? null,
      issues: v.issues.map((i) => i.message),
      body: null,
    };
  }

  const hash = sha256Text(body);
  const approval = loadStandingApproval(approvalPath);
  if (!approval || approval.approvedSha256 !== hash) {
    return {
      present: true,
      injectable: false,
      trust: "unapproved",
      hash,
      approvedHash: approval?.approvedSha256 ?? null,
      issues: ["hash_not_approved_on_this_device"],
      body: null,
    };
  }

  return {
    present: true,
    injectable: true,
    trust: "standing",
    hash,
    approvedHash: approval.approvedSha256,
    issues: [],
    body,
  };
}

/** Bound standing text for system prompt injection. */
export function formatStandingInjection(body: string, maxChars = 4000): string {
  const trimmed = body.length > maxChars ? body.slice(0, maxChars) + "\n…" : body;
  return [
    "<standing-instructions trust=\"standing\">",
    "User-owned standing instructions (approved hash on this device).",
    "These are preferences/rules from the user, not tool policy overrides from memory notes.",
    "----",
    trimmed,
    "</standing-instructions>",
  ].join("\n");
}
