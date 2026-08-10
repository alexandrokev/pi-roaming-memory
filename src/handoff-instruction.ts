/**
 * Handoff draft parsing + agent follow-up instruction builder.
 * Shared by /handoff command and threshold / session_compact triggers.
 */

export type HandoffDraft = {
  goal: string;
  completed: string[];
  currentState: string;
  remaining: string[];
  blockers: string[];
  nextAction: string;
  /** trimmed raw input captured by parseHandoffDraft (used by draftHasSubstance) */
  raw?: string;
};

const DEFAULT_GOAL = "Active work checkpoint";
const DEFAULT_NEXT_ACTION = "Continue work";

/**
 * Move of handoff-commands parseDraft: light section scrape.
 * Defaults kept only for the explicit immediate-publish path when sections
 * are missing; the agent path must never use these defaults.
 */
export function parseHandoffDraft(text: string): HandoffDraft {
  const src = String(text ?? "");
  const grab = (h: string) => {
    const re = new RegExp(
      `## ${h}\\s*([\\s\\S]*?)(?=\\n## |$)`,
      "i",
    );
    const m = src.match(re);
    return m ? m[1].trim() : "";
  };
  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.replace(/^- /, "").trim())
      .filter((l) => l && l !== "(none)");
  return {
    goal: grab("Goal") || DEFAULT_GOAL,
    completed: lines(grab("Completed")),
    currentState:
      grab("Current state") || grab("Current State") || src.slice(0, 500),
    remaining: lines(grab("Remaining")),
    blockers: lines(grab("Blockers")),
    nextAction: grab("Next action") || grab("Next Action") || DEFAULT_NEXT_ACTION,
    raw: src.trim(),
  };
}

/**
 * True when the draft carries real content (not default-only fluff).
 * Heuristic: args trimmed length > 40 AND any completed/remaining/blockers
 * OR current_state beyond trivial (>20 chars) OR goal not the default.
 */
export function draftHasSubstance(draft: HandoffDraft): boolean {
  const rawLen = (draft.raw ?? "").trim().length;
  if (rawLen <= 40) return false;
  return (
    draft.completed.length > 0 ||
    draft.remaining.length > 0 ||
    draft.blockers.length > 0 ||
    draft.currentState.trim().length > 20 ||
    (!!draft.goal && draft.goal !== DEFAULT_GOAL)
  );
}

export type HandoffFollowUpReason = "manual" | "threshold" | "post-compact";

/**
 * Instruction for the agent to summarize THIS session and publish a roaming
 * Checkpoint via shared_memory_write / publish_checkpoint.
 */
export function buildHandoffFollowUpInstruction(opts: {
  reason: HandoffFollowUpReason;
  tokens?: number;
  cwd: string;
}): string {
  const reasonLabel =
    opts.reason === "threshold"
      ? "system context threshold"
      : opts.reason === "post-compact"
        ? "session compaction"
        : "user /handoff";
  const tokensLine =
    opts.tokens && Number.isFinite(opts.tokens) && opts.tokens > 0
      ? `Context tokens at trigger: ~${Math.round(opts.tokens / 1000)}k — keep the summary tight.`
      : "";
  return [
    `Session handoff requested (${reasonLabel}). Handle it now:`,
    "",
    "1. Review THIS session's conversation and summarize it factually (mentally outline 30-60 lines of bullets: goal, what was done, current state, remaining, blockers, next action).",
    "2. Call tool `shared_memory_write` with action `publish_checkpoint` and fields:",
    "   - goal (string)",
    "   - completed (string[])",
    "   - current_state (string)",
    "   - remaining (string[])",
    "   - blockers (string[])",
    "   - next_action (string)",
    "   Optional: workstream_id, parent_checkpoint_id.",
    "3. Do NOT write vault paths manually. Do NOT use empty template defaults (\"(none)\", \"Continue work\") — only real content from this session. No secrets.",
    "4. cwd is already bound for the tool (" + opts.cwd + ") — you do NOT need to pass cwd.",
    "5. After the tool returns ok, reply briefly: done / remaining / next action, and remind the user to run /lanjut to start a new session from this checkpoint.",
    tokensLine,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
