/**
 * pi-roaming-memory
 *
 * Phases 1–6 package entry.
 * handoffMode: off | shadow (default) | owner
 * Does not write STANDING.md. Durable writes are suggest-first.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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
import {
  PROPOSE_NUDGE_STATUS_KEY,
  buildProposeNudgeInstruction,
  buildProposeNudgeStatusText,
  formatMemoryPolicyInjection,
  shouldNudgePropose,
} from "./memory-policy.js";
import { setPendingCheckpointCwd } from "./pending-checkpoint.js";
import {
  createHandoffThresholdState,
  evaluateHandoffThreshold,
} from "./handoff-threshold.js";

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

  // System prompt injection (Hermes append pattern): existing prompt first,
  // then memory policy, then approved standing. Appends — never replaces.
  const approvalPath = path.join(
    path.dirname(expand(config.deviceIdFile)),
    "standing-approval.json",
  );
  pi.on("before_agent_start", async (event, ctx) => {
    // stale propose status should not linger once a new agent run starts
    clearProposeStatus(ctx);
    const chunks: string[] = [];
    if (typeof event?.systemPrompt === "string" && event.systemPrompt.length)
      chunks.push(event.systemPrompt);
    if (config.enableMemoryPolicy) chunks.push(formatMemoryPolicyInjection());
    if (config.enableStandingInstructions) {
      if (fs.existsSync(root)) {
        const st = evaluateStanding(root, approvalPath);
        if (st.injectable && st.body)
          chunks.push(formatStandingInjection(st.body));
      }
    }
    if (chunks.length <= 1 && chunks[0] === event?.systemPrompt) return; // unchanged
    if (!chunks.length) return;
    return { systemPrompt: chunks.join("\n\n") };
  });

  // Turn-end: owner threshold handoff first (preferred), then periodic
  // propose nudge. Ordered so a handoff trigger turn skips the nudge.
  let thresholdState = createHandoffThresholdState();
  let proposeTurns = 0;

  function clearProposeStatus(ctx: ExtensionContext): void {
    if (typeof ctx.ui?.setStatus === "function") {
      ctx.ui.setStatus(PROPOSE_NUDGE_STATUS_KEY, undefined);
    }
  }

  function setProposeStatus(ctx: ExtensionContext): void {
    if (typeof ctx.ui?.setStatus === "function") {
      ctx.ui.setStatus(PROPOSE_NUDGE_STATUS_KEY, buildProposeNudgeStatusText());
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    thresholdState = createHandoffThresholdState();
    proposeTurns = 0;
    clearProposeStatus(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    let thresholdTriggeredThisTurn = false;

    if (config.handoffMode === "owner") {
      const usage = ctx.getContextUsage?.();
      const decision = evaluateHandoffThreshold(
        thresholdState,
        usage?.percent,
        {
          thresholdPercent: config.handoffThresholdPercent,
          rearmPercent: config.handoffRearmPercent,
        },
      );
      thresholdState = decision.state;
      thresholdTriggeredThisTurn = decision.triggered;
      if (decision.triggered) {
        setPendingCheckpointCwd(ctx.cwd);
        const instruction = buildHandoffFollowUpInstruction({
          reason: "threshold",
          percent: usage?.percent,
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
            `Context ${Math.round(usage?.percent ?? 0)}% — handoff auto, lalu /lanjut di session baru`,
            "warning",
          );
        }
      }
    } else if (config.handoffMode === "shadow") {
      // metrics only — do not auto-write, do not steal commands
      const usage = ctx.getContextUsage?.();
      const decision = evaluateHandoffThreshold(
        thresholdState,
        usage?.percent,
        {
          thresholdPercent: config.handoffThresholdPercent,
          rearmPercent: config.handoffRearmPercent,
        },
      );
      thresholdState = decision.state;
      if (process.env.PI_ROAMING_SHADOW_LOG === "1" && decision.triggered) {
        console.error(
          `[pi-roaming-memory shadow] percent=${usage?.percent} would-trigger (legacy auto-handoff remains owner)`,
        );
      }
    }

    proposeTurns++;
    if (thresholdTriggeredThisTurn) {
      // prefer threshold handling; reset so nudge does not fire next turn
      proposeTurns = 0;
    } else if (
      config.enableMemoryProposeNudge &&
      shouldNudgePropose(proposeTurns, config.memoryProposeNudgeTurns)
    ) {
      proposeTurns = 0;
      if (config.memoryProposeNudgeMode === "followUp") {
        // legacy explicit opt-in: synthetic multi-line review follow-up
        if (typeof pi.sendUserMessage === "function") {
          pi.sendUserMessage(
            buildProposeNudgeInstruction({
              turns: config.memoryProposeNudgeTurns,
            }),
            { deliverAs: "followUp", triggerTurn: true },
          );
          if (ctx.hasUI) {
            ctx.ui.notify("Roaming memory: review durable candidates?", "info");
          }
        }
      } else {
        // status mode (default): compact one-line footer notice only —
        // no transcript message, no forced agent turn.
        setProposeStatus(ctx);
      }
    }
  });

  // post-compact refresh: same followUp, never manual reason (owner only)
  pi.on("session_compact", async (_event, ctx) => {
    thresholdState = createHandoffThresholdState();
    proposeTurns = 0;
    clearProposeStatus(ctx);
    if (config.handoffMode !== "owner") return;
    const usage = ctx.getContextUsage?.();
    setPendingCheckpointCwd(ctx.cwd);
    if (typeof pi.sendUserMessage === "function") {
      pi.sendUserMessage(
        buildHandoffFollowUpInstruction({
          reason: "post-compact",
          percent: usage?.percent,
          cwd: ctx.cwd,
        }),
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
  });
}
