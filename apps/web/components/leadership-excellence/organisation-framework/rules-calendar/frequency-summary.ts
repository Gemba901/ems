import { customInterval, type CalendarRules } from "./calendar-model";
import { validCycleDate } from "./cycle-dates";
import { dateEntry, displayMonth } from "./calendar-editor";

const dayMs = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const day = (date: string, offset: number) =>
  new Date(time(date) + offset * dayMs).toISOString().slice(0, 10);
const month = (date: string, offset: number) => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
};

/** A short illustration of coverage only. The server still owns deadlines and approval. */
export function intervalExample(
  r: CalendarRules,
  frequency: "custom" | "twice-monthly",
): {
  description: string;
  periods: { start: string; end: string; partial: boolean }[];
} | null {
  if (!validCycleDate(r.start) || !validCycleDate(r.end) || r.start > r.end)
    return null;
  const c = customInterval(r);
  let cursor: string;
  let description: string;
  if (frequency === "twice-monthly") {
    if (!Number.isInteger(r.splitDay) || r.splitDay < 1 || r.splitDay > 27)
      return null;
    cursor = `${r.start.slice(0, 7)}-${String(Number(r.start.slice(8)) > r.splitDay ? r.splitDay + 1 : 1).padStart(2, "0")}`;
    description = `Each month is split into days 1–${r.splitDay}, then ${r.splitDay + 1}–the last day of the month.`;
  } else {
    if (
      !Number.isInteger(c.every) ||
      c.every < 1 ||
      c.every > 365 ||
      !["DAYS", "WEEKS", "MONTHS"].includes(c.unit) ||
      !validCycleDate(c.anchor) ||
      (c.unit === "MONTHS" && !c.anchor.endsWith("-01"))
    )
      return null;
    const unit =
      c.unit === "MONTHS"
        ? "month"
        : c.unit === "WEEKS"
          ? "week"
          : "calendar day";
    description = `Every ${c.every} ${unit}${c.every === 1 ? "" : "s"}, starting ${c.unit === "MONTHS" ? displayMonth(c.anchor.slice(0, 7)) : dateEntry(c.anchor)}.`;
    if (c.unit === "MONTHS") {
      const gap =
        (Number(r.start.slice(0, 4)) - Number(c.anchor.slice(0, 4))) * 12 +
        Number(r.start.slice(5, 7)) -
        Number(c.anchor.slice(5, 7));
      cursor = month(c.anchor, Math.floor(gap / c.every) * c.every);
    } else {
      const length = c.every * (c.unit === "WEEKS" ? 7 : 1);
      cursor = day(
        c.anchor,
        Math.floor((time(r.start) - time(c.anchor)) / dayMs / length) * length,
      );
    }
  }
  const periods: { start: string; end: string; partial: boolean }[] = [];
  while (cursor <= r.end && periods.length < 2) {
    const last =
      frequency === "twice-monthly"
        ? cursor.endsWith("-01")
          ? `${cursor.slice(0, 7)}-${String(r.splitDay).padStart(2, "0")}`
          : day(month(cursor, 1), -1)
        : c.unit === "MONTHS"
          ? day(month(cursor, c.every), -1)
          : day(cursor, c.every * (c.unit === "WEEKS" ? 7 : 1) - 1);
    const start = cursor < r.start ? r.start : cursor;
    const end = last > r.end ? r.end : last;
    periods.push({ start, end, partial: start !== cursor || end !== last });
    cursor = day(last, 1);
  }
  return { description, periods };
}
