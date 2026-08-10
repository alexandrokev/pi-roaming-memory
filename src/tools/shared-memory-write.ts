import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RoamingConfig } from "../config.js";
import {
  proposeMemory,
  proposeTombstone,
  proposeResolution,
  commitProposal,
} from "../write-service.js";
import { rebuildProjection } from "../projection/index.js";
import { memoryRootAbs } from "../config.js";
import { createCheckpoint, type CheckpointDraft } from "../checkpoint.js";
import { getPendingCheckpointCwd } from "../pending-checkpoint.js";
import path from "node:path";
import os from "node:os";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * Restricted write tool. Suggest-first; approve requires approved=true.
 * Legacy alias commit_proposal (confirmed=true) kept as deprecated.
 * Never targets STANDING.md.
 */
export function registerSharedMemoryWriteTool(
  pi: ExtensionAPI,
  config: RoamingConfig,
) {
  pi.registerTool({
    name: "shared_memory_write",
    label: "Shared Memory Write",
    description:
      "Durable writes to the roaming Markdown vault. Actions: propose_memory, propose_tombstone, propose_resolution, approve_proposal, publish_checkpoint (commit_proposal kept as deprecated alias). approve_proposal requires approved=true after explicit user approval. After propose_*, show preview and wait for explicit user approval before approve_proposal approved=true. Never auto-approve durable memories. This tool approves/saves memory proposals — it never runs a Git commit. publish_checkpoint is for session handoff after user /handoff or system threshold — agent-authored, auto-committed (user intent = /handoff/threshold), no suggest-first confirm. Still never writes STANDING.md.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string" },
        kind: { type: "string" },
        scope: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        project_id: { type: "string" },
        workstream_id: { type: "string" },
        supersedes: { type: "array", items: { type: "string" } },
        target_id: { type: "string" },
        reason_code: { type: "string" },
        conflict_ids: { type: "array", items: { type: "string" } },
        accepts: { type: "array", items: { type: "string" } },
        rejects: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
        proposal_id: { type: "string" },
        approved: {
          type: "boolean",
          description: "approve_proposal: must be true after explicit user approval",
        },
        confirmed: {
          type: "boolean",
          description: "legacy commit_proposal alias: must be true (deprecated)",
        },
        goal: { type: "string" },
        completed: { type: "array", items: { type: "string" } },
        current_state: { type: "string" },
        remaining: { type: "array", items: { type: "string" } },
        blockers: { type: "array", items: { type: "string" } },
        next_action: { type: "string" },
        parent_checkpoint_id: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["action"],
    } as any,
    async execute(
      _id: string,
      params: Record<string, any>,
    ) {
      const action = String(params.action || "");

      if (action === "propose_memory") {
        const r = proposeMemory(config, {
          kind: String(params.kind || "decision"),
          scope: String(params.scope || "global"),
          title: String(params.title || ""),
          body: String(params.body || ""),
          tags: params.tags,
          project_id: params.project_id ?? null,
          workstream_id: params.workstream_id ?? null,
          supersedes: params.supersedes,
        });
        if (!r.ok) return jsonResult(r);
        return jsonResult({
          ok: true,
          action,
          proposal_id: r.proposal.id,
          relPath: r.proposal.relPath,
          preview: r.proposal.preview,
          note: "Vault unchanged until approve_proposal with approved=true after explicit user approval.",
        });
      }

      if (action === "propose_tombstone") {
        const r = proposeTombstone(
          config,
          String(params.target_id || ""),
          String(params.reason_code || "obsolete"),
        );
        if (!r.ok) return jsonResult(r);
        return jsonResult({
          ok: true,
          action,
          proposal_id: r.proposal.id,
          preview: r.proposal.preview,
        });
      }

      if (action === "propose_resolution") {
        const r = proposeResolution(
          config,
          params.conflict_ids || [],
          params.accepts || [],
          params.rejects || [],
          String(params.rationale || ""),
        );
        if (!r.ok) return jsonResult(r);
        return jsonResult({
          ok: true,
          action,
          proposal_id: r.proposal.id,
          preview: r.proposal.preview,
        });
      }

      if (action === "approve_proposal") {
        const r = commitProposal(config, String(params.proposal_id || ""), {
          confirmed: params.approved === true,
        });
        if (r.ok) {
          try {
            rebuildProjection(memoryRootAbs(config), expand(config.indexFile), {
              maxReadBytes: config.maxReadBytes,
            }).db.close();
          } catch {
            /* index best-effort */
          }
          return jsonResult(r);
        }
        if (r.error === "confirmation_required") {
          return jsonResult({
            ok: false,
            error: "approval_required",
            proposal_id: String(params.proposal_id || ""),
            note: "approve_proposal requires approved:true after explicit user approval.",
          });
        }
        return jsonResult(r);
      }

      if (action === "commit_proposal") {
        const r = commitProposal(config, String(params.proposal_id || ""), {
          confirmed: params.confirmed === true,
        });
        if (r.ok) {
          try {
            rebuildProjection(memoryRootAbs(config), expand(config.indexFile), {
              maxReadBytes: config.maxReadBytes,
            }).db.close();
          } catch {
            /* index best-effort */
          }
          return jsonResult({
            ...r,
            deprecated: true,
            note: "Use approve_proposal with approved:true; commit_proposal is deprecated.",
          });
        }
        return jsonResult(r);
      }

      if (action === "publish_checkpoint") {
        const cwd = params.cwd || getPendingCheckpointCwd() || process.cwd();
        const draft: CheckpointDraft = {
          goal: String(params.goal ?? ""),
          completed: Array.isArray(params.completed)
            ? params.completed.map(String)
            : [],
          currentState: String(params.current_state ?? ""),
          remaining: Array.isArray(params.remaining)
            ? params.remaining.map(String)
            : [],
          blockers: Array.isArray(params.blockers)
            ? params.blockers.map(String)
            : [],
          nextAction: String(params.next_action ?? ""),
          workstreamId: params.workstream_id ?? undefined,
          parentCheckpointId: params.parent_checkpoint_id ?? undefined,
        };
        const r = createCheckpoint(config, String(cwd), draft, {
          confirmed: true,
          autoCommit: true,
        });
        if (r.ok) {
          try {
            rebuildProjection(memoryRootAbs(config), expand(config.indexFile), {
              maxReadBytes: config.maxReadBytes,
            }).db.close();
          } catch {
            /* index best-effort */
          }
          return jsonResult({
            ok: true,
            action,
            id: r.id,
            relPath: r.relPath,
            dirty: r.dirty,
            branch: r.meta.branch,
            head_commit: r.meta.head_commit,
          });
        }
        return jsonResult(r);
      }

      return jsonResult({ ok: false, error: "unknown_action", action });
    },
  });
}
