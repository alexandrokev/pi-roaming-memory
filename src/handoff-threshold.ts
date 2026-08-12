export type HandoffThresholdConfig = {
  thresholdPercent: number;
  rearmPercent: number;
};

export type HandoffThresholdState = {
  lastTriggerPercent: number | null;
};

export type HandoffThresholdDecision = {
  triggered: boolean;
  state: HandoffThresholdState;
};

export function createHandoffThresholdState(): HandoffThresholdState {
  return { lastTriggerPercent: null };
}

/**
 * Evaluates one raw Pi ContextUsage.percent value without reconstructing it.
 * Unknown or non-finite percentages leave tracker state unchanged.
 */
export function evaluateHandoffThreshold(
  state: HandoffThresholdState,
  rawPercent: number | null | undefined,
  config: HandoffThresholdConfig,
): HandoffThresholdDecision {
  if (typeof rawPercent !== "number" || !Number.isFinite(rawPercent)) {
    return { triggered: false, state };
  }
  if (rawPercent < config.thresholdPercent) {
    return { triggered: false, state };
  }
  if (
    state.lastTriggerPercent !== null &&
    rawPercent - state.lastTriggerPercent < config.rearmPercent
  ) {
    return { triggered: false, state };
  }
  return {
    triggered: true,
    state: { lastTriggerPercent: rawPercent },
  };
}
