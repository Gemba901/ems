import { FREQUENCIES, type Frequency } from "./calendar-model";
import { validCycleDate } from "./cycle-dates";

export interface CalendarLocation {
  screen: "cycles" | "calendar" | "new" | "comparison";
  calendarId: string;
  step: 0 | 1 | 2 | null;
  version: number | null;
  frequency: Frequency;
  month: string;
  comparisonMonth: string;
  comparisonMode: "DAY" | "MONTH";
  comparisonDay: string;
}
const keys = [
  "view",
  "cycle",
  "tab",
  "version",
  "frequency",
  "month",
  "compareMonth",
  "compareView",
  "day",
];
const tabs = ["working-days", "periods", "preview"];
const validMonth = (s: string) => /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(s);

/** Navigation only: no draft content, names, people or access tokens enter the URL. */
export function readCalendarLocation(
  search: string,
  defaultMonth: string,
): CalendarLocation {
  const q = new URLSearchParams(search),
    id = q.get("cycle") ?? "";
  const requested = q.get("view");
  const screen =
    requested === "new" || requested === "comparison"
      ? requested
      : id && id.length <= 200
        ? "calendar"
        : "cycles";
  const tab = tabs.indexOf(q.get("tab") ?? "");
  const version = q.get("version") ?? "";
  const frequency = q.get("frequency") as Frequency;
  const comparisonMonth = validMonth(q.get("compareMonth") ?? "")
    ? q.get("compareMonth")!
    : defaultMonth;
  const day = q.get("day") ?? "";
  return {
    screen,
    calendarId: screen === "calendar" ? id : "",
    step: tab < 0 ? null : (tab as 0 | 1 | 2),
    version:
      /^\d+$/.test(version) &&
      Number(version) > 0 &&
      Number(version) <= 1_000_000
        ? Number(version)
        : null,
    frequency: FREQUENCIES.includes(frequency) ? frequency : "monthly",
    month: validMonth(q.get("month") ?? "") ? q.get("month")! : "",
    comparisonMonth,
    comparisonMode: q.get("compareView") === "day" ? "DAY" : "MONTH",
    comparisonDay:
      validCycleDate(day) && day.startsWith(comparisonMonth) ? day : "",
  };
}

export function calendarLocationUrl(
  href: string,
  state: CalendarLocation,
): string {
  const url = new URL(href);
  for (const key of keys) url.searchParams.delete(key);
  if (state.screen === "comparison") {
    url.searchParams.set("view", "comparison");
    if (validMonth(state.comparisonMonth))
      url.searchParams.set("compareMonth", state.comparisonMonth);
    url.searchParams.set(
      "compareView",
      state.comparisonMode === "DAY" ? "day" : "month",
    );
    if (
      validCycleDate(state.comparisonDay) &&
      state.comparisonDay.startsWith(state.comparisonMonth)
    )
      url.searchParams.set("day", state.comparisonDay);
  } else if (state.screen === "calendar" || state.screen === "new") {
    url.searchParams.set("view", state.screen);
    if (state.screen === "calendar") {
      url.searchParams.set("cycle", state.calendarId);
      url.searchParams.set(
        "version",
        state.version ? String(state.version) : "draft",
      );
    }
    url.searchParams.set("tab", tabs[state.step ?? 0]);
    url.searchParams.set("frequency", state.frequency);
    if (validMonth(state.month)) url.searchParams.set("month", state.month);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
