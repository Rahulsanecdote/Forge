// Pure helpers for scheduled publishing — no I/O, so they're unit-testable and
// shared between the dashboard action (validating operator input) and the cron
// (mapping a publish outcome onto a schedule row's terminal status).

export type ScheduleParseResult =
  | { ok: true; at: string }
  | { ok: false; reason: 'invalid' | 'past' };

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// True when `timeZone` is a real IANA zone the runtime understands.
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// A client's `timezone` is free text, so it may be a valid IANA name
// (e.g. "America/New_York") or something we can't schedule against. Return the
// zone only when it's usable; callers fall back to UTC otherwise.
export function resolveScheduleTimeZone(timeZone: string | null | undefined): string | null {
  const trimmed = timeZone?.trim();
  if (!trimmed) return null;
  return isValidTimeZone(trimmed) ? trimmed : null;
}

// Offset (ms) of `timeZone` from UTC at the given instant. Positive east of UTC.
function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

// Interpret a wall-clock 'YYYY-MM-DDTHH:mm' string as a local time in `timeZone`
// and return the corresponding UTC instant. Returns null on a malformed string or
// an unknown time zone. Refines the offset once so times near a DST transition
// resolve to the correct instant.
function zonedWallClockToUtc(raw: string, timeZone: string): Date | null {
  const m = WALL_CLOCK_RE.exec(raw);
  if (!m || !isValidTimeZone(timeZone)) return null;

  const wallUTC = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0,
  );
  const offset = timeZoneOffsetMs(timeZone, new Date(wallUTC));
  let utc = wallUTC - offset;
  const refined = timeZoneOffsetMs(timeZone, new Date(utc));
  if (refined !== offset) utc = wallUTC - refined;
  return new Date(utc);
}

// Parse an operator-supplied schedule time into a UTC ISO instant. The dashboard
// uses <input type="datetime-local">, which yields a wall-clock string with no
// timezone. When a valid IANA `timeZone` is given (the client's configured zone),
// the wall clock is interpreted in that zone; otherwise it falls back to the
// server's local time (UTC on Vercel). Rejects unparseable input and any time
// that is not strictly in the future.
export function parseScheduledFor(
  raw: string,
  now: Date,
  timeZone?: string | null,
): ScheduleParseResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };

  const zone = resolveScheduleTimeZone(timeZone);
  let at = zone ? zonedWallClockToUtc(trimmed, zone) : null;
  if (!at) {
    const parsed = new Date(trimmed);
    at = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (!at || Number.isNaN(at.getTime())) return { ok: false, reason: 'invalid' };
  if (at.getTime() <= now.getTime()) return { ok: false, reason: 'past' };

  return { ok: true, at: at.toISOString() };
}

// Map a publish outcome status onto the schedule's next state. A run that was already
// published (idempotency short-circuit) counts as published, not failed — the desired end
// state is reached either way. A billing block is not terminal: the client may pay later,
// so the schedule returns to 'pending' to retry rather than failing permanently.
export function scheduleStatusForPublish(publishStatus: string): 'published' | 'failed' | 'pending' {
  if (publishStatus === 'publish-complete' || publishStatus === 'publish-already') return 'published';
  if (publishStatus === 'publish-blocked-billing') return 'pending';
  return 'failed';
}
