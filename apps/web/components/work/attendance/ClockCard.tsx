"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, MapPinOff } from "lucide-react";
import { useAttendanceStatus, useClockIn, useClockOut } from "@/hooks/work/useWork";
import { formatDateOnly, formatDuration, formatTime } from "@/lib/work/format";
import { readLocation } from "@/lib/work/location";
import { WorkApiError, type AttendanceRecord, type AttendanceStatus, type CapturedLocation } from "@/services/work.service";
import { ErrorNote, Field, Surface, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

type Phase = { kind: "idle" } | { kind: "locating" } | { kind: "saving" } | { kind: "needs-reason"; problem: string };

function newRequestId(): string {
  return crypto.randomUUID();
}

function useNow(active: boolean, intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

function LocationLine({ record }: { record: AttendanceRecord }) {
  return record.locationStatus === "CAPTURED" ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" /> Location captured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <MapPinOff className="h-4 w-4 text-slate-400" aria-hidden="true" /> Location missing (reason given)
    </span>
  );
}

// Today's earlier sessions, so someone who stepped out can see what has already been counted.
function TodaySessions({ sessions, totalSeconds, timeZone }: { sessions: AttendanceRecord[]; totalSeconds: number; timeZone: string }) {
  const closed = sessions.filter((s) => s.clockOutAt);
  if (closed.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700">Today&apos;s sessions</span>
        <span className="text-slate-600">
          Total <strong className="font-semibold text-slate-900">{formatDuration(totalSeconds)}</strong>
        </span>
      </div>
      <ul className="space-y-1">
        {closed.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-slate-700">
            <span>
              {formatTime(s.clockInAt, timeZone)} – {formatTime(s.clockOutAt!, timeZone)}
              {s.autoClockedOutAt && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Auto</span>}
            </span>
            <span className="tabular-nums text-slate-500">{formatDuration(s.durationSeconds ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleLine({ schedule, timeZone }: { schedule: AttendanceStatus["todaySchedule"]; timeZone: string }) {
  if (schedule.dayType === "HOLIDAY") {
    return <p className="-mt-2 mb-4 text-sm text-slate-600">{schedule.holidayName ?? "Holiday"}: no one is expected in today.</p>;
  }
  if (schedule.dayType === "NON_WORKING" || !schedule.startsAt || !schedule.endsAt) {
    return <p className="-mt-2 mb-4 text-sm text-slate-600">Not a working day. Clock in only if you are working.</p>;
  }
  return (
    <p className="-mt-2 mb-4 text-sm text-slate-600">
      Work hours {formatTime(schedule.startsAt, timeZone)} – {formatTime(schedule.endsAt, timeZone)}
      {schedule.lateAfter && schedule.lateAfter !== schedule.startsAt && ` · late after ${formatTime(schedule.lateAfter, timeZone)}`}
    </p>
  );
}

export function ClockCard({ compact = false }: { compact?: boolean }) {
  const reasonId = useId();
  const status = useAttendanceStatus();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // One id per clock-in or clock-out attempt; a retry after a network failure reuses it,
  // so the backend returns the original record instead of creating a second one.
  const clockInRequest = useRef<string | null>(null);
  const clockOutRequest = useRef<{ recordId: string; requestId: string } | null>(null);

  const data = status.data;
  const open = data?.openRecord ?? null;
  const now = useNow(!!open, compact ? 1_000 : 30_000);
  // Elapsed time uses the server clock, adjusted by how long ago the status was fetched.
  const serverNow = data ? new Date(data.serverNow).getTime() + Math.max(0, now - status.dataUpdatedAt) : now;

  async function submitClockIn(payload: { location?: CapturedLocation; reason?: string }) {
    clockInRequest.current ??= newRequestId();
    setPhase({ kind: "saving" });
    setError(null);
    try {
      await clockIn.mutateAsync(
        payload.location
          ? { requestId: clockInRequest.current, locationStatus: "CAPTURED", location: payload.location }
          : { requestId: clockInRequest.current, locationStatus: "MISSING", locationMissingReason: payload.reason!.trim() },
      );
      clockInRequest.current = null;
      setReason("");
      setPhase({ kind: "idle" });
    } catch (e) {
      if (e instanceof WorkApiError && e.code === "ATTENDANCE_ALREADY_OPEN") {
        clockInRequest.current = null;
        setPhase({ kind: "idle" });
      } else if (payload.reason !== undefined) {
        setPhase({ kind: "needs-reason", problem: "" });
      } else {
        setPhase({ kind: "idle" });
      }
      setError(errorMessage(e, "Clock-in was not saved. Please try again."));
    }
  }

  async function startClockIn() {
    setError(null);
    setPhase({ kind: "locating" });
    try {
      const location = await readLocation();
      await submitClockIn({ location });
    } catch (e) {
      if (e instanceof WorkApiError) return; // already handled in submitClockIn
      setPhase({ kind: "needs-reason", problem: errorMessage(e) });
    }
  }

  async function submitClockOut(record: AttendanceRecord) {
    if (clockOutRequest.current?.recordId !== record.id) {
      clockOutRequest.current = { recordId: record.id, requestId: newRequestId() };
    }
    setError(null);
    try {
      await clockOut.mutateAsync(clockOutRequest.current);
      clockOutRequest.current = null;
    } catch (e) {
      setError(errorMessage(e, "Clock-out was not saved. Please try again."));
    }
  }

  const reasonLength = reason.trim().length;
  const reasonValid = reasonLength >= 10 && reasonLength <= 500;

  let body: React.ReactNode;
  if (status.isLoading) {
    body = (
      <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking today&apos;s attendance…
      </p>
    );
  } else if (status.isError || !data) {
    body = (
      <div className="space-y-3">
        <ErrorNote>We couldn&apos;t load your attendance. {errorMessage(status.error, "")}</ErrorNote>
        <button type="button" className={secondaryButton} onClick={() => status.refetch()}>
          Try again
        </button>
      </div>
    );
  } else if (open && open.workDate !== data.today) {
    // A session left open from an earlier day: close it first, then today's clock-in is possible.
    body = (
      <div className="space-y-3">
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            You are still clocked in from <strong>{formatDateOnly(open.workDate, { weekday: "short" })}</strong> (since{" "}
            {formatTime(open.clockInAt, data.timeZone)}). Clock out of that session before clocking in today. If the clock-out time is wrong, ask HR or your
            manager to correct it.
          </p>
        </div>
        <button type="button" className={primaryButton} disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
          {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {clockOut.isPending ? "Saving…" : "Clock out of earlier session"}
        </button>
      </div>
    );
  } else if (open) {
    // A session that began at or after the scheduled finish has no automatic cutoff.
    const autoClockOut = open.scheduledEndAt && open.clockInAt < open.scheduledEndAt ? open.scheduledEndAt : null;
    body = (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Clocked in
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="font-semibold text-slate-900">{formatTime(open.clockInAt, data.timeZone)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Elapsed</dt>
            <dd className="font-semibold text-slate-900">{formatDuration((serverNow - new Date(open.clockInAt).getTime()) / 1000)}</dd>
          </div>
        </dl>
        <LocationLine record={open} />
        <TodaySessions sessions={data.todaySessions} totalSeconds={data.todayWorkedSeconds} timeZone={data.timeZone} />
        {autoClockOut ? (
          <p className="text-xs text-slate-500">
            Automatic clock-out at {formatTime(new Date(new Date(autoClockOut).getTime() + 30 * 60_000).toISOString(), data.timeZone)} if you
            haven&apos;t clocked out.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {open.scheduledEndAt ? "This session started after work hours." : "No scheduled finish for this day."} Remember to clock out manually.
          </p>
        )}
        <div>
          <button type="button" className={primaryButton} disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
            {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {clockOut.isPending ? "Saving…" : "Clock out"}
          </button>
        </div>
      </div>
    );
  } else if (phase.kind === "needs-reason") {
    body = (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (reasonValid) submitClockIn({ reason });
        }}
      >
        {phase.problem && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{phase.problem} You can try again, or clock in without location by explaining why.</p>
          </div>
        )}
        <Field label="Why is your location missing?" htmlFor={reasonId} hint={`10–500 characters (${reasonLength}/500)`}>
          <textarea
            id={reasonId}
            className={inputClass}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${reasonId}-hint`}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={!reasonValid || clockIn.isPending}>
            {clockIn.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Clock in without location
          </button>
          <button type="button" className={secondaryButton} disabled={clockIn.isPending} onClick={startClockIn}>
            Try location again
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={clockIn.isPending}
            onClick={() => {
              clockInRequest.current = null;
              setReason("");
              setError(null);
              setPhase({ kind: "idle" });
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  } else {
    const busy = phase.kind === "locating" || phase.kind === "saving";
    const last = data.todaySessions[data.todaySessions.length - 1];
    body = (
      <div className="space-y-3">
        {last ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle2 className="h-5 w-5 text-slate-500" aria-hidden="true" /> Clocked out
            </p>
            <TodaySessions sessions={data.todaySessions} totalSeconds={data.todayWorkedSeconds} timeZone={data.timeZone} />
            {last.autoClockedOutAt && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                You were automatically clocked out 30 minutes after your scheduled finish.{" "}
                {last.edited ? "This record has since been corrected." : "Contact HR if this time needs correcting."}
              </p>
            )}
            <p className="text-sm text-slate-600">Back at work? Clock in again; the time is added to today.</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">You haven&apos;t clocked in today.</p>
        )}
        <button type="button" className={primaryButton} disabled={busy} onClick={startClockIn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {phase.kind === "locating" ? "Getting your location…" : phase.kind === "saving" ? "Saving…" : last ? "Clock in again" : "Clock in"}
        </button>
        <p className="text-xs text-slate-500">Your location is captured once, when you clock in. It is not tracked during the day or at clock-out.</p>
      </div>
    );
  }

  if (compact) {
    const busy = phase.kind === "locating" || phase.kind === "saving" || clockOut.isPending;
    const unavailable = status.isError || (!status.isLoading && !data);
    const workedToday = !!data?.todaySessions.length;
    // The day's closed sessions plus the open one; a session left open from an earlier day counts alone.
    const openSeconds = open ? Math.max(0, Math.floor((serverNow - new Date(open.clockInAt).getTime()) / 1000)) : 0;
    const seconds = open && open.workDate !== data?.today ? openSeconds : (data?.todayWorkedSeconds ?? 0) + openSeconds;
    const elapsed = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map((part) => String(part).padStart(2, "0")).join(":");

    return (
      <>
        <div className="inline-flex max-w-full flex-wrap items-center gap-3">
          {(open || workedToday) && (
            <span className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400">Time clocked in</span>
              <span className="font-mono text-sm tabular-nums text-slate-200" aria-label={`Total time clocked in today: ${elapsed}`}>
                {elapsed}
              </span>
            </span>
          )}
          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status.isLoading || busy}
            aria-busy={status.isLoading || busy}
            aria-label={unavailable ? "Attendance unavailable. Try again" : phase.kind === "locating" ? "Getting your location" : undefined}
            onClick={() => unavailable ? void status.refetch() : open ? void submitClockOut(open) : void startClockIn()}
          >
            {(status.isLoading || busy) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {unavailable ? "Try again" : open ? "Clock out" : "Clock in"}
          </button>
        </div>
        <WorkDialog
          open={phase.kind === "needs-reason" || !!error}
          onOpenChange={(isOpen) => {
            if (isOpen || busy) return;
            setError(null);
            if (phase.kind === "needs-reason") {
              clockInRequest.current = null;
              setReason("");
              setPhase({ kind: "idle" });
            }
          }}
          title={phase.kind === "needs-reason" ? "Clock in without location" : "Attendance"}
        >
          {phase.kind === "needs-reason" && body}
          {error && <ErrorNote>{error}</ErrorNote>}
        </WorkDialog>
      </>
    );
  }

  return (
    <Surface className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Clock className="h-5 w-5 text-blue-600" aria-hidden="true" /> Today&apos;s attendance
        </h2>
        {data && <span className="text-xs text-slate-500">{formatDateOnly(data.today, { weekday: "long" })}</span>}
      </div>
      {data && <ScheduleLine schedule={data.todaySchedule} timeZone={data.timeZone} />}
      <div aria-live="polite">{body}</div>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Surface>
  );
}
