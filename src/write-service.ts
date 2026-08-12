import { publishCanonical } from "./atomic-publisher.js";
import { computeIntegritySha256, normalizeCanonicalBody, verifyIntegrity } from "./integrity.js";
import { parseCanonicalMarkdown } from "./canonical-parser.js";
import { validateManagedMeta } from "./schema-validator.js";
import { assertNoSensitive, scanSensitive } from "./sensitive.js";
import {
  memoryRelPath,
  checkpointRelPath,
  tombstoneRelPath,
  resolutionRelPath,
  serializeNote,
} from "./paths.js";
import { typedId, ensureDeviceId } from "./identity.js";
import { ProposalStore, type Proposal } from "./proposal-store.js";
import type { RoamingConfig } from "./config.js";
import { memoryRootAbs } from "./config.js";
import { formatWibTimestamp } from "./timestamp.js";
import path from "node:path";
import os from "node:os";

function runtimeDir(config: RoamingConfig): string {
  return path.dirname(path.resolve(expand(config.deviceIdFile)));
}

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function getProposalStore(config: RoamingConfig): ProposalStore {
  return new ProposalStore(path.join(runtimeDir(config), "proposals"));
}

export type ProposeMemoryInput = {
  kind: string;
  scope: string;
  title: string;
  body: string;
  tags?: string[];
  project_id?: string | null;
  workstream_id?: string | null;
  supersedes?: string[];
};

export function proposeMemory(
  config: RoamingConfig,
  input: ProposeMemoryInput,
): { ok: true; proposal: Proposal } | { ok: false; error: string; hits?: unknown } {
  try {
    assertNoSensitive(input.body);
    assertNoSensitive(input.title);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      hits: scanSensitive(input.body + "\n" + input.title),
    };
  }

  if (input.title.toLowerCase().includes("standing")) {
    // soft check — hard block is path based
  }

  const deviceId = ensureDeviceId(expand(config.deviceIdFile));
  const id = typedId("mem");
  const created_at = new Date().toISOString();
  const b = normalizeCanonicalBody(input.body);
  const meta: Record<string, unknown> = {
    schema: "pi-roaming-memory/memory@1",
    id,
    created_at,
    created_at_wib: formatWibTimestamp(created_at),
    origin_device_id: deviceId,
    kind: input.kind,
    trust: "approved",
    scope: input.scope,
    project_id: input.project_id ?? null,
    workstream_id: input.workstream_id ?? null,
    title: input.title,
    tags: input.tags ?? [],
    supersedes: input.supersedes ?? [],
    approved_by: "user",
    approved_at: created_at,
  };
  meta.integrity_sha256 = computeIntegritySha256(meta, b);
  const v = validateManagedMeta(meta);
  if (!v.ok) {
    return {
      ok: false,
      error: `schema:${v.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const bytesUtf8 = serializeNote(meta, b);
  // path must never target STANDING.md
  const relPath = memoryRelPath(id, created_at);
  if (relPath === "STANDING.md" || relPath.endsWith("/STANDING.md")) {
    return { ok: false, error: "standing_write_forbidden" };
  }
  const store = getProposalStore(config);
  const proposal = store.put({
    kind: "memory",
    relPath,
    bytesUtf8,
    meta,
    preview: bytesUtf8.slice(0, 2000),
    warnings: [],
  });
  return { ok: true, proposal };
}

export function proposeTombstone(
  config: RoamingConfig,
  targetId: string,
  reason_code: string,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const deviceId = ensureDeviceId(expand(config.deviceIdFile));
  const id = typedId("tmb");
  const created_at = new Date().toISOString();
  const body = normalizeCanonicalBody(
    `Tombstone for ${targetId}: ${reason_code}\n`,
  );
  const meta: Record<string, unknown> = {
    schema: "pi-roaming-memory/tombstone@1",
    id,
    created_at,
    created_at_wib: formatWibTimestamp(created_at),
    origin_device_id: deviceId,
    target_id: targetId,
    reason_code,
  };
  meta.integrity_sha256 = computeIntegritySha256(meta, body);
  const v = validateManagedMeta(meta);
  if (!v.ok) {
    return {
      ok: false,
      error: `schema:${v.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const bytesUtf8 = serializeNote(meta, body);
  const proposal = getProposalStore(config).put({
    kind: "tombstone",
    relPath: tombstoneRelPath(id, created_at),
    bytesUtf8,
    meta,
    preview: bytesUtf8.slice(0, 2000),
    warnings: [],
  });
  return { ok: true, proposal };
}

export function proposeResolution(
  config: RoamingConfig,
  conflict_ids: string[],
  accepts: string[],
  rejects: string[],
  rationale: string,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  try {
    assertNoSensitive(rationale);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const deviceId = ensureDeviceId(expand(config.deviceIdFile));
  const id = typedId("res");
  const created_at = new Date().toISOString();
  const body = normalizeCanonicalBody(rationale);
  const meta: Record<string, unknown> = {
    schema: "pi-roaming-memory/resolution@1",
    id,
    created_at,
    created_at_wib: formatWibTimestamp(created_at),
    origin_device_id: deviceId,
    conflict_ids,
    accepts,
    rejects,
    approved_by: "user",
    approved_at: created_at,
  };
  meta.integrity_sha256 = computeIntegritySha256(meta, body);
  const v = validateManagedMeta(meta);
  if (!v.ok) {
    return {
      ok: false,
      error: `schema:${v.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const bytesUtf8 = serializeNote(meta, body);
  const proposal = getProposalStore(config).put({
    kind: "resolution",
    relPath: resolutionRelPath(id, created_at),
    bytesUtf8,
    meta,
    preview: bytesUtf8.slice(0, 2000),
    warnings: [],
  });
  return { ok: true, proposal };
}

export function proposeCheckpointNote(
  config: RoamingConfig,
  metaIn: Record<string, unknown>,
  body: string,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  try {
    assertNoSensitive(body);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const created_at =
    typeof metaIn.created_at === "string"
      ? metaIn.created_at
      : new Date().toISOString();
  const id =
    typeof metaIn.id === "string" ? metaIn.id : typedId("chk");
  let created_at_wib: string;
  try {
    created_at_wib = formatWibTimestamp(created_at);
  } catch {
    return { ok: false, error: "invalid_created_at" };
  }
  const meta: Record<string, unknown> = {
    ...metaIn,
    schema: "pi-roaming-memory/checkpoint@1",
    id,
    created_at,
    created_at_wib,
  };
  const b = normalizeCanonicalBody(body);
  meta.integrity_sha256 = computeIntegritySha256(meta, b);
  const v = validateManagedMeta(meta);
  if (!v.ok) {
    return {
      ok: false,
      error: `schema:${v.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const bytesUtf8 = serializeNote(meta, b);
  const proposal = getProposalStore(config).put({
    kind: "checkpoint",
    relPath: checkpointRelPath(String(id), created_at),
    bytesUtf8,
    meta,
    preview: bytesUtf8.slice(0, 2000),
    warnings: [],
  });
  return { ok: true, proposal };
}

export function commitProposal(
  config: RoamingConfig,
  proposalId: string,
  opts: { confirmed: boolean },
): {
  ok: true;
  id: string;
  relPath: string;
} | {
  ok: false;
  error: string;
} {
  if (!opts.confirmed) {
    return { ok: false, error: "confirmation_required" };
  }
  const store = getProposalStore(config);
  if (store.wasConsumed(proposalId)) {
    return { ok: false, error: "proposal_already_consumed" };
  }
  const proposal = store.consume(proposalId);
  if (!proposal) {
    return { ok: false, error: "proposal_not_found_or_expired" };
  }

  // refuse STANDING targets
  if (
    proposal.relPath === "STANDING.md" ||
    proposal.relPath.endsWith("/STANDING.md")
  ) {
    return { ok: false, error: "standing_write_forbidden" };
  }

  // re-validate bytes
  try {
    assertNoSensitive(proposal.bytesUtf8);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const parsed = parseCanonicalMarkdown(proposal.bytesUtf8);
  if (!parsed.ok) {
    return { ok: false, error: `parse:${parsed.code}` };
  }
  const v = validateManagedMeta(parsed.meta);
  if (!v.ok) {
    return {
      ok: false,
      error: `schema:${v.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const integ = verifyIntegrity(parsed.meta, parsed.body);
  if (!integ.ok) {
    return { ok: false, error: "integrity_mismatch" };
  }

  const root = memoryRootAbs(config);
  const pub = publishCanonical({
    memoryRootAbs: root,
    relPath: proposal.relPath,
    bytes: proposal.bytesUtf8,
  });
  if (!pub.ok) {
    return { ok: false, error: `${pub.code}:${pub.message}` };
  }
  const id = typeof proposal.meta.id === "string" ? proposal.meta.id : "unknown";
  return { ok: true, id, relPath: pub.relPath };
}
