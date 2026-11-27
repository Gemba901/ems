"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useState, type FormEvent } from "react";
import { RED_TAG_REASONS, RED_TAG_REASON_LABELS, type CreateRedTagPayload, type RedTagReason } from "@/services/five-s.service";
import { AreaSelect, FileUploader, PersonSelect } from "@/components/five-s/ui";

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
    if (!v.raisedOn) return setFormError("Enter the date the tag was raised.");
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

  const message = formError ?? error;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {message && <ErrorState description={message} />}
      {mode === "create" && (
        <FormField label="Workplace area" id="tag-area" required>
          <AreaSelect id="tag-area" value={v.areaId} onChange={(id) => set({ areaId: id ?? "" })} />
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Item" id="tag-item" required description="What the item is, including any asset or part number on it.">
          <Input id="tag-item" value={v.itemName} maxLength={200} onChange={(e) => set({ itemName: e.target.value })} />
        </FormField>
        <FormField label="Quantity" id="tag-qty" description="Optional, e.g. 3 boxes, 1 pallet.">
          <Input id="tag-qty" value={v.quantity ?? ""} maxLength={60} onChange={(e) => set({ quantity: e.target.value })} />
        </FormField>
      </div>
      <FormField label="Location" id="tag-location" required>
        <Input id="tag-location" value={v.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Reason" id="tag-reason">
          <NativeSelect id="tag-reason" className="w-full" value={v.reason} onChange={(e) => set({ reason: e.target.value as RedTagReason })}>
            {RED_TAG_REASONS.map((r) => (
              <option key={r} value={r}>
                {RED_TAG_REASON_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Tag owner" id="tag-owner" description={canSetOwner ? "Follows the tag to a decision. Defaults to the area owner." : "Set by the area owner or a reviewer."}>
          <PersonSelect id="tag-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} disabled={!canSetOwner} emptyLabel="Area owner" />
        </FormField>
      </div>
      <FormField label="Reason details" id="tag-details">
        <Textarea id="tag-details" rows={2} value={v.reasonDetails ?? ""} maxLength={2000} onChange={(e) => set({ reasonDetails: e.target.value })} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" && (
          <FormField label="Date raised" id="tag-raised" required>
            <Input id="tag-raised" type="date" value={v.raisedOn} max={maxDate} onChange={(e) => set({ raisedOn: e.target.value })} />
          </FormField>
        )}
        <FormField label="Review by" id="tag-review" description="Optional. When a decision should be made.">
          <Input id="tag-review" type="date" value={v.reviewDueDate ?? ""} min={v.raisedOn} onChange={(e) => set({ reviewDueDate: e.target.value })} />
        </FormField>
      </div>
      <div className="space-y-1 text-sm font-medium text-foreground">
        Photos
        <FileUploader urls={v.photoUrls ?? []} folder="five-s/red-tags" onChange={(urls) => set({ photoUrls: urls })} />
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
