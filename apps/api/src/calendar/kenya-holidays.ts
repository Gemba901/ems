export interface KenyaHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Kenya's Public Holidays Act: a holiday landing on a Sunday is observed the
 * following Monday. (Doesn't handle the rarer case of two adjacent holidays
 * both falling on a Sat/Sun, e.g. Christmas on a Sunday pushing into Boxing Day.)
 */
function withSundayRollover(y: number, m: number, d: number): string {
  const date = new Date(y, m - 1, d);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return toDateStr(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// Anonymous Gregorian algorithm (computus) for the date of Easter Sunday.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Eid al-Fitr and Eid al-Adha follow the lunar Islamic calendar and are
// confirmed yearly by moon sighting — Kenya's government announces the exact
// date shortly beforehand. These are published astronomical estimates;
// extend the table as further years become known/confirmed.
const ISLAMIC_HOLIDAYS: Record<number, { eidAlFitr: string; eidAlAdha: string }> = {
  2024: { eidAlFitr: '2024-04-10', eidAlAdha: '2024-06-17' },
  2025: { eidAlFitr: '2025-03-31', eidAlAdha: '2025-06-07' },
  2026: { eidAlFitr: '2026-03-20', eidAlAdha: '2026-05-27' },
  2027: { eidAlFitr: '2027-03-10', eidAlAdha: '2027-05-17' },
  2028: { eidAlFitr: '2028-02-27', eidAlAdha: '2028-05-05' },
};

export function getKenyaPublicHolidays(year: number): KenyaHoliday[] {
  const holidays: KenyaHoliday[] = [
    { date: withSundayRollover(year, 1, 1), name: "New Year's Day" },
    { date: withSundayRollover(year, 5, 1), name: 'Labour Day' },
    { date: withSundayRollover(year, 6, 1), name: 'Madaraka Day' },
    { date: withSundayRollover(year, 10, 20), name: 'Mashujaa Day' },
    { date: withSundayRollover(year, 12, 12), name: 'Jamhuri Day' },
    { date: withSundayRollover(year, 12, 25), name: 'Christmas Day' },
    { date: withSundayRollover(year, 12, 26), name: 'Boxing Day' },
  ];

  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  holidays.push({ date: toDateStr(goodFriday.getFullYear(), goodFriday.getMonth() + 1, goodFriday.getDate()), name: 'Good Friday' });
  holidays.push({ date: toDateStr(easterMonday.getFullYear(), easterMonday.getMonth() + 1, easterMonday.getDate()), name: 'Easter Monday' });

  const islamic = ISLAMIC_HOLIDAYS[year];
  if (islamic) {
    holidays.push({ date: islamic.eidAlFitr, name: 'Eid al-Fitr' });
    holidays.push({ date: islamic.eidAlAdha, name: 'Eid al-Adha' });
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
