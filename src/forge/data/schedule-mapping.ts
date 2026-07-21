// Pure helpers for scheduled publishing — no I/O, so they're unit-testable and
// shared between the dashboard action (validating operator input) and the cron
// (mapping a publish outcome onto a schedule row's terminal status).

export type ScheduleParseResult =
  | { ok: true; at: string }
  | { ok: false; reason: 'invalid' | 'past' };

// Parse an operator-supplied schedule time into a UTC ISO instant. The dashboard
// uses <input type="datetime-local">, which yields a wall-clock string with no
// timezone; it is interpreted in the server's timezone (UTC on Vercel). Rejects
// unparseable input and any time that is not strictly in the future.
export function parseScheduledFor(raw: string, now: Date): ScheduleParseResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };

  const at = new Date(trimmed);
  if (Number.isNaN(at.getTime())) return { ok: false, reason: 'invalid' };
  if (at.getTime() <= now.getTime()) return { ok: false, reason: 'past' };

  return { ok: true, at: at.toISOString() };
}

// Map a publish outcome status onto the schedule's terminal state. A run that was
// already published (idempotency short-circuit) counts as published, not failed —
// the desired end state is reached either way.
export function scheduleStatusForPublish(publishStatus: string): 'published' | 'failed' {
  return publishStatus === 'publish-complete' || publishStatus === 'publish-already'
    ? 'published'
    : 'failed';
}
