/**
 * Reading imported dates without guessing.
 * A value becomes a date only when exactly one plausible reading exists; otherwise
 * the caller gets the plausible candidates (for HR to choose) or nothing.
 */
export type DateOrder = 'DMY' | 'MDY';
export type DateKind = 'birth' | 'event';
export type DateReading = { iso: string } | { candidates: string[] } | { unreadable: true };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${pad(y, 4)}-${pad(m)}-${pad(d)}` : null;
}

/** Birth dates: age 14–100 on `today`. Other dates: 1900 to one year ahead. */
export function plausibleDate(iso: string, kind: DateKind, today: string): boolean {
  const year = Number(iso.slice(0, 4)), now = Number(today.slice(0, 4));
  if (kind === 'event') return iso >= '1900-01-01' && year <= now + 1;
  const age = now - year - (iso.slice(5) > today.slice(5) ? 1 : 0);
  return iso <= today && age >= 14 && age <= 100;
}

/** Two-digit years: every century (1900s, 2000s) that gives a plausible date. */
function years(text: string): number[] {
  return text.length === 4 ? [Number(text)] : text.length === 2 ? [1900 + Number(text), 2000 + Number(text)] : [];
}

function candidatesFor(parts: { y: string; m: number; d: number }[], kind: DateKind, today: string): string[] {
  const found = new Set<string>();
  for (const { y, m, d } of parts) for (const year of years(y)) {
    const iso = isoOf(year, m, d);
    if (iso && plausibleDate(iso, kind, today)) found.add(iso);
  }
  return [...found].sort();
}

/** Which order a single value proves: a first part over 12 means day-first; a second part over 12 means month-first. */
export function orderEvidence(text: string): DateOrder | null {
  const match = /^\s*(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})\s*$/.exec(text);
  if (!match) return null;
  const a = Number(match[1]), b = Number(match[2]);
  return a > 12 && b <= 12 ? 'DMY' : b > 12 && a <= 12 ? 'MDY' : null;
}

/** A column's order from its values: one order, MIXED when both appear, or null when nothing shows it. */
export function inferDateOrder(values: string[]): DateOrder | 'MIXED' | null {
  let dmy = false, mdy = false;
  for (const value of values) { const order = orderEvidence(value); if (order === 'DMY') dmy = true; if (order === 'MDY') mdy = true; }
  return dmy && mdy ? 'MIXED' : dmy ? 'DMY' : mdy ? 'MDY' : null;
}

/**
 * Read one text value. `order` is the column's day/month order, or null when unknown:
 * then any value whose day and month could swap returns both readings as candidates.
 */
export function readDate(raw: string, kind: DateKind, today: string, order: DateOrder | null): DateReading {
  const text = raw.trim();
  if (!text) return { unreadable: true };
  const result = (found: string[]): DateReading => found.length === 1 ? { iso: found[0] } : found.length ? { candidates: found } : { unreadable: true };

  // Year first: 1987-09-22, 1987/9/22, 1987.09.22
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return result(candidatesFor([{ y: m[1], m: Number(m[2]), d: Number(m[3]) }], kind, today));

  // Day/month/year or month/day/year with separators: 22/09/1987, 3/16/05, 09-08-87
  m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    const dmy = { y: m[3], m: b, d: a }, mdy = { y: m[3], m: a, d: b };
    const proven = orderEvidence(text);
    const use = proven === 'DMY' ? [dmy] : proven === 'MDY' ? [mdy] : order === 'DMY' ? [dmy] : order === 'MDY' ? [mdy] : [dmy, mdy];
    return result(candidatesFor(use, kind, today));
  }

  // Month names: 16 Mar 2005, 16-Mar-05, Mar 16, 2005, March 16 2005
  m = /^(\d{1,2})[\s\-/.]+([a-z]{3,9})\.?[\s\-/.,]+(\d{2}|\d{4})$/i.exec(text);
  const named = m ? { d: Number(m[1]), name: m[2], y: m[3] } : (() => {
    const n = /^([a-z]{3,9})\.?[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-/.]+(\d{2}|\d{4})$/i.exec(text);
    return n ? { d: Number(n[2]), name: n[1], y: n[3] } : null;
  })();
  if (named) {
    const month = MONTHS.indexOf(named.name.slice(0, 3).toLowerCase()) + 1;
    return month ? result(candidatesFor([{ y: named.y, m: month, d: named.d }], kind, today)) : { unreadable: true };
  }

  // Digits only. A General cell drops leading zeros, so 5 digits may be 6 that lost one.
  if (/^\d+$/.test(text)) {
    const splits = (s: string) => {
      const a = order === 'MDY' ? 'm' : 'd';
      const pairs: { first: string; second: string; y: string }[] = [];
      if (s.length === 8) {
        // YYYYMMDD when it starts like a year, otherwise DDMMYYYY / MMDDYYYY.
        if (/^(19|20)/.test(s)) return candidatesFor([{ y: s.slice(0, 4), m: Number(s.slice(4, 6)), d: Number(s.slice(6, 8)) }], kind, today);
        pairs.push({ first: s.slice(0, 2), second: s.slice(2, 4), y: s.slice(4) });
      } else if (s.length === 6) pairs.push({ first: s.slice(0, 2), second: s.slice(2, 4), y: s.slice(4) });
      else if (s.length === 5) {
        pairs.push({ first: s.slice(0, 1), second: s.slice(1, 3), y: s.slice(3) }, { first: s.slice(0, 2), second: s.slice(2, 3), y: s.slice(3) });
      } else return [];
      const parts = pairs.flatMap(p => order === null
        ? [{ y: p.y, d: Number(p.first), m: Number(p.second) }, { y: p.y, m: Number(p.first), d: Number(p.second) }]
        : [{ y: p.y, ...(a === 'd' ? { d: Number(p.first), m: Number(p.second) } : { m: Number(p.first), d: Number(p.second) }) }]);
      return candidatesFor(parts, kind, today);
    };
    // Four or fewer digits never convert on their own; they can only be suggestions.
    if (text.length <= 4) {
      const loose = text.length === 4 ? candidatesFor([{ y: text.slice(2), d: Number(text[0]), m: Number(text[1]) }, ...(order === null ? [{ y: text.slice(2), m: Number(text[0]), d: Number(text[1]) }] : [])], kind, today) : [];
      return loose.length ? { candidates: loose } : { unreadable: true };
    }
    return result(splits(text));
  }
  return { unreadable: true };
}

/** Excel stores date cells as day counts since 1899-12-30 (or 1904-01-01). Only plausible results count. */
export function excelSerialToIso(serial: number, date1904: boolean, kind: DateKind, today: string): string | null {
  // Day 0 is valid only in the 1904 system (1904-01-01); in the 1900 system it is a placeholder.
  if (!Number.isFinite(serial) || serial < (date1904 ? 0 : 1)) return null;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(base + Math.floor(serial) * 86_400_000);
  const iso = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return plausibleDate(iso, kind, today) ? iso : null;
}

export function formatDateChoice(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}
