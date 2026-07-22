import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '../actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadContentCalendar } from '@/lib/admin/data';
import {
  buildMonthGrid,
  entryLocalDate,
  monthMeta,
  monthRangeIso,
  WEEKDAY_LABELS,
  type CalendarEntry,
  type CalendarStatus,
} from '@/lib/admin/calendar-grid';
import { formatDateTime } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<CalendarStatus, { dot: string; label: string }> = {
  scheduled: { dot: 'bg-gold', label: 'Scheduled' },
  publishing: { dot: 'bg-amber-300', label: 'Publishing' },
  published: { dot: 'bg-emerald-400', label: 'Published' },
  failed: { dot: 'bg-red-400', label: 'Failed' },
  canceled: { dot: 'bg-muted-dark', label: 'Canceled' },
};

function timeLabel(entry: CalendarEntry): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(entry.timezone ? { timeZone: entry.timezone } : {}),
  }).format(new Date(entry.at));
}

function EntryChip({ entry }: { entry: CalendarEntry }) {
  const style = STATUS_STYLE[entry.status];
  return (
    <Link
      href={`/dashboard/runs/${entry.runId}`}
      className="block border border-gold-border/70 bg-bg/60 px-2 py-1 transition hover:border-gold/60 hover:bg-gold-dim"
      title={`${entry.clientName ?? 'Client'} · ${style.label} · ${entry.title ?? ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
        <span className="truncate font-mono text-[10px] text-muted">{timeLabel(entry)}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-ink">{entry.clientName ?? 'Client'}</div>
    </Link>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');

  const query = await searchParams;
  const todayIso = new Date().toISOString();
  const meta = monthMeta(query?.month, todayIso);
  const { startIso, endIso } = monthRangeIso(meta.year, meta.month);
  const { entries, pendingApprovals, errors } = await loadContentCalendar(startIso, endIso);

  const today = entryLocalDate(todayIso, 'UTC');
  const weeks = buildMonthGrid({ year: meta.year, month: meta.month, entries, today });

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-gold">
              Dashboard
            </Link>
            <h1 className="mt-2 font-bebas text-4xl tracking-wide text-ink">Content Calendar</h1>
          </div>
          <form action={logout}>
            <button className="border border-gold-border px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/calendar?month=${meta.prevParam}`}
              className="border border-gold-border px-3 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold"
              aria-label="Previous month"
            >
              ←
            </Link>
            <h2 className="min-w-[180px] text-center font-serif text-3xl text-ink">{meta.label}</h2>
            <Link
              href={`/dashboard/calendar?month=${meta.nextParam}`}
              className="border border-gold-border px-3 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold"
              aria-label="Next month"
            >
              →
            </Link>
            <Link
              href="/dashboard/calendar"
              className="ml-1 font-mono text-[11px] uppercase tracking-wide text-muted-dark transition hover:text-gold"
            >
              Today
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-wide text-muted-dark">
            {(Object.keys(STATUS_STYLE) as CalendarStatus[]).map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_STYLE[status].dot}`} />
                {STATUS_STYLE[status].label}
                {counts[status] ? ` · ${counts[status]}` : ''}
              </span>
            ))}
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4">
            <div className="font-mono text-xs uppercase tracking-wide text-red-200">Data Access Issues</div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-red-100">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <div className="grid grid-cols-7 border-b border-gold-border">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-2 py-2 text-center font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l border-t border-gold-border">
              {weeks.flat().map((day) => (
                <div
                  key={day.date}
                  className={`min-h-[104px] border-b border-r border-gold-border p-1.5 ${
                    day.inMonth ? 'bg-surface/40' : 'bg-bg/40'
                  } ${day.isToday ? 'ring-1 ring-inset ring-gold/50' : ''}`}
                >
                  <div
                    className={`mb-1 text-right font-mono text-[11px] ${
                      day.isToday ? 'text-gold' : day.inMonth ? 'text-muted' : 'text-muted-dark'
                    }`}
                  >
                    {day.dayOfMonth}
                  </div>
                  <div className="space-y-1">
                    {day.entries.slice(0, 4).map((entry) => (
                      <EntryChip key={entry.id} entry={entry} />
                    ))}
                    {day.entries.length > 4 && (
                      <div className="px-1 font-mono text-[10px] text-muted-dark">
                        +{day.entries.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="min-w-0 border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Needs Approval ({pendingApprovals.length})
            </div>
            <div className="divide-y divide-gold-border/70">
              {pendingApprovals.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted-dark">
                  Nothing awaiting a decision.
                </div>
              )}
              {pendingApprovals.map((approval) => (
                <Link
                  key={approval.id}
                  href={`/dashboard/runs/${approval.run_id}`}
                  className="group block px-4 py-3 transition hover:bg-gold-dim"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-ink">
                      {approval.client_name ?? approval.client_slug ?? 'Client'}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-gold">Review</span>
                  </div>
                  <div className="mt-1 truncate font-sans text-xs text-muted">{approval.run_task ?? approval.run_tool ?? 'Draft'}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-dark">{formatDateTime(approval.requested_at)}</div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
