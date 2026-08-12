import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  return import(path.join(root, "src/handoff-threshold.ts"));
}

const config = { thresholdPercent: 75, rearmPercent: 25 };

test("threshold triggers at boundary and rearm triggers at boundary", async () => {
  const {
    createHandoffThresholdState,
    evaluateHandoffThreshold,
  } = await load();
  let state = createHandoffThresholdState();

  let result = evaluateHandoffThreshold(state, 74.99, config);
  assert.equal(result.triggered, false);
  state = result.state;

  result = evaluateHandoffThreshold(state, 75, config);
  assert.equal(result.triggered, true);
  state = result.state;

  result = evaluateHandoffThreshold(state, 99.99, config);
  assert.equal(result.triggered, false);
  state = result.state;

  result = evaluateHandoffThreshold(state, 100, config);
  assert.equal(result.triggered, true);
  assert.equal(result.state.lastTriggerPercent, 100);
});

test("null and nonfinite percentages do not trigger or mutate state", async () => {
  const {
    createHandoffThresholdState,
    evaluateHandoffThreshold,
  } = await load();
  const state = createHandoffThresholdState();

  for (const percent of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = evaluateHandoffThreshold(state, percent, config);
    assert.equal(result.triggered, false);
    assert.equal(result.state, state);
    assert.equal(result.state.lastTriggerPercent, null);
  }
});

test("tracker reset permits threshold trigger again", async () => {
  const {
    createHandoffThresholdState,
    evaluateHandoffThreshold,
  } = await load();
  let state = createHandoffThresholdState();
  state = evaluateHandoffThreshold(state, 75, config).state;
  assert.equal(evaluateHandoffThreshold(state, 80, config).triggered, false);

  state = createHandoffThresholdState();
  assert.equal(evaluateHandoffThreshold(state, 75, config).triggered, true);
});

test("raw percent values are not reconstructed from tokens", async () => {
  const {
    createHandoffThresholdState,
    evaluateHandoffThreshold,
  } = await load();
  let state = createHandoffThresholdState();
  state = evaluateHandoffThreshold(state, 75, config).state;

  const result = evaluateHandoffThreshold(state, 99, config);
  assert.equal(result.triggered, false);
  assert.equal(result.state.lastTriggerPercent, 75);
});
