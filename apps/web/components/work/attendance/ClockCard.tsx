"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, MapPinOff } from "lucide-react";
import { useAttendanceStatus, useClockIn, useClockOut } from "@/hooks/work/useWork";
import { formatDateOnly, formatDuration, formatTime } from "@/lib/work/format";
import { WorkApiError, type AttendanceRecord, type CapturedLocation } from "@/services/work.service";
import { ErrorNote, Field, Surface, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

type Phase =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "saving" }
  | { kind: "needs-reason"; problem: string };

// Location is read once, only after the person presses Clock in, and is sent straight to the
// backend. It is never stored in component state longer than the request, logged or reported.
function readLocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser cannot share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Math.max(pos.coords.accuracy || 0, 0.001),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied."
              : err.code === err.TIMEOUT
                ? "Getting your location took too long."
                : "Your location is unavailable right now.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
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

export function ClockCard() {
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
  const now = useNow(!!open);
  // Elapsed time uses the server clock, adjusted by how long ago the status was fetched.
  const serverNow = data ? new Date(data.serverNow).getTime() + (now - status.dataUpdatedAt) : now;

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
      if (e instanceof WorkApiError && (e.code === "ATTENDANCE_ALREADY_OPEN" || e.code === "ATTENDANCE_DAY_COMPLETED")) {
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
            {formatTime(open.clockInAt, data.timeZone)}). Clock out of that session before clocking in today. If the clock-out
            time is wrong, ask HR or your manager to correct it.
          </p>
        </div>
        <button type="button" className={primaryButton} disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
          {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {clockOut.isPending ? "Saving…" : "Clock out of earlier session"}
        </button>
      </div>
    );
  } else if (open) {
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
            <dd className="font-semibold text-slate-900">
              {formatDuration((serverNow - new Date(open.clockInAt).getTime()) / 1000)}
            </dd>
          </div>
        </dl>
        <LocationLine record={open} />
        <div>
          <button type="button" className={primaryButton} disabled={clockOut.isPending} onClick={() => submitClockOut(open)}>
            {clockOut.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {clockOut.isPending ? "Saving…" : "Clock out"}
          </button>
        </div>
      </div>
    );
  } else if (data.todayRecord) {
    const done = data.todayRecord;
    body = (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CheckCircle2 className="h-5 w-5 text-slate-500" aria-hidden="true" /> Finished for today
        </p>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Start</dt>
            <dd className="font-semibold text-slate-900">{formatTime(done.clockInAt, data.timeZone)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">End</dt>
            <dd className="font-semibold text-slate-900">{done.clockOutAt ? formatTime(done.clockOutAt, data.timeZone) : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Duration</dt>
            <dd className="font-semibold text-slate-900">
              {done.durationSeconds != null ? formatDuration(done.durationSeconds) : "—"}
            </dd>
          </div>
        </dl>
        <LocationLine record={done} />
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
        <Field
          label="Why is your location missing?"
          htmlFor="location-missing-reason"
          hint={`10–500 characters (${reasonLength}/500)`}
        >
          <textarea
            id="location-missing-reason"
            className={inputClass}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby="location-missing-reason-hint"
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
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">You haven&apos;t clocked in today.</p>
        <button type="button" className={primaryButton} disabled={busy} onClick={startClockIn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {phase.kind === "locating" ? "Getting your location…" : phase.kind === "saving" ? "Saving…" : "Clock in"}
        </button>
        <p className="text-xs text-slate-500">
          Your location is captured once, when you clock in. It is not tracked during the day or at clock-out.
        </p>
      </div>
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
      <div aria-live="polite">{body}</div>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Surface>
  );
}
