import Holidays from "date-holidays";

export interface HolidaySuggestion {
  date: string;
  reason: string;
  kind: "NON_WORKING";
  source: "HOLIDAY_SUGGESTION";
  originalDate?: string;
  note?: string;
}

const addDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
const sunday = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
const display = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

/** Suggestions, never an automatic declaration of a company's working days.
 * Kenya: Public Holidays Act, Part I and s4; name amended effective 26 April 2024.
 * https://new.kenyalaw.org/akn/ke/act/1912/21/eng@2024-04-26
 * Historical cycles before 2024 retain the provider's historical data.
 */
export function holidaySuggestions(country: string, year: number) {
  const raw = new Holidays(country, { types: ["public"] })
    .getHolidays(year, "en")
    .filter((h) => h.type === "public");
  let suggestions: HolidaySuggestion[];
  if (country === "KE" && year >= 2024) {
    // Part II faith-specific holidays and one-off gazette declarations are not
    // inferred to be national closures. Easter Sunday is not in Part I either.
    const national = new Set([
      "01-01",
      "easter -2",
      "easter 1",
      "05-01",
      "06-01",
      "1 Shawwal",
      "10-10",
      "10-20",
      "12-12",
      "12-25",
      "12-26",
    ]);
    const base = raw
      .filter((h) => !h.substitute && national.has(h.rule.split(" and ")[0]))
      .map((h) => ({
        date: h.date.slice(0, 10),
        name: h.rule.startsWith("10-10") ? "Mazingira Day" : h.name,
        tentative: h.rule === "1 Shawwal",
      }));
    const occupied = new Set(base.map((h) => h.date));
    suggestions = base.map((h) => {
      let date = h.date;
      if (sunday(date)) {
        do {
          date = addDay(date);
        } while (occupied.has(date));
        occupied.add(date);
      }
      const shifted = date !== h.date;
      return {
        date,
        reason:
          (shifted ? `${h.name} — observed for ${display(h.date)}` : h.name) +
          (h.tentative ? " (estimated date)" : ""),
        kind: "NON_WORKING" as const,
        source: "HOLIDAY_SUGGESTION" as const,
        ...(shifted ? { originalDate: h.date } : {}),
        note: [
          shifted
            ? `The holiday falls on ${display(h.date)}. This is the next date that is not already a public holiday.`
            : "",
          h.tentative
            ? "Estimated lunar date. Confirm the official announcement before use."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    });
  } else {
    // Keep other countries' own observation rules. Do not apply Kenya's Sunday
    // rule internationally. Preserve the original date when the provider has it.
    suggestions = raw.map((h) => {
      const original = h.substitute
        ? raw.find((x) => !x.substitute && x.rule === h.rule)
        : undefined;
      const originalDate = original?.date.slice(0, 10);
      return {
        date: h.date.slice(0, 10),
        reason: h.name,
        kind: "NON_WORKING" as const,
        source: "HOLIDAY_SUGGESTION" as const,
        ...(originalDate ? { originalDate } : {}),
        note: originalDate
          ? `Observed date associated with ${display(originalDate)}, according to this country's holiday data. Check whether both dates apply locally.`
          : h.substitute
            ? "Observed/substitute date supplied by the holiday dataset."
            : undefined,
      };
    });
  }
  // Two holiday names may legitimately share one date; scheduling still has one
  // non-working decision for that date, with both reasons retained.
  const byDate = new Map<string, HolidaySuggestion>();
  for (const h of suggestions) {
    const existing = byDate.get(h.date);
    if (!existing) byDate.set(h.date, h);
    else if (!existing.reason.includes(h.reason)) {
      existing.reason = `${existing.reason}; ${h.reason}`.slice(0, 200);
      existing.note = [existing.note, h.note].filter(Boolean).join(" ");
    }
  }
  return {
    country,
    year,
    source:
      country === "KE" && year >= 2024
        ? "Installed date-holidays dataset with Kenya national-calendar corrections"
        : "Installed date-holidays dataset",
    notice:
      country === "KE" && year >= 2024
        ? "National holiday suggestions. Observed dates replace Sunday holiday dates. Lunar dates are provisional; confirm official announcements. Add applicable faith-specific, regional or newly declared holidays manually."
        : "Suggestions from the installed holiday dataset. Confirm local applicability and official announcements; regional holidays, lunar dates and later government changes may need correction.",
    suggestions: [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}
