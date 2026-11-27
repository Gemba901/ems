"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/patterns/LoadingState";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAttendanceWeek } from "@/hooks/work/useWork";
import { formatDateOnly, formatDuration, formatTime } from "@/lib/work/format";
import type { AttendanceWeekDay, AttendanceWeekStatus } from "@/services/work.service";
import { errorMessage } from "@/components/work/ui";

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
  PRESENT: { label: "Present", className: "bg-success-subtle text-success ring-success" },
  ABSENT: { label: "Absent", className: "bg-danger-subtle text-danger ring-danger" },
  LEAVE: { label: "On leave", className: "bg-info-subtle text-info ring-info" },
  HOLIDAY: { label: "Holiday", className: "bg-info-subtle text-info ring-info" },
  DAY_OFF: { label: "Day off", className: "bg-muted text-muted-foreground ring-ring" },
  TODAY: { label: "Today", className: "bg-info-subtle text-info ring-info" },
  UPCOMING: { label: "Upcoming", className: "bg-card text-muted-foreground ring-ring" },
  NOT_JOINED: { label: "—", className: "bg-card text-muted-foreground ring-ring" },
};

function statusLabel(day: AttendanceWeekDay): string {
  if (day.status === "DAY_OFF") {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    return weekday === 0 || weekday === 6 ? "Weekend" : "Day off";
  }
  return STATUS[day.status].label;
}

const navButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60";

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
    <Card className="block space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{current ? title : "Week"}</h2>
          {data && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDateOnly(data.from, { month: "short", day: "numeric" })} – {formatDateOnly(data.to, { month: "short", day: "numeric" })} · Work hours{" "}
              {data.workStartTime} – {data.workEndTime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
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
          </Button>
          {!current && (
            <Button

              type="button"
              variant="outline"
              onClick={() => {
                setDate(undefined);
                setSelected(null);
              }}
            >
              This week
            </Button>
          )}
          <Button
            variant="ghost"
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
          </Button>
        </div>
      </div>

      {week.isLoading ? (
        <LoadingState label="Loading week…" />
      ) : week.isError ? (
        <div className="space-y-3">
          <div role="alert" className="rounded-lg bg-danger-subtle p-3 text-danger">We couldn&apos;t load this week. {errorMessage(week.error, "")}</div>
          <Button type="button" variant="outline" onClick={() => week.refetch()}>
            Try again
          </Button>
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
                    <span className={`text-xs font-medium ${isToday ? "text-info" : "text-muted-foreground"}`}>
                      {formatDateOnly(day.date, { weekday: "short" })}
                    </span>
                    <span className="text-lg font-semibold text-foreground">{Number(day.date.slice(8))}</span>
                    <span className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.className}`} title={day.holidayName ?? undefined}>
                      {statusLabel(day)}
                    </span>
                    <span className={`mt-1.5 text-sm tabular-nums ${hasSessions ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {hoursMinutes(seconds)}
                    </span>
                    {hasSessions && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatTime(day.firstClockInAt!, data.timeZone)}–{day.isOpen ? "now" : formatTime(day.lastClockOutAt!, data.timeZone)}
                      </span>
                    )}
                  </>
                );
                const box = `flex w-full flex-col items-center rounded-lg border px-1 py-2.5 text-center ${
                  isToday ? "border-info bg-info-subtle/40" : "border-border"
                }`;
                return (
                  <li key={day.date}>
                    {hasSessions ? (
                      <Button
                        variant="ghost"
                        type="button"
                        aria-pressed={selected === day.date}
                        aria-label={`${formatDateOnly(day.date, { weekday: "long" })}: ${statusLabel(day)}, ${formatDuration(seconds)} worked. Show sessions`}
                        onClick={() => setSelected((s) => (s === day.date ? null : day.date))}
                        className={`${box} hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${
                          selected === day.date ? "ring-2 ring-info" : ""
                        }`}
                      >
                        {content}
                      </Button>
                    ) : (
                      <div className={box}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {chosen ? (
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{formatDateOnly(chosen.date, { weekday: "long" })}</span>
                <span className="text-muted-foreground">
                  Total <strong className="font-semibold text-foreground">{formatDuration(worked(chosen))}</strong>
                </span>
              </div>
              <ul className="space-y-1">
                {chosen.sessions.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-foreground">
                    <span>
                      <span className="mr-2 text-xs text-muted-foreground">Session {i + 1}</span>
                      {formatTime(s.clockInAt, s.timezoneAtClockIn)} – {s.clockOutAt ? formatTime(s.clockOutAt, s.timezoneAtClockIn) : "still clocked in"}
                      {s.autoClockedOutAt && <span className="ml-1.5 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning">Auto</span>}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{s.durationSeconds != null ? formatDuration(s.durationSeconds) : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            data.days.some((d) => d.sessions.length > 0) && <p className="text-xs text-muted-foreground">Select a day to see each clock-in and clock-out.</p>
          )}
        </>
      ) : null}
    </Card>
  );
}
