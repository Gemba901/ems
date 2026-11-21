"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { useRecordRoutineCompletion, useRoutineSchedule, useUpdateRoutine } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import {
  ROUTINE_CATEGORY_LABELS,
  ROUTINE_FREQUENCY_LABELS,
  ROUTINE_OUTCOME_LABELS,
  type RoutineOutcome,
  type RoutineSchedule,
} from "@/services/five-s.service";
import { RoutineForm } from "@/components/five-s/standards/RoutineForm";
import {
  EmptyState,
  ErrorNote,
  Field,
  FiveSDialog,
  HEADER_ACTIONS,
  KeyValue,
  Loading,
  OccurrenceBadge,
  Surface,
  errorMessage,
  formatDate,
  formatTimestamp,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
  selectClass,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

type Occurrence = RoutineSchedule["occurrences"][number];

const RANGES = [
  { label: "Last 30 days and next 14", back: 30 },
  { label: "Last 90 days and next 14", back: 90 },
] as const;

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>();
  const { toast } = useToast();
  const [rangeIndex, setRangeIndex] = useState(0);
  const [anchor, setAnchor] = useState<string | null>(null);
  const range = anchor ? { from: shiftDate(anchor, -RANGES[rangeIndex].back), to: shiftDate(anchor, 14) } : {};
  const { data, isLoading, error } = useRoutineSchedule(routineId, range);
  const update = useUpdateRoutine();
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<Occurrence | null>(null);

  if (isLoading && !data) return <Loading label="Loading routine…" />;
  if (error || !data) return <ErrorNote>{errorMessage(error, "Routine not found")}</ErrorNote>;

  const r = data.routine;
  const occurrences = [...data.occurrences].reverse(); // newest first
  const hasChecks = data.history.length > 0;

  return (
    <div className="space-y-6">
      <Link href={`/five-s/standards?tab=routines&areaId=${r.area.id}`} className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Routines
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {r.title}
            {!r.isActive && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 align-middle text-sm font-medium text-slate-600">Inactive</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {ROUTINE_FREQUENCY_LABELS[r.frequency]} · {ROUTINE_CATEGORY_LABELS[r.category]} ·{" "}
            <Link href={`/five-s/areas/${r.area.id}`} className="text-blue-700 hover:underline">
              {r.area.name}
            </Link>
          </p>
        </div>
        {r.permissions.canEdit && (
          <div className={HEADER_ACTIONS}>
            <button
              type="button"
              className={secondaryButton}
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: r.id, body: { isActive: !r.isActive } },
                  {
                    onSuccess: () => toast(r.isActive ? "Routine deactivated. Its history is kept." : "Routine reactivated", "success"),
                    onError: (e) => toast(errorMessage(e), "error"),
                  },
                )
              }
            >
              {r.isActive ? "Deactivate" : "Reactivate"}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
          </div>
        )}
      </header>

      <p className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
        Routines keep an area to its standard. Recording or missing a check does not change audit scores or create improvement actions.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Surface>
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Scheduled checks</h2>
            <select
              aria-label="Date range"
              className={cn(selectClass, "sm:w-64")}
              value={rangeIndex}
              onChange={(e) => {
                setRangeIndex(Number(e.target.value));
                setAnchor(data.today);
              }}
            >
              {RANGES.map((x, i) => (
                <option key={x.label} value={i}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          {occurrences.length === 0 ? (
            <EmptyState title="No scheduled checks in this range">The first check is on {formatDate(r.startDate)}.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {occurrences.map((o) => (
                <li key={o.date} className={cn("flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between", o.date === data.today && "bg-blue-50/50")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{formatDate(o.date)}</span>
                      <OccurrenceBadge state={o.state} />
                    </div>
                    {o.completion && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Recorded by {o.completion.completedBy?.name ?? "—"} · {formatTimestamp(o.completion.completedAt)}
                        {o.completion.exception && <span className="block text-slate-700">Exception: {o.completion.exception}</span>}
                      </p>
                    )}
                  </div>
                  {o.canRecord && !o.completion && r.isActive && (
                    <button type="button" className={cn(primaryButton, "shrink-0")} onClick={() => setRecording(o)}>
                      Record check
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <div className="space-y-6">
          <Surface className="p-4">
            <dl className="space-y-3">
              <KeyValue label="What">{r.title}</KeyValue>
              <KeyValue label="Where">{r.checkLocation}</KeyValue>
              <KeyValue label="Who">{r.responsible?.name ?? "Area owner"}</KeyValue>
              <KeyValue label="How often">
                {ROUTINE_FREQUENCY_LABELS[r.frequency]}, from {formatDate(r.startDate)}
              </KeyValue>
              {r.instructions && (
                <KeyValue label="How">
                  <span className="whitespace-pre-line">{r.instructions}</span>
                </KeyValue>
              )}
            </dl>
          </Surface>

          <Surface>
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Completion history</h2>
            {data.history.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No checks recorded yet.</p>
            ) : (
              <ol className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {data.history.map((h) => (
                  <li key={h.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium text-slate-900">
                      {formatDate(h.scheduledDate)} · {ROUTINE_OUTCOME_LABELS[h.outcome]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {h.completedBy?.name ?? "—"} · {formatTimestamp(h.completedAt)}
                    </p>
                    {h.exception && <p className="mt-0.5 text-xs text-slate-700">{h.exception}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Surface>
        </div>
      </div>

      <FiveSDialog open={editing} onOpenChange={setEditing} title="Edit routine" size="lg">
        <RoutineForm
          mode="edit"
          frequencyLocked={hasChecks}
          initial={{ areaId: r.area.id, title: r.title, checkLocation: r.checkLocation, instructions: r.instructions, category: r.category, frequency: r.frequency, responsibleId: r.responsible?.id ?? null, startDate: r.startDate }}
          submitLabel="Save"
          busy={update.isPending}
          error={update.error ? errorMessage(update.error) : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => {
            const body = {
              title: values.title,
              checkLocation: values.checkLocation,
              instructions: values.instructions,
              category: values.category,
              responsibleId: values.responsibleId ?? null,
              ...(values.frequency !== r.frequency ? { frequency: values.frequency } : {}),
            };
            update.mutate(
              { id: r.id, body },
              {
                onSuccess: () => {
                  toast("Routine saved", "success");
                  setEditing(false);
                },
              },
            );
          }}
        />
      </FiveSDialog>

      {recording && <RecordDialog routineId={r.id} occurrence={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

function RecordDialog({ routineId, occurrence, onClose }: { routineId: string; occurrence: Occurrence; onClose: () => void }) {
  const { toast } = useToast();
  const record = useRecordRoutineCompletion();
  const [outcome, setOutcome] = useState<RoutineOutcome>("DONE");
  const [exception, setException] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const needsException = outcome !== "DONE";

  function save() {
    if (needsException && exception.trim().length < 3) return setFormError("Describe the exception or why the check was not done.");
    setFormError(null);
    record.mutate(
      { id: routineId, body: { scheduledDate: occurrence.date, outcome, ...(exception.trim() ? { exception: exception.trim() } : {}) } },
      {
        onSuccess: () => {
          toast("Check recorded", "success");
          onClose();
        },
      },
    );
  }

  return (
    <FiveSDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record check for ${formatDate(occurrence.date)}`}
      description="Once recorded, a check cannot be changed."
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={record.isPending} onClick={save}>
            {record.isPending ? "Saving…" : "Record"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || record.error) && <ErrorNote>{formError ?? errorMessage(record.error)}</ErrorNote>}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Outcome</legend>
          {(Object.keys(ROUTINE_OUTCOME_LABELS) as RoutineOutcome[]).map((o) => (
            <label key={o} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
              {ROUTINE_OUTCOME_LABELS[o]}
            </label>
          ))}
        </fieldset>
        <Field label={needsException ? "Exception (required)" : "Exception (optional)"} htmlFor="rt-exception">
          <textarea id="rt-exception" rows={3} className={inputClass} value={exception} maxLength={1000} onChange={(e) => setException(e.target.value)} />
        </Field>
      </div>
    </FiveSDialog>
  );
}
