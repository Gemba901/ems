"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useState, type FormEvent } from "react";
import {
  ROUTINE_CATEGORY_LABELS,
  ROUTINE_FREQUENCY_LABELS,
  type RoutineCategory,
  type RoutineFrequency,
  type RoutinePayload,
} from "@/services/five-s.service";
import { AreaSelect, PersonSelect } from "@/components/five-s/ui";

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

  const message = formError ?? error;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {message && <ErrorState description={message} />}
      {mode === "create" && (
        <FormField label="Workplace area" id="rt-area">
          <AreaSelect id="rt-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </FormField>
      )}
      <FormField label="What is checked" id="rt-title" description="e.g. Wipe down and inspect the hydraulic press guarding">
        <Input id="rt-title" value={v.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </FormField>
      <FormField label="Where" id="rt-where">
        <Input id="rt-where" value={v.checkLocation} maxLength={300} onChange={(e) => set({ checkLocation: e.target.value })} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type of check" id="rt-category">
          <NativeSelect id="rt-category" className="w-full" value={v.category} onChange={(e) => set({ category: e.target.value as RoutineCategory })}>
            {(Object.keys(ROUTINE_CATEGORY_LABELS) as RoutineCategory[]).map((c) => (
              <option key={c} value={c}>
                {ROUTINE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label="How often"
          id="rt-frequency"
          description={frequencyLocked ? "Locked because checks have been recorded. Deactivate this routine and create a new one to change it." : undefined}
        >
          <NativeSelect
            id="rt-frequency"
            className="w-full"
            value={v.frequency}
            disabled={frequencyLocked}
            onChange={(e) => set({ frequency: e.target.value as RoutineFrequency })}
          >
            {(Object.keys(ROUTINE_FREQUENCY_LABELS) as RoutineFrequency[]).map((f) => (
              <option key={f} value={f}>
                {ROUTINE_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Who" id="rt-who" description="The responsible person, area owner or HOD can record checks.">
          <PersonSelect id="rt-who" value={v.responsibleId} onChange={(id) => set({ responsibleId: id })} emptyLabel="Area owner" />
        </FormField>
        {mode === "create" && (
          <FormField label="First check" id="rt-start" description="Weekly and monthly checks repeat on this weekday or day of the month.">
            <Input id="rt-start" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </FormField>
        )}
      </div>
      <FormField label="How (optional)" id="rt-how">
        <Textarea id="rt-how" rows={4} value={v.instructions ?? ""} maxLength={2000} onChange={(e) => set({ instructions: e.target.value })} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
