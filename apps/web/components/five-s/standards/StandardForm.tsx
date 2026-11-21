"use client";

import { useState, type FormEvent } from "react";
import type { StandardPayload } from "@/services/five-s.service";
import { AreaSelect, ErrorNote, Field, FileUploader, PersonSelect, inputClass, primaryButton, secondaryButton } from "@/components/five-s/ui";

const REFERENCE_ACCEPT = "image/*,.pdf,.txt,.csv,.xlsx,.xls,.docx";

export function StandardForm({
  initial,
  mode,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<StandardPayload>;
  mode: "create" | "edit";
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: StandardPayload) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<StandardPayload>({
    areaId: initial?.areaId ?? "",
    title: initial?.title ?? "",
    instructions: initial?.instructions ?? "",
    ownerId: initial?.ownerId ?? null,
    referenceUrls: initial?.referenceUrls ?? [],
    changeNote: initial?.changeNote ?? "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<StandardPayload>) => setV((x) => ({ ...x, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.areaId) return setFormError("Choose the area this standard applies to.");
    if (!v.title.trim()) return setFormError("Give the standard a title.");
    if (!v.instructions.trim()) return setFormError("Write the standard itself.");
    setFormError(null);
    onSubmit({ ...v, title: v.title.trim(), instructions: v.instructions.trim(), changeNote: v.changeNote?.trim() || null });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {(formError || error) && <ErrorNote>{formError ?? error}</ErrorNote>}
      {mode === "create" && (
        <Field label="Workplace area" htmlFor="std-area">
          <AreaSelect id="std-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </Field>
      )}
      <Field label="Title" htmlFor="std-title" hint="e.g. Tool shadow board – Press Line 1">
        <input id="std-title" className={inputClass} value={v.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Standard" htmlFor="std-instructions" hint="The agreed arrangement: locations, labels, quantities, colours, cleaning and inspection points.">
        <textarea id="std-instructions" rows={8} className={inputClass} value={v.instructions} maxLength={10000} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Standard owner" htmlFor="std-owner">
          <PersonSelect id="std-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} />
        </Field>
        <Field label="Change note" htmlFor="std-note" hint="What this revision changes.">
          <input id="std-note" className={inputClass} value={v.changeNote ?? ""} maxLength={500} onChange={(e) => set({ changeNote: e.target.value })} />
        </Field>
      </div>
      <div className="space-y-1 text-sm font-medium text-slate-700">
        Reference photos and documents
        <FileUploader
          urls={v.referenceUrls ?? []}
          onChange={(urls) => set({ referenceUrls: urls })}
          folder="five-s/standards"
          accept={REFERENCE_ACCEPT}
          label="Add photo or document"
          images={false}
        />
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
