"use client";

import { useState, type FormEvent } from "react";
import { AUDIT_FREQUENCY_LABELS, type AreaPayload, type AuditFrequency } from "@/services/five-s.service";
import { useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { DepartmentSelect, ErrorNote, Field, PersonSelect, inputClass, primaryButton, secondaryButton, selectClass } from "@/components/five-s/ui";

// 1.0, 1.1 … 3.5: the same scale the audit formula produces. Never a percentage.
const TARGET_LEVELS = Array.from({ length: 26 }, (_, i) => (35 - i) / 10);

export type AreaFormValues = AreaPayload;

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
  const { data: caps } = useFiveSCapabilities();
  const [values, setValues] = useState<AreaFormValues>({
    name: initial?.name ?? "",
    departmentId: initial?.departmentId ?? (caps && !caps.isModuleAdmin ? caps.departmentId : null),
    ownerId: initial?.ownerId ?? null,
    description: initial?.description ?? "",
    auditBoundary: initial?.auditBoundary ?? "",
    auditFrequency: initial?.auditFrequency ?? "MONTHLY",
    targetLevel: initial?.targetLevel ?? 3.0,
  });
  const [nameError, setNameError] = useState<string | null>(null);
  const set = (patch: Partial<AreaFormValues>) => setValues((v) => ({ ...v, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (values.name.trim().length < 2) {
      setNameError("Give the area a name of at least 2 characters");
      return;
    }
    setNameError(null);
    onSubmit({ ...values, name: values.name.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <Field label="Area name" htmlFor="area-name" error={nameError} hint="For example: Press Shop Line 1, Main Stores, Maintenance Workshop">
        <input id="area-name" className={inputClass} value={values.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor="area-dept" hint={caps && !caps.isModuleAdmin ? "HODs create areas in their own department." : undefined}>
          <DepartmentSelect id="area-dept" value={values.departmentId} onChange={(id) => set({ departmentId: id })} disabled={!!caps && !caps.isModuleAdmin} />
        </Field>
        <Field label="Area owner" htmlFor="area-owner" hint="Accountable for the area's 5S condition and its actions.">
          <PersonSelect id="area-owner" value={values.ownerId} onChange={(id) => set({ ownerId: id })} />
        </Field>
      </div>
      <Field label="Description" htmlFor="area-desc">
        <textarea id="area-desc" rows={2} className={inputClass} value={values.description ?? ""} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field
        label="Audit boundary"
        htmlFor="area-boundary"
        hint="The machines, workstations, racks, storage locations or spaces included in an assessment. Auditors confirm it at the start of each audit."
      >
        <textarea id="area-boundary" rows={3} className={inputClass} value={values.auditBoundary ?? ""} maxLength={4000} onChange={(e) => set({ auditBoundary: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audit frequency" htmlFor="area-frequency">
          <select id="area-frequency" className={selectClass} value={values.auditFrequency} onChange={(e) => set({ auditFrequency: e.target.value as AuditFrequency })}>
            {(Object.keys(AUDIT_FREQUENCY_LABELS) as AuditFrequency[]).map((f) => (
              <option key={f} value={f}>
                {AUDIT_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target 5S level" htmlFor="area-target" hint="On the audit's 1.0–3.5 level scale (3.5 = no abnormalities). Not a percentage.">
          <select id="area-target" className={selectClass} value={values.targetLevel.toFixed(1)} onChange={(e) => set({ targetLevel: Number(e.target.value) })}>
            {TARGET_LEVELS.map((l) => (
              <option key={l} value={l.toFixed(1)}>
                {l.toFixed(1)}
                {l === 3.5 ? " (0 abnormality points)" : ` (up to ${(35 - Math.round(l * 10)) * 4} points)`}
              </option>
            ))}
          </select>
        </Field>
      </div>
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
