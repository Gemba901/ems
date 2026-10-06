import type { WorkTask } from "@/services/work.service";

// All attendance times are shown in the organization's time zone, which is what the
// backend uses to decide the work date, so "today" means the same thing on both sides.

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Formats a YYYY-MM-DD calendar date without shifting it through any time zone. */
export function formatDateOnly(date: string, options: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Today's calendar date (YYYY-MM-DD) in the given zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function monthRangeIn(timeZone: string, now = new Date()): { from: string; to: string } {
  const today = todayIn(timeZone, now);
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = m.toString().padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last.toString().padStart(2, "0")}` };
}

// Offset of `timeZone` from UTC at `instant`, in minutes.
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** "YYYY-MM-DDTHH:mm" read as wall-clock time in `timeZone` → ISO timestamp with offset (UTC). */
export function zonedInputToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset around daylight-saving changes.
  let instant = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000;
  instant = wall - zoneOffsetMinutes(new Date(instant), timeZone) * 60000;
  return new Date(instant).toISOString();
}

/** ISO timestamp → "YYYY-MM-DDTHH:mm" wall-clock value in `timeZone`, for datetime-local inputs. */
export function isoToZonedInput(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  const local = new Date(instant.getTime() + zoneOffsetMinutes(instant, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}

/** Unfinished first; then overdue, dated (soonest first), and undated last. */
export function sortMyTasks(tasks: WorkTask[], today: string): WorkTask[] {
  const rank = (t: WorkTask) => {
    if (t.status === "DONE") return 3;
    if (!t.dueDate) return 2;
    return t.dueDate < today ? 0 : 1;
  };
  return [...tasks].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export function isOverdue(task: WorkTask, today: string): boolean {
  return task.status !== "DONE" && !!task.dueDate && task.dueDate < today;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

/** "1h 05m" / "45m" from whole minutes. */
export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export type RangePreset = "week" | "month" | "year" | "custom";

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  week: "Week to date",
  month: "Month to date",
  year: "Year to date",
  custom: "Custom range",
};

/** Start of the week (Monday), month or year through today, in the organization's zone. */
export function toDateRange(preset: Exclude<RangePreset, "custom">, timeZone: string, now = new Date()): { from: string; to: string } {
  const today = todayIn(timeZone, now);
  if (preset === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return { from: date.toISOString().slice(0, 10), to: today };
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
