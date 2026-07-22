// Pure parser for the operator's customer list. Each line is one customer, entered as
// "Name, contact" where contact is an email or phone number (either order, comma- or
// tab-separated). A line with no recognizable contact becomes a `manual` recipient —
// Forge still mints the link, the operator just sends it themselves. No env/IO so it's
// unit-testable.

export type ReviewChannel = 'manual' | 'email' | 'sms';

export interface ReviewRecipient {
  name: string | null;
  contact: string | null;
  channel: ReviewChannel;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A phone number: 7–15 digits, optional leading + and common separators. Deliberately
// permissive — the SMS provider does final validation; we only need to tell "this token
// is a phone" from "this token is a name".
function isPhone(token: string): boolean {
  if (!/[0-9]/.test(token)) return false;
  if (!/^[+]?[0-9()\-.\s]+$/.test(token)) return false;
  const digits = token.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function classify(token: string): ReviewChannel {
  const t = token.trim();
  if (EMAIL_RE.test(t)) return 'email';
  if (isPhone(t)) return 'sms';
  return 'manual';
}

// Normalize a phone into a compact form the SMS provider accepts: keep a leading +,
// strip separators. (No country-code guessing — an operator entering local numbers
// should include the country code.)
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

function parseLine(line: string): ReviewRecipient | null {
  const parts = line
    .split(/[,\t]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let name: string | null = null;
  let contact: string | null = null;
  let channel: ReviewChannel = 'manual';

  for (const part of parts) {
    const kind = classify(part);
    if (kind !== 'manual' && !contact) {
      contact = kind === 'sms' ? normalizePhone(part) : part;
      channel = kind;
    } else if (!name) {
      name = part;
    }
  }

  // A bare email/phone with no name is still a valid recipient.
  if (!name && !contact) name = parts[0];
  return { name: name || null, contact, channel };
}

export function parseRecipients(raw: string): ReviewRecipient[] {
  return raw
    .split(/\r?\n/)
    .map(parseLine)
    .filter((r): r is ReviewRecipient => r !== null);
}
