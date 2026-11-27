"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useState, type FormEvent } from "react";
import { AUDIT_FREQUENCY_LABELS, type AreaSettingsPayload, type AuditFrequency } from "@/services/five-s.service";
import { PersonSelect } from "@/components/five-s/ui";

// 1.0, 1.1 … 3.5: the same scale the audit formula produces. Never a percentage.
const TARGET_LEVELS = Array.from({ length: 26 }, (_, i) => (35 - i) / 10);

export type AreaFormValues = AreaSettingsPayload;

// The area's name and department come from employee profiles, so only its 5S settings are edited here.
export function AreaForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<AreaFormValues>;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: AreaFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<AreaFormValues>({
    ownerId: initial?.ownerId ?? null,
    description: initial?.description ?? "",
    auditFrequency: initial?.auditFrequency ?? "MONTHLY",
    targetLevel: initial?.targetLevel ?? 3.0,
  });
  const set = (patch: Partial<AreaFormValues>) => setValues((v) => ({ ...v, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {!!error && <ErrorState description={error} />}
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        The area name and department come from employee profiles (Work Area / Section). Change them in the employee records.
      </p>
      <FormField label="Area owner" id="area-owner" description="Accountable for the area's 5S condition and its actions.">
        <PersonSelect id="area-owner" value={values.ownerId ?? null} onChange={(id) => set({ ownerId: id })} />
      </FormField>
      <FormField label="Description" id="area-desc">
        <Textarea id="area-desc" rows={2} value={values.description ?? ""} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Audit frequency" id="area-frequency">
          <NativeSelect id="area-frequency" className="w-full" value={values.auditFrequency} onChange={(e) => set({ auditFrequency: e.target.value as AuditFrequency })}>
            {(Object.keys(AUDIT_FREQUENCY_LABELS) as AuditFrequency[]).map((f) => (
              <option key={f} value={f}>
                {AUDIT_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Target 5S level" id="area-target" description="On the audit's 1.0–3.5 level scale (3.5 = no abnormalities). Not a percentage.">
          <NativeSelect id="area-target" className="w-full" value={values.targetLevel.toFixed(1)} onChange={(e) => set({ targetLevel: Number(e.target.value) })}>
            {TARGET_LEVELS.map((l) => (
              <option key={l} value={l.toFixed(1)}>
                {l.toFixed(1)}
                {l === 3.5 ? " (0 abnormality points)" : ` (up to ${(35 - Math.round(l * 10)) * 4} points)`}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
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
