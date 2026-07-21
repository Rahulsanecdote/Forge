// Format an ISO timestamp for the dashboard. When `timeZone` (a valid IANA zone) is
// given, the instant is rendered in that zone; otherwise it uses the server's zone.
//
// Do NOT add `timeZoneName` here: Intl.DateTimeFormat throws a TypeError when
// `dateStyle`/`timeStyle` are combined with component options like `timeZoneName`.
// Callers surface the zone label separately (e.g. "(America/New_York)").
export function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
