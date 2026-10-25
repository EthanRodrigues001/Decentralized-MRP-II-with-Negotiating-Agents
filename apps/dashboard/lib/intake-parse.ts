// Deterministic parsing of the parts of a chat order that must never depend on
// an LLM: how often it repeats and who it is for.

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, fortnight: 14, month: 30 };

/** "every 2 weeks", "every week", "weekly", "monthly", "daily" -> number of days, else null. */
export function parseRecurrence(text: string): number | null {
  const t = text.toLowerCase();
  const every = t.match(/\bevery\s+(?:(\d{1,3})\s*)?(day|week|fortnight|month)s?\b/);
  if (every) {
    const n = every[1] ? Number(every[1]) : 1;
    const days = n * UNIT_DAYS[every[2]];
    return days >= 1 && days <= 365 ? days : null;
  }
  if (/\bdaily\b/.test(t)) return 1;
  if (/\bweekly\b/.test(t)) return 7;
  if (/\b(fortnightly|biweekly|bi-weekly)\b/.test(t)) return 14;
  if (/\bmonthly\b/.test(t)) return 30;
  return null;
}

/** "... for Acme Corp due in 10 days" -> "Acme Corp". Needs a capitalised name. */
export function parseCustomer(text: string): string | null {
  const m = text.match(/\bfor\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})/);
  if (!m) return null;
  const name = m[1].trim();
  return name.length >= 2 ? name.slice(0, 80) : null;
}
