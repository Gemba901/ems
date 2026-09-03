import { getOrganizationDateKey } from "../utils/organizationDate";

type DateSeparatorMeta = {
  key: string;
  label: string;
};
function getRelativeKey(offsetDays: number, timeZone?: string | null) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return getOrganizationDateKey(value, timeZone);
}

export function getDateSeparatorMeta(
  value?: string | null,
  timeZone?: string | null,
): DateSeparatorMeta | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const key = getOrganizationDateKey(date, timeZone);
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
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || undefined,
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
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
