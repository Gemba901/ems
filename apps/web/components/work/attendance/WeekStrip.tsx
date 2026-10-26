"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAttendanceWeek } from "@/hooks/work/useWork";
import { formatDateOnly, formatDuration, formatTime } from "@/lib/work/format";
import type { AttendanceWeekDay, AttendanceWeekStatus } from "@/services/work.service";
import { ErrorNote, Loading, Surface, errorMessage, secondaryButton } from "@/components/work/ui";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hoursMinutes(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const STATUS: Record<AttendanceWeekStatus, { label: string; className: string }> = {
  PRESENT: { label: "Present", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  ABSENT: { label: "Absent", className: "bg-red-50 text-red-800 ring-red-200" },
  LEAVE: { label: "On leave", className: "bg-violet-50 text-violet-800 ring-violet-200" },
  HOLIDAY: { label: "Holiday", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  DAY_OFF: { label: "Day off", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  TODAY: { label: "Today", className: "bg-blue-50 text-blue-800 ring-blue-200" },
  UPCOMING: { label: "Upcoming", className: "bg-white text-slate-500 ring-slate-200" },
  NOT_JOINED: { label: "—", className: "bg-white text-slate-400 ring-slate-200" },
};

function statusLabel(day: AttendanceWeekDay): string {
  if (day.status === "DAY_OFF") {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    return weekday === 0 || weekday === 6 ? "Weekend" : "Day off";
  }
  return STATUS[day.status].label;
}

const navButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60";

/** Sunday-to-Saturday attendance for one person: status, first in, last out and hours per day. Key it by employee so the week resets. */
export function WeekStrip({ employeeId, title = "This week" }: { employeeId?: string; title?: string }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const week = useAttendanceWeek({ date, employeeId });
  const data = week.data;

  // An open session keeps counting, measured on the server's clock.
  const openToday = data?.days.some((d) => d.isOpen) ?? false;
  const skew = data ? new Date(data.serverNow).getTime() - week.dataUpdatedAt : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!openToday) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [openToday]);

  function worked(day: AttendanceWeekDay): number {
    const open = day.sessions.find((s) => !s.clockOutAt);
    if (!open) return day.workedSeconds;
    return day.workedSeconds + Math.max(0, Math.floor((now + skew - new Date(open.clockInAt).getTime()) / 1000));
  }

  const current = !data || (data.today >= data.from && data.today <= data.to);
  const chosen = data?.days.find((d) => d.date === selected && d.sessions.length > 0) ?? null;

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{current ? title : "Week"}</h2>
          {data && (
            <p className="mt-0.5 text-sm text-slate-500">
              {formatDateOnly(data.from, { month: "short", day: "numeric" })} – {formatDateOnly(data.to, { month: "short", day: "numeric" })} · Work hours{" "}
              {data.workStartTime} – {data.workEndTime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={navButton}
            aria-label="Previous week"
            disabled={!data}
            onClick={() => {
              setDate(shiftDate(data!.from, -7));
              setSelected(null);
            }}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {!current && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setDate(undefined);
                setSelected(null);
              }}
            >
              This week
            </button>
          )}
          <button
            type="button"
            className={navButton}
            aria-label="Next week"
            disabled={!data || current}
            onClick={() => {
              setDate(shiftDate(data!.from, 7));
              setSelected(null);
            }}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {week.isLoading ? (
        <Loading label="Loading week…" />
      ) : week.isError ? (
        <div className="space-y-3">
          <ErrorNote>We couldn&apos;t load this week. {errorMessage(week.error, "")}</ErrorNote>
          <button type="button" className={secondaryButton} onClick={() => week.refetch()}>
            Try again
          </button>
        </div>
      ) : data ? (
        <>
          <div className="overflow-x-auto">
            <ol className="grid min-w-[36rem] grid-cols-7 gap-2">
              {data.days.map((day) => {
                const style = STATUS[day.status];
                const isToday = day.date === data.today;
                const hasSessions = day.sessions.length > 0;
                const seconds = worked(day);
                const content = (
                  <>
                    <span className={`text-xs font-medium ${isToday ? "text-blue-700" : "text-slate-500"}`}>
                      {formatDateOnly(day.date, { weekday: "short" })}
                    </span>
                    <span className="text-lg font-semibold text-slate-900">{Number(day.date.slice(8))}</span>
                    <span className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.className}`} title={day.holidayName ?? undefined}>
                      {statusLabel(day)}
                    </span>
                    <span className={`mt-1.5 text-sm tabular-nums ${hasSessions ? "font-semibold text-slate-900" : "text-slate-400"}`}>
                      {hoursMinutes(seconds)}
                    </span>
                    {hasSessions && (
                      <span className="text-[11px] tabular-nums text-slate-500">
                        {formatTime(day.firstClockInAt!, data.timeZone)}–{day.isOpen ? "now" : formatTime(day.lastClockOutAt!, data.timeZone)}
                      </span>
                    )}
                  </>
                );
                const box = `flex w-full flex-col items-center rounded-lg border px-1 py-2.5 text-center ${
                  isToday ? "border-blue-300 bg-blue-50/40" : "border-slate-200"
                }`;
                return (
                  <li key={day.date}>
                    {hasSessions ? (
                      <button
                        type="button"
                        aria-pressed={selected === day.date}
                        aria-label={`${formatDateOnly(day.date, { weekday: "long" })}: ${statusLabel(day)}, ${formatDuration(seconds)} worked. Show sessions`}
                        onClick={() => setSelected((s) => (s === day.date ? null : day.date))}
                        className={`${box} hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          selected === day.date ? "ring-2 ring-blue-500" : ""
                        }`}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={box}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {chosen ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-700">{formatDateOnly(chosen.date, { weekday: "long" })}</span>
                <span className="text-slate-600">
                  Total <strong className="font-semibold text-slate-900">{formatDuration(worked(chosen))}</strong>
                </span>
              </div>
              <ul className="space-y-1">
                {chosen.sessions.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-slate-700">
                    <span>
                      <span className="mr-2 text-xs text-slate-500">Session {i + 1}</span>
                      {formatTime(s.clockInAt, s.timezoneAtClockIn)} – {s.clockOutAt ? formatTime(s.clockOutAt, s.timezoneAtClockIn) : "still clocked in"}
                      {s.autoClockedOutAt && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Auto</span>}
                    </span>
                    <span className="tabular-nums text-slate-500">{s.durationSeconds != null ? formatDuration(s.durationSeconds) : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            data.days.some((d) => d.sessions.length > 0) && <p className="text-xs text-slate-500">Select a day to see each clock-in and clock-out.</p>
          )}
        </>
      ) : null}
    </Surface>
  );
}
