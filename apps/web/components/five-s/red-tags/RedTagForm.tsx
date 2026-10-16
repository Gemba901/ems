"use client";

import { useState, type FormEvent } from "react";
import { RED_TAG_REASONS, RED_TAG_REASON_LABELS, type CreateRedTagPayload, type RedTagReason } from "@/services/five-s.service";
import { AreaSelect, ErrorNote, Field, FileUploader, PersonSelect, inputClass, primaryButton, secondaryButton, selectClass } from "@/components/five-s/ui";

export function RedTagForm({
  initial,
  mode,
  maxDate,
  canSetOwner = true,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<CreateRedTagPayload>;
  mode: "create" | "edit";
  maxDate: string;
  canSetOwner?: boolean;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: CreateRedTagPayload) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<CreateRedTagPayload>({
    areaId: initial?.areaId ?? "",
    itemName: initial?.itemName ?? "",
    location: initial?.location ?? "",
    quantity: initial?.quantity ?? "",
    reason: initial?.reason ?? "UNNECESSARY",
    reasonDetails: initial?.reasonDetails ?? "",
    ownerId: initial?.ownerId ?? null,
    raisedOn: initial?.raisedOn ?? maxDate,
    reviewDueDate: initial?.reviewDueDate ?? "",
    photoUrls: initial?.photoUrls ?? [],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<CreateRedTagPayload>) => setV((x) => ({ ...x, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.areaId) return setFormError("Choose the area where the item was found.");
    if (!v.itemName.trim()) return setFormError("Describe the item.");
    if (!v.location.trim()) return setFormError("Say where the item is.");
    if (v.raisedOn > maxDate) return setFormError("The date raised cannot be in the future.");
    if (v.reviewDueDate && v.reviewDueDate < v.raisedOn) return setFormError("The review date cannot be before the date raised.");
    setFormError(null);
    onSubmit({
      ...v,
      itemName: v.itemName.trim(),
      location: v.location.trim(),
      quantity: v.quantity?.trim() || null,
      reasonDetails: v.reasonDetails?.trim() || null,
      reviewDueDate: v.reviewDueDate || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {(formError || error) && <ErrorNote>{formError ?? error}</ErrorNote>}
      {mode === "create" && (
        <Field label="Workplace area" htmlFor="tag-area">
          <AreaSelect id="tag-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item" htmlFor="tag-item" hint="What the item is, including any asset or part number on it.">
          <input id="tag-item" className={inputClass} value={v.itemName} maxLength={200} onChange={(e) => set({ itemName: e.target.value })} />
        </Field>
        <Field label="Quantity" htmlFor="tag-qty" hint="Optional, e.g. 3 boxes, 1 pallet.">
          <input id="tag-qty" className={inputClass} value={v.quantity ?? ""} maxLength={60} onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
      </div>
      <Field label="Location" htmlFor="tag-location">
        <input id="tag-location" className={inputClass} value={v.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reason" htmlFor="tag-reason">
          <select id="tag-reason" className={selectClass} value={v.reason} onChange={(e) => set({ reason: e.target.value as RedTagReason })}>
            {RED_TAG_REASONS.map((r) => (
              <option key={r} value={r}>
                {RED_TAG_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tag owner" htmlFor="tag-owner" hint={canSetOwner ? "Follows the tag to a decision. Defaults to the area owner." : "Set by the area owner or a reviewer."}>
          <PersonSelect id="tag-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} disabled={!canSetOwner} emptyLabel="Area owner" />
        </Field>
      </div>
      <Field label="Reason details" htmlFor="tag-details">
        <textarea id="tag-details" rows={2} className={inputClass} value={v.reasonDetails ?? ""} maxLength={2000} onChange={(e) => set({ reasonDetails: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" && (
          <Field label="Date raised" htmlFor="tag-raised">
            <input id="tag-raised" type="date" className={inputClass} value={v.raisedOn} max={maxDate} onChange={(e) => set({ raisedOn: e.target.value })} />
          </Field>
        )}
        <Field label="Review by" htmlFor="tag-review" hint="Optional. When a decision should be made.">
          <input id="tag-review" type="date" className={inputClass} value={v.reviewDueDate ?? ""} min={v.raisedOn} onChange={(e) => set({ reviewDueDate: e.target.value })} />
        </Field>
      </div>
      <div className="space-y-1 text-sm font-medium text-slate-700">
        Photos
        <FileUploader urls={v.photoUrls ?? []} folder="five-s/red-tags" onChange={(urls) => set({ photoUrls: urls })} />
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
