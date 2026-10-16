"use client";

import { useState, type FormEvent } from "react";
import {
  ROUTINE_CATEGORY_LABELS,
  ROUTINE_FREQUENCY_LABELS,
  type RoutineCategory,
  type RoutineFrequency,
  type RoutinePayload,
} from "@/services/five-s.service";
import { AreaSelect, ErrorNote, Field, PersonSelect, inputClass, primaryButton, secondaryButton, selectClass } from "@/components/five-s/ui";

export function RoutineForm({
  initial,
  mode,
  frequencyLocked,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<RoutinePayload>;
  mode: "create" | "edit";
  /** Once checks are recorded the schedule cannot change; deactivate and create a new routine instead. */
  frequencyLocked?: boolean;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: RoutinePayload) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<RoutinePayload>({
    areaId: initial?.areaId ?? "",
    title: initial?.title ?? "",
    checkLocation: initial?.checkLocation ?? "",
    instructions: initial?.instructions ?? "",
    category: initial?.category ?? "CLEANING",
    frequency: initial?.frequency ?? "DAILY",
    responsibleId: initial?.responsibleId ?? null,
    startDate: initial?.startDate ?? "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<RoutinePayload>) => setV((x) => ({ ...x, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.areaId) return setFormError("Choose the area.");
    if (v.title.trim().length < 3) return setFormError("Describe what is checked (at least 3 characters).");
    if (v.checkLocation.trim().length < 2) return setFormError("Say where the check is done.");
    if (mode === "create" && !v.startDate) return setFormError("Choose the date of the first check.");
    setFormError(null);
    onSubmit({ ...v, title: v.title.trim(), checkLocation: v.checkLocation.trim(), instructions: v.instructions?.trim() || null });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {(formError || error) && <ErrorNote>{formError ?? error}</ErrorNote>}
      {mode === "create" && (
        <Field label="Workplace area" htmlFor="rt-area">
          <AreaSelect id="rt-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </Field>
      )}
      <Field label="What is checked" htmlFor="rt-title" hint="e.g. Wipe down and inspect the hydraulic press guarding">
        <input id="rt-title" className={inputClass} value={v.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Where" htmlFor="rt-where">
        <input id="rt-where" className={inputClass} value={v.checkLocation} maxLength={300} onChange={(e) => set({ checkLocation: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type of check" htmlFor="rt-category">
          <select id="rt-category" className={selectClass} value={v.category} onChange={(e) => set({ category: e.target.value as RoutineCategory })}>
            {(Object.keys(ROUTINE_CATEGORY_LABELS) as RoutineCategory[]).map((c) => (
              <option key={c} value={c}>
                {ROUTINE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="How often"
          htmlFor="rt-frequency"
          hint={frequencyLocked ? "Locked because checks have been recorded. Deactivate this routine and create a new one to change it." : undefined}
        >
          <select
            id="rt-frequency"
            className={selectClass}
            value={v.frequency}
            disabled={frequencyLocked}
            onChange={(e) => set({ frequency: e.target.value as RoutineFrequency })}
          >
            {(Object.keys(ROUTINE_FREQUENCY_LABELS) as RoutineFrequency[]).map((f) => (
              <option key={f} value={f}>
                {ROUTINE_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who" htmlFor="rt-who" hint="The responsible person, area owner or HOD can record checks.">
          <PersonSelect id="rt-who" value={v.responsibleId} onChange={(id) => set({ responsibleId: id })} emptyLabel="Area owner" />
        </Field>
        {mode === "create" && (
          <Field label="First check" htmlFor="rt-start" hint="Weekly and monthly checks repeat on this weekday or day of the month.">
            <input id="rt-start" type="date" className={inputClass} value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
        )}
      </div>
      <Field label="How (optional)" htmlFor="rt-how">
        <textarea id="rt-how" rows={4} className={inputClass} value={v.instructions ?? ""} maxLength={2000} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && (
          <button type="button" className={secondaryButton} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
