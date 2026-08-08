const DEFAULT_MAX_AGENT_STEPS = 3;
const MAX_AGENT_STEPS_CAP = 6;

export interface ModelUsageEvent {
  operation: string;
  usage: unknown;
  maxOutputTokens?: number;
}

export interface NormalizedModelUsage {
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  maxOutputTokens?: number;
}

function envInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function numberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function maxAgentSteps() {
  return clamp(envInt('FORGE_MAX_STEPS') ?? DEFAULT_MAX_AGENT_STEPS, 1, MAX_AGENT_STEPS_CAP);
}

export function outputTokenLimit(defaultLimit: number) {
  const configuredLimit = envInt('FORGE_OUTPUT_TOKEN_LIMIT');
  if (!configuredLimit) return defaultLimit;
  return clamp(configuredLimit, 256, defaultLimit);
}

export function normalizeModelUsage(event: ModelUsageEvent): NormalizedModelUsage {
  const usage = asRecord(event.usage);
  const inputTokens = numberField(usage, ['inputTokens', 'promptTokens']);
  const outputTokens = numberField(usage, ['outputTokens', 'completionTokens']);
  const explicitTotal = numberField(usage, ['totalTokens']);
  const totalTokens =
    explicitTotal ??
    (typeof inputTokens === 'number' || typeof outputTokens === 'number'
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);

  return {
    operation: event.operation,
    ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
    ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
    ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
    ...(typeof numberField(usage, ['reasoningTokens']) === 'number'
      ? { reasoningTokens: numberField(usage, ['reasoningTokens']) }
      : {}),
    ...(typeof numberField(usage, ['cachedInputTokens']) === 'number'
      ? { cachedInputTokens: numberField(usage, ['cachedInputTokens']) }
      : {}),
    ...(typeof event.maxOutputTokens === 'number' ? { maxOutputTokens: event.maxOutputTokens } : {}),
  };
}

export function summarizeModelUsage(events: ModelUsageEvent[]) {
  const normalized = events.map(normalizeModelUsage);
  if (normalized.length === 0) return null;

  const totals = normalized.reduce(
    (acc, event) => {
      acc.inputTokens += event.inputTokens ?? 0;
      acc.outputTokens += event.outputTokens ?? 0;
      acc.totalTokens += event.totalTokens ?? 0;
      acc.reasoningTokens += event.reasoningTokens ?? 0;
      acc.cachedInputTokens += event.cachedInputTokens ?? 0;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0, cachedInputTokens: 0 },
  );

  return {
    capturedAt: new Date().toISOString(),
    maxAgentSteps: maxAgentSteps(),
    events: normalized,
    totals,
  };
}

// `model_usage` is optional telemetry stored on `tool_runs`. Its migration can lag a
// deploy, and when the column is absent Postgres rejects the whole statement — which would
// otherwise take down the operation being measured (persisting tool output, loading a run
// detail page). Callers use this to detect that specific case and retry without the column.
export function isMissingModelUsageColumn(message: string | null | undefined): boolean {
  return /model_usage/i.test(message ?? '');
}
