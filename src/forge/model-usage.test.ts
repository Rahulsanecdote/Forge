import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxAgentSteps,
  normalizeModelUsage,
  outputTokenLimit,
  summarizeModelUsage,
} from './model-usage';

test('normalizes common provider usage fields', () => {
  assert.deepEqual(
    normalizeModelUsage({
      operation: 'generate_report',
      usage: { promptTokens: 10, completionTokens: 5 },
      maxOutputTokens: 900,
    }),
    {
      operation: 'generate_report',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      maxOutputTokens: 900,
    },
  );
});

test('summarizes usage events without prompts or model output', () => {
  const summary = summarizeModelUsage([
    { operation: 'a', usage: { inputTokens: 12, outputTokens: 8 } },
    { operation: 'b', usage: { inputTokens: 4, outputTokens: 6, cachedInputTokens: 2 } },
  ]);

  assert.equal(summary?.totals.inputTokens, 16);
  assert.equal(summary?.totals.outputTokens, 14);
  assert.equal(summary?.totals.totalTokens, 30);
  assert.equal(summary?.totals.cachedInputTokens, 2);
  assert.equal(summary?.events.length, 2);
});

test('caps agent steps and output tokens from env', () => {
  const priorSteps = process.env.FORGE_MAX_STEPS;
  const priorOutput = process.env.FORGE_OUTPUT_TOKEN_LIMIT;
  try {
    process.env.FORGE_MAX_STEPS = '20';
    process.env.FORGE_OUTPUT_TOKEN_LIMIT = '5000';
    assert.equal(maxAgentSteps(), 6);
    assert.equal(outputTokenLimit(1200), 1200);

    process.env.FORGE_MAX_STEPS = '2';
    process.env.FORGE_OUTPUT_TOKEN_LIMIT = '512';
    assert.equal(maxAgentSteps(), 2);
    assert.equal(outputTokenLimit(1200), 512);
  } finally {
    if (priorSteps === undefined) delete process.env.FORGE_MAX_STEPS;
    else process.env.FORGE_MAX_STEPS = priorSteps;
    if (priorOutput === undefined) delete process.env.FORGE_OUTPUT_TOKEN_LIMIT;
    else process.env.FORGE_OUTPUT_TOKEN_LIMIT = priorOutput;
  }
});
