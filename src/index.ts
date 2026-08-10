/**
 * pi-roaming-memory
 *
 * Phases 1–6 package entry.
 * handoffMode: off | shadow (default) | owner
 * Does not write STANDING.md. Durable writes are suggest-first.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, memoryRootAbs } from "./config.js";
import { registerSharedMemoryTool } from "./tools/shared-memory.js";
import { registerSharedMemoryWriteTool } from "./tools/shared-memory-write.js";
import { registerHandoffCommands } from "./commands/handoff-commands.js";
import {
  evaluateStanding,
  formatStandingInjection,
} from "./standing.js";
import { cleanupStaleTemps } from "./atomic-publisher.js";
import { ensureDeviceId } from "./identity.js";
import { buildHandoffFollowUpInstruction } from "./handoff-instruction.js";
import { setPendingCheckpointCwd } from "./pending-checkpoint.js";

function expand(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export default function (pi: ExtensionAPI) {
  const loaded = loadConfig();
  if (!loaded.ok) {
    pi.on("session_start", async (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(`pi-roaming-memory disabled: ${loaded.error}`, "warning");
      }
    });
    return;
  }

  const config = loaded.config;
  try {
    ensureDeviceId(expand(config.deviceIdFile));
  } catch {
    /* non-fatal */
  }

  const root = memoryRootAbs(config);
  if (fs.existsSync(root)) {
    try {
      cleanupStaleTemps(root);
    } catch {
      /* ignore */
    }
  }

  registerSharedMemoryTool(pi, config);
  registerSharedMemoryWriteTool(pi, config);
  registerHandoffCommands(pi, config);

  // Standing injection — Phase 4
  if (config.enableStandingInstructions) {
    const approvalPath = path.join(
      path.dirname(expand(config.deviceIdFile)),
      "standing-approval.json",
    );
    pi.on("before_agent_start", async (_event, _ctx) => {
      if (!fs.existsSync(root)) return;
      const st = evaluateStanding(root, approvalPath);
      if (!st.injectable || !st.body) return;
      return {
        systemPrompt: formatStandingInjection(st.body),
      };
    });
  }

  // Threshold shadow metrics / owner checkpoint nudge — Phase 5/6
  if (config.handoffMode === "owner") {
    let lastTriggerTokens = 0;
    const THRESHOLD = 150_000;
    const REARM = 25_000;
    pi.on("turn_end", async (_event, ctx) => {
      const usage = ctx.getContextUsage?.();
      if (!usage || !Number.isFinite(usage.tokens)) return;
      const tokens = usage.tokens;
      if (tokens < THRESHOLD) return;
      if (lastTriggerTokens > 0 && tokens - lastTriggerTokens < REARM) return;
      lastTriggerTokens = tokens;
      setPendingCheckpointCwd(ctx.cwd);
      const instruction = buildHandoffFollowUpInstruction({
        reason: "threshold",
        tokens,
        cwd: ctx.cwd,
      });
      if (typeof pi.sendUserMessage === "function") {
        pi.sendUserMessage(instruction, {
          deliverAs: "followUp",
          triggerTurn: true,
        });
      }
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Context ~${Math.round(tokens / 1000)}k — handoff auto, lalu /lanjut di session baru`,
          "warning",
        );
      }
    });
    // post-compact refresh: same followUp, never manual reason
    pi.on("session_compact", async (_event, ctx) => {
      const usage = ctx.getContextUsage?.();
      const tokens =
        usage && Number.isFinite(usage.tokens) ? usage.tokens : 0;
      setPendingCheckpointCwd(ctx.cwd);
      if (typeof pi.sendUserMessage === "function") {
        pi.sendUserMessage(
          buildHandoffFollowUpInstruction({
            reason: "post-compact",
            tokens,
            cwd: ctx.cwd,
          }),
          { deliverAs: "followUp", triggerTurn: true },
        );
      }
    });
  } else if (config.handoffMode === "shadow") {
    // metrics only — do not auto-write, do not steal commands
    pi.on("turn_end", async (_event, ctx) => {
      const usage = ctx.getContextUsage?.();
      if (!usage || !Number.isFinite(usage.tokens)) return;
      // silent shadow; optional debug via env
      if (process.env.PI_ROAMING_SHADOW_LOG === "1" && usage.tokens >= 150_000) {
        console.error(
          `[pi-roaming-memory shadow] tokens=${usage.tokens} (legacy auto-handoff remains owner)`,
        );
      }
    });
  }
}
