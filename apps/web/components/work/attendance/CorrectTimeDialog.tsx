"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCorrectAttendance } from "@/hooks/work/useWork";
import { formatDateOnly, isoToZonedInput, zonedInputToIso } from "@/lib/work/format";
import { WorkApiError, type CorrectAttendancePayload, type TeamAttendanceRecord } from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { ErrorNote, Field, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

/** Manager correction of one record's times. Sends the version it was shown, so a concurrent edit is caught. Mount only while open. */
export function CorrectTimeDialog({ record, onClose }: { record: TeamAttendanceRecord; onClose: () => void }) {
  const tz = record.timezoneAtClockIn;
  const correct = useCorrectAttendance();
  const { toast } = useToast();
  const initialIn = isoToZonedInput(record.clockInAt, tz);
  const initialOut = record.clockOutAt ? isoToZonedInput(record.clockOutAt, tz) : "";
  const [clockIn, setClockIn] = useState(initialIn);
  const [clockOut, setClockOut] = useState(initialOut);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const reasonLength = reason.trim().length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const inIso = clockIn !== initialIn ? zonedInputToIso(clockIn, tz) : undefined;
    const outIso = clockOut !== initialOut ? zonedInputToIso(clockOut, tz) : undefined;
    if (!clockIn) next.clockIn = "Enter the clock-in time.";
    else if (inIso === null) next.clockIn = "Enter a valid date and time.";
    if (record.clockOutAt && !clockOut) next.clockOut = "A clock-out time can be moved but not removed.";
    else if (outIso === null) next.clockOut = "Enter a valid date and time.";
    const effectiveIn = inIso ?? record.clockInAt;
    const effectiveOut = outIso ?? record.clockOutAt;
    if (!next.clockOut && effectiveOut && effectiveIn && new Date(effectiveOut) <= new Date(effectiveIn)) {
      next.clockOut = "Clock-out must be after clock-in.";
    }
    if (inIso === undefined && outIso === undefined) next.form = "Change at least one time.";
    if (reasonLength < 10 || reasonLength > 500) next.reason = "Give a reason of 10–500 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const data: CorrectAttendancePayload = { reason: reason.trim(), expectedVersion: record.version };
    if (inIso) data.clockInAt = inIso;
    if (outIso) data.clockOutAt = outIso;
    setServerError(null);
    try {
      await correct.mutateAsync({ recordId: record.id, data });
      toast("Attendance corrected", "success");
      onClose();
    } catch (err) {
      if (err instanceof WorkApiError && err.code === "VERSION_CONFLICT") setConflict(true);
      else setServerError(errorMessage(err, "The correction was not saved."));
    }
  }

  return (
    <WorkDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Correct time"
      description={`${record.employee.name} · ${formatDateOnly(record.workDate, { weekday: "short" })} · times in ${tz}`}
      footer={
        conflict ? (
          <button type="button" className={primaryButton} onClick={onClose}>
            Close and reload
          </button>
        ) : (
          <>
            <button type="button" className={secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="correct-form" className={primaryButton} disabled={correct.isPending}>
              {correct.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save correction
            </button>
          </>
        )
      }
    >
      {conflict ? (
        <ErrorNote>
          Someone else changed this record while you were editing it. Close this dialog to load the latest times, then try again.
        </ErrorNote>
      ) : (
        <form id="correct-form" className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clock in" htmlFor="correct-in" error={errors.clockIn}>
              <input
                id="correct-in"
                type="datetime-local"
                className={inputClass}
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                aria-invalid={!!errors.clockIn}
                aria-describedby={errors.clockIn ? "correct-in-error" : undefined}
              />
            </Field>
            <Field
              label="Clock out"
              htmlFor="correct-out"
              error={errors.clockOut}
              hint={record.clockOutAt ? undefined : "Still clocked in. Leave empty to keep the session open."}
            >
              <input
                id="correct-out"
                type="datetime-local"
                className={inputClass}
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                aria-invalid={!!errors.clockOut}
                aria-describedby={errors.clockOut ? "correct-out-error" : record.clockOutAt ? undefined : "correct-out-hint"}
              />
            </Field>
          </div>
          <Field label="Reason" htmlFor="correct-reason" error={errors.reason} hint={`10–500 characters (${reasonLength}/500)`}>
            <textarea
              id="correct-reason"
              className={inputClass}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!errors.reason}
              aria-describedby={errors.reason ? "correct-reason-error" : "correct-reason-hint"}
            />
          </Field>
          {errors.form && <ErrorNote>{errors.form}</ErrorNote>}
          {serverError && <ErrorNote>{serverError}</ErrorNote>}
        </form>
      )}
    </WorkDialog>
  );
}
