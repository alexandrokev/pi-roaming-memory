import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RoamingConfig } from "../config.js";
import { memoryRootAbs } from "../config.js";
import { commitProposal, getProposalStore } from "../write-service.js";
import { scanMemoryRoot } from "../scanner.js";
import { rebuildProjection } from "../projection/index.js";
import path from "node:path";
import os from "node:os";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function proposalTitle(meta: Record<string, unknown>, relPath: string): string {
  return typeof meta.title === "string" ? meta.title : relPath;
}

function reindex(config: RoamingConfig): void {
  try {
    rebuildProjection(memoryRootAbs(config), expand(config.indexFile), {
      maxReadBytes: config.maxReadBytes,
    }).db.close();
  } catch {
    /* index best-effort */
  }
}

/**
 * Proposal queue commands: batch review replaces per-proposal chat approval,
 * which is the friction that left proposals unapproved and eventually expired.
 */
export function registerMemoryCommands(pi: ExtensionAPI, config: RoamingConfig) {
  pi.registerCommand("memory-pending", {
    description: "List pending roaming memory proposals awaiting approval",
    handler: async (_args, ctx) => {
      const items = getProposalStore(config).list();
      const lines = items.map(
        (p) =>
          `${p.id}  [${p.kind}]  ${proposalTitle(p.meta, p.relPath)}  (${p.createdAt})`,
      );
      const text = lines.length
        ? `${lines.length} pending proposal(s):\n${lines.join("\n")}`
        : "No pending proposals.";
      console.log(text);
      if (ctx.hasUI) {
        ctx.ui.notify(`${items.length} pending proposal(s) — see console`, "info");
      }
    },
  });

  pi.registerCommand("memory-approve", {
    description:
      "Approve pending proposal(s): /memory-approve <proposal_id|all> (saves to vault)",
    handler: async (args, ctx) => {
      const arg = String(args || "").trim();
      const store = getProposalStore(config);
      const ids =
        arg === "all"
          ? store.list().map((p) => p.id)
          : [arg].filter((x) => x !== "");
      if (!ids.length) {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /memory-approve <proposal_id|all>", "warning");
        }
        return;
      }
      const results = ids.map((proposal_id) => {
        const r = commitProposal(config, proposal_id, { confirmed: true });
        return r.ok
          ? { proposal_id, ok: true as const, note_id: r.id, relPath: r.relPath }
          : { proposal_id, ok: false as const, error: r.error };
      });
      if (results.some((r) => r.ok)) reindex(config);
      const okCount = results.filter((r) => r.ok).length;
      console.log(
        results
          .map((r) =>
            r.ok
              ? `saved ${r.proposal_id} -> ${r.relPath}`
              : `failed ${r.proposal_id}: ${r.error}`,
          )
          .join("\n"),
      );
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Roaming memory: ${okCount}/${results.length} proposal(s) saved`,
          okCount === results.length ? "info" : "warning",
        );
      }
    },
  });

  pi.registerCommand("memory-reject", {
    description: "Reject pending proposal(s): /memory-reject <proposal_id|all>",
    handler: async (args, ctx) => {
      const arg = String(args || "").trim();
      const store = getProposalStore(config);
      const ids =
        arg === "all"
          ? store.list().map((p) => p.id)
          : [arg].filter((x) => x !== "");
      if (!ids.length) {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /memory-reject <proposal_id|all>", "warning");
        }
        return;
      }
      for (const id of ids) store.reject(id);
      console.log(`Rejected ${ids.length} proposal(s):\n${ids.join("\n")}`);
      if (ctx.hasUI) {
        ctx.ui.notify(`Roaming memory: rejected ${ids.length} proposal(s)`, "info");
      }
    },
  });

  pi.registerCommand("memory-inbox", {
    description: "List staged inbox/ draft notes (trust: inbox, not searchable)",
    handler: async (_args, ctx) => {
      const report = scanMemoryRoot(memoryRootAbs(config), {
        maxReadBytes: config.maxReadBytes,
      });
      const items = report.objects.filter((o) => o.kind === "inbox");
      const text = items.length
        ? `${items.length} inbox note(s):\n${items.map((o) => o.relPath).join("\n")}`
        : "Inbox is empty.";
      console.log(text);
      if (ctx.hasUI) {
        ctx.ui.notify(`${items.length} inbox note(s) — see console`, "info");
      }
    },
  });
}
