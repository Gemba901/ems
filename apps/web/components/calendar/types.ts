import { AgendaItem } from "@/services/calendar.service";
import { addDays, dateToYMD } from "./calendarUtils";

export type CalendarViewMode = "day" | "week" | "month" | "year" | "schedule";

// `adminOnly` entries are internal to the admin (consultancy) org — partner
// org users never have matching agenda items for them, so the filter is
// hidden rather than shown as a permanent no-op (or, for Out of Office, a
// leak of internal staff scheduling info).
// `clientLabel` overrides `label` for non-admin (partner org) viewers — e.g.
// "Scheduled Partner Visits" only makes sense from the consultancy's side;
// a partner org just wants to know when the consultancy is visiting them.
export const AGENDA_KIND_FILTERS = [
  { key: "EVENT", label: "Events" },
  { key: "VISIT", label: "Scheduled Partner Visits", clientLabel: "Upcoming Consultancy Visits" },
  { key: "REQUEST", label: "Visit Requests" },
  { key: "BLOCK", label: "Out of Office", adminOnly: true },
  { key: "CLIENT_VISIT", label: "New Client Visits", adminOnly: true },
  { key: "BIRTHDAY", label: "Birthdays" },
  { key: "HOLIDAY", label: "Public Holidays" },
] as const;

/**
 * Buckets agenda items by calendar date (YYYY-MM-DD). VISIT items span
 * date..endDate and are placed on every day in that range; other kinds are
 * single-day, keyed off startAt.
 */
export function groupAgendaByDate(items: AgendaItem[]): Record<string, AgendaItem[]> {
  const map: Record<string, AgendaItem[]> = {};
  const push = (key: string, item: AgendaItem) => {
    if (!map[key]) map[key] = [];
    if (!map[key].some(i => i.id === item.id && i.kind === item.kind)) map[key].push(item);
  };

  for (const item of items) {
    if (item.kind === "VISIT") {
      const startStr = item.startAt.slice(0, 10);
      const endStr = item.endAt.slice(0, 10);
      let cur = new Date(`${startStr}T00:00:00`);
      const end = new Date(`${endStr}T00:00:00`);
      while (cur <= end) {
        push(dateToYMD(cur), item);
        cur = addDays(cur, 1);
      }
    } else {
      push(item.startAt.slice(0, 10), item);
    }
  }

  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return map;
}
