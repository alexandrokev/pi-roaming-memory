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
 * Restricted write tool. Suggest-first; commit requires confirmed=true.
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
      "Suggest-first durable writes to the roaming Markdown vault. Actions: propose_memory, propose_tombstone, propose_resolution, commit_proposal. commit_proposal requires confirmed=true after user approval. Cannot modify STANDING.md.",
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
        confirmed: { type: "boolean" },
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
          note: "Vault unchanged until commit_proposal with confirmed=true after explicit user approval.",
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
        }
        return jsonResult(r);
      }

      return jsonResult({ ok: false, error: "unknown_action", action });
    },
  });
}
