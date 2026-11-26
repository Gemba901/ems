"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState, type FormEvent } from "react";
import type { StandardPayload } from "@/services/five-s.service";
import { AreaSelect, FileUploader, PersonSelect } from "@/components/five-s/ui";

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

  const message = formError ?? error;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {message && <ErrorState description={message} />}
      {mode === "create" && (
        <FormField label="Workplace area" id="std-area">
          <AreaSelect id="std-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </FormField>
      )}
      <FormField label="Title" id="std-title" description="e.g. Tool shadow board – Press Line 1">
        <Input id="std-title" value={v.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </FormField>
      <FormField label="Standard" id="std-instructions" description="The agreed arrangement: locations, labels, quantities, colours, cleaning and inspection points.">
        <Textarea id="std-instructions" rows={8} value={v.instructions} maxLength={10000} onChange={(e) => set({ instructions: e.target.value })} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Standard owner" id="std-owner">
          <PersonSelect id="std-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} />
        </FormField>
        <FormField label="Change note" id="std-note" description="What this revision changes.">
          <Input id="std-note" value={v.changeNote ?? ""} maxLength={500} onChange={(e) => set({ changeNote: e.target.value })} />
        </FormField>
      </div>
      <div className="space-y-1 text-sm font-medium text-foreground">
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
