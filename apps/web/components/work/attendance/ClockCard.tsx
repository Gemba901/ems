"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, MapPinOff } from "lucide-react";
import { useAttendanceStatus, useClockIn, useClockOut } from "@/hooks/work/useWork";
import { formatDateOnly, formatDuration, formatTime } from "@/lib/work/format";
import { readLocation } from "@/lib/work/location";
import { WorkApiError, type AttendanceRecord, type AttendanceStatus, type CapturedLocation } from "@/services/work.service";
import { WorkDialog, errorMessage } from "@/components/work/ui";

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
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Location captured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPinOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Location missing (reason given)
    </span>
  );
}

// Today's earlier sessions, so someone who stepped out can see what has already been counted.
function TodaySessions({ sessions, totalSeconds, timeZone }: { sessions: AttendanceRecord[]; totalSeconds: number; timeZone: string }) {
  const closed = sessions.filter((s) => s.clockOutAt);
  if (closed.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Today&apos;s sessions</span>
        <span className="text-muted-foreground">
          Total <strong className="font-semibold text-foreground">{formatDuration(totalSeconds)}</strong>
        </span>
      </div>
      <ul className="space-y-1">
        {closed.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-foreground">
            <span>
              {formatTime(s.clockInAt, timeZone)} – {formatTime(s.clockOutAt!, timeZone)}
              {s.autoClockedOutAt && <span className="ml-1.5 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning">Auto</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatDuration(s.durationSeconds ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleLine({ schedule, timeZone }: { schedule: AttendanceStatus["todaySchedule"]; timeZone: string }) {
  if (schedule.dayType === "HOLIDAY") {
    return <p className="-mt-2 mb-4 text-sm text-muted-foreground">{schedule.holidayName ?? "Holiday"}: no one is expected in today.</p>;
  }
  if (schedule.dayType === "NON_WORKING" || !schedule.startsAt || !schedule.endsAt) {
    return <p className="-mt-2 mb-4 text-sm text-muted-foreground">Not a working day. Clock in only if you are working.</p>;
  }
  return (
    <p className="-mt-2 mb-4 text-sm text-muted-foreground">
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
  const submittingClockIn = useRef(false);
  const clockInRequest = useRef<string | null>(null);
  const clockOutRequest = useRef<{ recordId: string; requestId: string } | null>(null);

  const data = status.data;
  const open = data?.openRecord ?? null;
  const now = useNow(!!open, compact ? 1_000 : 30_000);
  // Elapsed time uses the server clock, adjusted by how long ago the status was fetched.
  const serverNow = data ? new Date(data.serverNow).getTime() + Math.max(0, now - status.dataUpdatedAt) : now;

  async function submitClockIn(payload: { location?: CapturedLocation; reason?: string }) {
    if (submittingClockIn.current) return;
    clockInRequest.current ??= newRequestId();
    submittingClockIn.current = true;
    if (payload.location) setPhase({ kind: "saving" });
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
    } finally {
      submittingClockIn.current = false;
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking today&apos;s attendance…
      </p>
    );
  } else if (status.isError || !data) {
    body = (
      <div className="space-y-3">
        <p role="alert" className="text-danger">We couldn&apos;t load your attendance. {errorMessage(status.error, "")}</p>
        <Button type="button" variant="outline" onClick={() => status.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (open && open.workDate !== data.today) {
    // A session left open from an earlier day: close it first, then today's clock-in is possible.
    body = (
      <div className="space-y-3">
        <div className="flex gap-3 rounded-lg border border-warning bg-warning-subtle px-3 py-3 text-sm text-warning" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            You are still clocked in from <strong>{formatDateOnly(open.workDate, { weekday: "short" })}</strong> (since{" "}
            {formatTime(open.clockInAt, data.timeZone)}). Clock out of that session before clocking in today. If the clock-out time is wrong, ask HR or your
            manager to correct it.
          </p>
        </div>
        <Button type="button" disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
          {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {clockOut.isPending ? "Saving…" : "Clock out of earlier session"}
        </Button>
      </div>
    );
  } else if (open) {
    // A session that began at or after the scheduled finish has no automatic cutoff.
    const autoClockOut = open.scheduledEndAt && open.clockInAt < open.scheduledEndAt ? open.scheduledEndAt : null;
    body = (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Clocked in
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Started</dt>
            <dd className="font-semibold text-foreground">{formatTime(open.clockInAt, data.timeZone)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Elapsed</dt>
            <dd className="font-semibold text-foreground">{formatDuration((serverNow - new Date(open.clockInAt).getTime()) / 1000)}</dd>
          </div>
        </dl>
        <LocationLine record={open} />
        <TodaySessions sessions={data.todaySessions} totalSeconds={data.todayWorkedSeconds} timeZone={data.timeZone} />
        {autoClockOut ? (
          <p className="text-xs text-muted-foreground">
            Automatic clock-out at {formatTime(new Date(new Date(autoClockOut).getTime() + 30 * 60_000).toISOString(), data.timeZone)} if you
            haven&apos;t clocked out.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {open.scheduledEndAt ? "This session started after work hours." : "No scheduled finish for this day."} Remember to clock out manually.
          </p>
        )}
        <div>
          <Button type="button" disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
            {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {clockOut.isPending ? "Saving…" : "Clock out"}
          </Button>
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
          <div className="flex gap-2 rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning" role="alert">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{phase.problem} You can try again, or clock in without location by explaining why.</p>
          </div>
        )}
        <FormField label="Why is your location missing?" id={reasonId} description={`10–500 characters (${reasonLength}/500)`}>
          <Textarea
            id={reasonId}
            rows={3}
            maxLength={500}
            value={reason}
            disabled={clockIn.isPending}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!reasonValid || clockIn.isPending}>
            {clockIn.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Clock in without location
          </Button>
          <Button type="button" variant="outline" disabled={clockIn.isPending} onClick={startClockIn}>
            Try location again
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={clockIn.isPending}
            onClick={() => {
              clockInRequest.current = null;
              setReason("");
              setError(null);
              setPhase({ kind: "idle" });
            }}
          >
            Cancel
          </Button>
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
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Clocked out
            </p>
            <TodaySessions sessions={data.todaySessions} totalSeconds={data.todayWorkedSeconds} timeZone={data.timeZone} />
            {last.autoClockedOutAt && (
              <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning">
                You were automatically clocked out 30 minutes after your scheduled finish.{" "}
                {last.edited ? "This record has since been corrected." : "Contact HR if this time needs correcting."}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Back at work? Clock in again; the time is added to today.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">You haven&apos;t clocked in today.</p>
        )}
        <Button type="button" disabled={busy} onClick={startClockIn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {phase.kind === "locating" ? "Getting your location…" : phase.kind === "saving" ? "Saving…" : last ? "Clock in again" : "Clock in"}
        </Button>
        <p className="text-xs text-muted-foreground">Your location is captured once, when you clock in. It is not tracked during the day or at clock-out.</p>
      </div>
    );
  }

  if (compact) {
    const busy = phase.kind === "locating" || phase.kind === "saving" || clockIn.isPending || clockOut.isPending;
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
              <span className="text-[11px] font-medium text-primary-foreground/70">Time clocked in</span>
              <span className="font-mono text-sm tabular-nums text-primary-foreground" aria-label={`Total time clocked in today: ${elapsed}`}>
                {elapsed}
              </span>
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status.isLoading || busy}
            aria-busy={status.isLoading || busy}
            aria-label={unavailable ? "Attendance unavailable. Try again" : phase.kind === "locating" ? "Getting your location" : undefined}
            onClick={() => unavailable ? void status.refetch() : open ? void submitClockOut(open) : void startClockIn()}
          >
            {(status.isLoading || busy) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {unavailable ? "Try again" : open ? "Clock out" : "Clock in"}
          </Button>
        </div>
        <WorkDialog
          open={phase.kind === "needs-reason" || !!error}
          onOpenChange={(isOpen) => {
            if (isOpen || busy || submittingClockIn.current) return;
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
          {error && <ErrorState description={error} />}
        </WorkDialog>
      </>
    );
  }

  return (
    <Card className="block p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Clock className="h-5 w-5 text-info" aria-hidden="true" /> Today&apos;s attendance
        </h2>
        {data && <span className="text-xs text-muted-foreground">{formatDateOnly(data.today, { weekday: "long" })}</span>}
      </div>
      {data && <ScheduleLine schedule={data.todaySchedule} timeZone={data.timeZone} />}
      <div aria-live="polite">{body}</div>
      {error && (
        <div className="mt-3">
          <ErrorState description={error} />
        </div>
      )}
    </Card>
  );
}
