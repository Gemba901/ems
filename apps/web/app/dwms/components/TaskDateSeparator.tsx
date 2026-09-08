import {
  addDaysToDateKey,
  formatOrganizationDateKey,
  getOrganizationDateKey,
  getOrganizationTodayKey,
} from "../utils/organizationDate";

type DateSeparatorMeta = {
  key: string;
  label: string;
};
function getRelativeKey(offsetDays: number, timeZone?: string | null) {
  return addDaysToDateKey(getOrganizationTodayKey(timeZone), offsetDays);
}

export function getDateSeparatorMeta(
  value?: string | null,
  timeZone?: string | null,
  dateOnly = false,
): DateSeparatorMeta | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const key = dateOnly
    ? value.slice(0, 10)
    : getOrganizationDateKey(date, timeZone);
  if (!key) return null;

  if (key === getRelativeKey(0, timeZone)) {
    return { key, label: "Today" };
  }
  if (key === getRelativeKey(-1, timeZone)) {
    return { key, label: "Yesterday" };
  }
  if (key === getRelativeKey(1, timeZone)) {
    return { key, label: "Tomorrow" };
  }

  const currentYear = getRelativeKey(0, timeZone)?.slice(0, 4);
  const showYear = key.slice(0, 4) !== currentYear;

  try {
    return {
      key,
      label: dateOnly
        ? (formatOrganizationDateKey(key, {
            weekday: "short",
            day: "numeric",
            month: "short",
            ...(showYear ? { year: "numeric" } : {}),
          }) ?? key)
        : new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(showYear ? { year: "numeric" } : {}),
      }).format(date),
    };
  } catch {
    return { key, label: key };
  }
}

export default function TaskDateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
        {label}
      </span>
    </div>
  );
}
