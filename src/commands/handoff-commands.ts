import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RoamingConfig } from "../config.js";
import { memoryRootAbs } from "../config.js";
import { createCheckpoint } from "../checkpoint.js";
import { commitProposal } from "../write-service.js";
import { scanMemoryRoot, getById } from "../scanner.js";
import { applyGraphToObjects } from "../graph.js";
import { validateContinuation } from "../continuation.js";
import { rebuildProjection } from "../projection/index.js";
import path from "node:path";
import os from "node:os";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parseDraft(text: string) {
  // very light section scrape
  const grab = (h: string) => {
    const re = new RegExp(
      `## ${h}\\s*([\\s\\S]*?)(?=\\n## |$)`,
      "i",
    );
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.replace(/^- /, "").trim())
      .filter((l) => l && l !== "(none)");
  return {
    goal: grab("Goal") || "Active work checkpoint",
    completed: lines(grab("Completed")),
    currentState: grab("Current state") || grab("Current State") || text.slice(0, 500),
    remaining: lines(grab("Remaining")),
    blockers: lines(grab("Blockers")),
    nextAction: grab("Next action") || grab("Next Action") || "Continue work",
  };
}

/**
 * Register handoff commands based on handoffMode.
 * shadow → /roam-handoff, /roam-lanjut
 * owner  → /handoff, /lanjut (plus roam aliases)
 */
export function registerHandoffCommands(
  pi: ExtensionAPI,
  config: RoamingConfig,
) {
  const mode = config.handoffMode;
  if (mode === "off") return;

  const names =
    mode === "owner"
      ? {
          handoff: ["handoff", "roam-handoff"],
          lanjut: ["lanjut", "roam-lanjut"],
        }
      : {
          handoff: ["roam-handoff"],
          lanjut: ["roam-lanjut"],
        };

  for (const name of names.handoff) {
    pi.registerCommand(name, {
      description:
        mode === "owner"
          ? "Write immutable roaming Checkpoint to vault (owner mode)"
          : "Shadow: write immutable roaming Checkpoint (legacy /handoff still owned by pi-auto-handoff)",
      handler: async (args, ctx) => {
        await ctx.waitForIdle();
        const draft = parseDraft(String(args || ""));
        // Interactive confirm when UI present
        let confirmed = true;
        if (ctx.hasUI && ctx.ui?.confirm) {
          confirmed = await ctx.ui.confirm(
            "Publish roaming checkpoint?",
            "Creates a new immutable Checkpoint note in AI Memory (suggest-first already validated).",
          );
        }
        if (!confirmed) {
          if (ctx.hasUI) ctx.ui.notify("Checkpoint cancelled", "info");
          return;
        }
        const created = createCheckpoint(config, ctx.cwd, draft, {
          confirmed: true,
          autoCommit: true,
        });
        if (!created.ok) {
          if (ctx.hasUI) ctx.ui.notify(`Checkpoint failed: ${created.error}`, "error");
          else console.error(created.error);
          return;
        }
        try {
          rebuildProjection(memoryRootAbs(config), expand(config.indexFile), {
            maxReadBytes: config.maxReadBytes,
          }).db.close();
        } catch {
          /* ignore */
        }
        const msg = `Roaming checkpoint ${created.id} → ${created.relPath}${created.dirty ? " (dirty workspace flagged)" : ""}`;
        if (ctx.hasUI) ctx.ui.notify(msg, "info");
        else console.log(msg);
      },
    });
  }

  for (const name of names.lanjut) {
    pi.registerCommand(name, {
      description:
        mode === "owner"
          ? "Continue from latest/selected roaming Checkpoint"
          : "Shadow: validate continuation from roaming Checkpoint (does not replace legacy /lanjut)",
      handler: async (args, ctx) => {
        await ctx.waitForIdle();
        const root = memoryRootAbs(config);
        const report = scanMemoryRoot(root, {
          maxReadBytes: config.maxReadBytes,
        });
        applyGraphToObjects(report.objects);
        const arg = String(args || "").trim();
        let cp = arg
          ? getById(report, arg)
          : report.objects
              .filter((o) => o.kind === "checkpoint" && o.trust === "approved")
              .sort((a, b) =>
                String(b.meta?.created_at ?? "").localeCompare(
                  String(a.meta?.created_at ?? ""),
                ),
              )[0];
        if (!cp) {
          if (ctx.hasUI) ctx.ui.notify("No checkpoint found", "warning");
          return;
        }
        let allowDirtyOverride = false;
        const decision = validateContinuation({
          cwd: ctx.cwd,
          checkpoint: cp,
          deviceIdFile: config.deviceIdFile,
          allowDirtyOverride,
        });
        if (!decision.ok && decision.code?.includes("dirty") && ctx.hasUI && ctx.ui?.confirm) {
          const ok = await ctx.ui.confirm(
            "Dirty continuation risk",
            `${decision.message}\nOverride and continue anyway?`,
          );
          if (ok) {
            allowDirtyOverride = true;
            const d2 = validateContinuation({
              cwd: ctx.cwd,
              checkpoint: cp,
              deviceIdFile: config.deviceIdFile,
              allowDirtyOverride: true,
            });
            if (!d2.ok) {
              ctx.ui.notify(`Still blocked: ${d2.message}`, "error");
              return;
            }
            await runNewSession(ctx, d2.kickoff, mode);
            return;
          }
        }
        if (!decision.ok) {
          if (ctx.hasUI) ctx.ui.notify(`Blocked: ${decision.message}`, "error");
          return;
        }
        if (ctx.hasUI && ctx.ui?.confirm) {
          const ok = await ctx.ui.confirm(
            "Start new session from checkpoint?",
            decision.kickoff,
          );
          if (!ok) return;
        }
        await runNewSession(ctx, decision.kickoff, mode);
      },
    });
  }

  // standing approve command always available when standing enabled
  pi.registerCommand("memory-approve-standing", {
    description: "Approve current STANDING.md hash on this device",
    handler: async (_args, ctx) => {
      const { evaluateStanding, saveStandingApproval } = await import(
        "../standing.js"
      );
      const approvalPath = path.join(
        path.dirname(expand(config.deviceIdFile)),
        "standing-approval.json",
      );
      const st = evaluateStanding(memoryRootAbs(config), approvalPath);
      if (!st.hash) {
        if (ctx.hasUI) ctx.ui.notify(`Cannot approve: ${st.issues.join(", ")}`, "error");
        return;
      }
      saveStandingApproval(approvalPath, st.hash);
      if (ctx.hasUI) {
        ctx.ui.notify(`STANDING approved hash ${st.hash.slice(0, 12)}…`, "info");
      }
    },
  });

  pi.registerCommand("memory-reindex", {
    description: "Rebuild local roaming FTS projection from Markdown",
    handler: async (_args, ctx) => {
      try {
        const p = rebuildProjection(
          memoryRootAbs(config),
          expand(config.indexFile),
          { maxReadBytes: config.maxReadBytes },
        );
        p.db.close();
        if (ctx.hasUI) ctx.ui.notify("Roaming index rebuilt", "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) ctx.ui.notify(`Reindex failed: ${msg}`, "error");
      }
    },
  });

  pi.registerCommand("memory-status", {
    description: "Show roaming memory health summary",
    handler: async (_args, ctx) => {
      const report = scanMemoryRoot(memoryRootAbs(config), {
        maxReadBytes: config.maxReadBytes,
      });
      applyGraphToObjects(report.objects);
      const { evaluateStanding } = await import("../standing.js");
      const approvalPath = path.join(
        path.dirname(expand(config.deviceIdFile)),
        "standing-approval.json",
      );
      const standing = evaluateStanding(memoryRootAbs(config), approvalPath);
      const text = JSON.stringify(
        {
          handoffMode: config.handoffMode,
          memoryRoot: memoryRootAbs(config),
          counts: report.counts,
          standing: {
            trust: standing.trust,
            injectable: standing.injectable,
            issues: standing.issues,
          },
          objects: report.objects.length,
        },
        null,
        2,
      );
      if (ctx.hasUI) ctx.ui.notify("memory-status printed", "info");
      console.log(text);
    },
  });
}

async function runNewSession(ctx: any, kickoff: string, mode: string) {
  if (mode === "shadow") {
    // Shadow must not steal session switch from user habits; copy prompt style
    try {
      const { execSync } = await import("node:child_process");
      execSync("pbcopy", { input: kickoff });
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Shadow mode: kickoff copied to clipboard. Open new session and paste. (Owner mode would call ctx.newSession)",
          "warning",
        );
      }
    } catch {
      if (ctx.hasUI) ctx.ui.notify(kickoff, "info");
      else console.log(kickoff);
    }
    return;
  }
  // owner mode
  const result = await ctx.newSession({
    parentSession: undefined,
  });
  if (result?.cancelled) {
    if (ctx.hasUI) ctx.ui.notify("New session cancelled; stayed in current session", "info");
    return;
  }
  // Best-effort: send kickoff into new session if API allows
  if (typeof ctx.sendUserMessage === "function") {
    // may still be old session — prefer notify
  }
  if (ctx.hasUI) {
    ctx.ui.notify(
      `New session started. Kickoff: ${kickoff.slice(0, 120)}…`,
      "info",
    );
  }
}

// silence unused import in case tree-shake
void commitProposal;
