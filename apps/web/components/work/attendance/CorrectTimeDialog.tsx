"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCorrectAttendance } from "@/hooks/work/useWork";
import { formatDateOnly, isoToZonedInput, zonedInputToIso } from "@/lib/work/format";
import { WorkApiError, type CorrectAttendancePayload, type TeamAttendanceRecord } from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { errorMessage } from "@/components/work/ui";

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
  const saving = useRef(false);
  const reasonLength = reason.trim().length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || correct.isPending) return;
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
    saving.current = true;
    try {
      await correct.mutateAsync({ recordId: record.id, data });
      toast("Attendance corrected", "success");
      onClose();
    } catch (err) {
      if (err instanceof WorkApiError && err.code === "VERSION_CONFLICT") setConflict(true);
      else setServerError(errorMessage(err, "The correction was not saved."));
    } finally {
      saving.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !correct.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!correct.isPending}>
        <DialogHeader className="pr-8">
          <DialogTitle>Correct time</DialogTitle>
          <DialogDescription>{`${record.employee.name} · ${formatDateOnly(record.workDate, { weekday: "short" })} · times in ${tz}`}</DialogDescription>
        </DialogHeader>
        {conflict ? (
          <div role="alert" className="rounded-lg bg-danger-subtle p-3 text-danger">
            Someone else changed this record while you were editing it. Close this dialog to load the latest times, then try again.
          </div>
        ) : (
          <form id="correct-form" className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Clock in" id="correct-in" error={errors.clockIn}>
                <Input
                  id="correct-in"
                  type="datetime-local"
                  value={clockIn}
                  disabled={correct.isPending}
                  onChange={(e) => setClockIn(e.target.value)}
                />
              </FormField>
              <FormField
                label="Clock out"
                id="correct-out"
                error={errors.clockOut}
                description={record.clockOutAt ? undefined : "Still clocked in. Leave empty to keep the session open."}
              >
                <Input
                  id="correct-out"
                  type="datetime-local"
                  value={clockOut}
                  disabled={correct.isPending}
                  onChange={(e) => setClockOut(e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Reason" id="correct-reason" error={errors.reason} description={`10–500 characters (${reasonLength}/500)`}>
              <Textarea
                id="correct-reason"
                rows={3}
                maxLength={500}
                value={reason}
                disabled={correct.isPending}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
            {errors.form && <ErrorState description={errors.form} />}
            {serverError && <ErrorState description={serverError} />}
          </form>
        )}
        <DialogFooter>
          {conflict ? (
              <Button variant="ghost" type="button" onClick={onClose}>
                Close and reload
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={correct.isPending}>
                  Cancel
                </Button>
                <Button type="submit" form="correct-form" disabled={correct.isPending}>
                  {correct.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Save correction
                </Button>
              </>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
