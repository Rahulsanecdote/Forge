// Pure month-grid math for the operator content calendar. No env/IO so it's unit-testable.
// Entries are placed on the calendar day matching their instant *in their own client's
// timezone* — a post scheduled for 8pm ET lands on the ET date, not the UTC one.

export type CalendarStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled';

export interface CalendarEntry {
  id: string;
  runId: string;
  clientName: string | null;
  clientSlug: string | null;
  title: string | null;
  status: CalendarStatus;
  at: string; // ISO instant used for placement (the scheduled time)
  timezone: string | null;
}

export interface CalendarDay {
  date: string; // 'YYYY-MM-DD'
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

export interface MonthMeta {
  param: string; // 'YYYY-MM'
  year: number;
  month: number; // 0-based
  label: string; // 'July 2026'
  prevParam: string;
  nextParam: string;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function utcDateString(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// The calendar date an instant falls on, in a given IANA timezone. Falls back to UTC for
// a missing or invalid zone rather than throwing.
export function entryLocalDate(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

// Resolve the month to display from a `?month=YYYY-MM` param, falling back to the month of
// `todayIso`. Also returns the prev/next params for navigation.
export function monthMeta(param: string | undefined, todayIso: string): MonthMeta {
  const today = new Date(todayIso);
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();

  const match = /^(\d{4})-(\d{2})$/.exec(param ?? '');
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    if (m >= 0 && m <= 11) {
      year = y;
      month = m;
    }
  }

  const prev = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month, 1)));

  return {
    param: `${year}-${pad2(month + 1)}`,
    year,
    month,
    label,
    prevParam: `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}`,
    nextParam: `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}`,
  };
}

// UTC ISO bounds covering the visible grid (month ± a week of padding so entries on the
// leading/trailing days from adjacent months are fetched too).
export function monthRangeIso(year: number, month: number): { startIso: string; endIso: string } {
  const start = Date.UTC(year, month, 1) - 7 * 86_400_000;
  const end = Date.UTC(year, month + 1, 1) + 7 * 86_400_000;
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

// Build a Sunday-started grid of whole weeks covering `month`, bucketing each entry onto
// its client-timezone day and sorting each day's entries by time.
export function buildMonthGrid(input: {
  year: number;
  month: number;
  entries: CalendarEntry[];
  today: string; // 'YYYY-MM-DD'
}): CalendarDay[][] {
  const { year, month, entries, today } = input;

  const firstMs = Date.UTC(year, month, 1);
  const startOffset = new Date(firstMs).getUTCDay(); // 0=Sun
  const gridStartMs = firstMs - startOffset * 86_400_000;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = entryLocalDate(entry.at, entry.timezone);
    if (!key) continue;
    const bucket = byDate.get(key);
    if (bucket) bucket.push(entry);
    else byDate.set(key, [entry]);
  }
  for (const bucket of byDate.values()) {
    bucket.sort((a, b) => a.at.localeCompare(b.at));
  }

  const weeks: CalendarDay[][] = [];
  for (let cell = 0; cell < totalCells; cell += 1) {
    const ms = gridStartMs + cell * 86_400_000;
    const date = utcDateString(ms);
    const day: CalendarDay = {
      date,
      dayOfMonth: new Date(ms).getUTCDate(),
      inMonth: new Date(ms).getUTCMonth() === month,
      isToday: date === today,
      entries: byDate.get(date) ?? [],
    };
    if (cell % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }

  return weeks;
}
