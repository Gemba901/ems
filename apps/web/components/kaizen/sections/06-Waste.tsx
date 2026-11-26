"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { KaizenService, KaizenWaste, KaizenWasteImpactItemPayload, KaizenUnit } from "@/services/kaizen.service";
import { CurrencySelect, SectionLabel, UNIT_LABELS, UNIT_OPTIONS, WASTE_HINTS, WASTE_LABELS, WASTE_OPTIONS } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

type Row = KaizenWasteImpactItemPayload;

function toRows(kaizen: KaizenSectionProps["kaizen"]): Row[] {
  return kaizen.wasteImpacts.map((i) => ({
    waste: i.waste,
    whatIsMeasured: i.whatIsMeasured,
    beforeValue: i.beforeValue ?? undefined,
    afterValue: i.afterValue ?? undefined,
    unit: i.unit,
    otherUnitLabel: i.otherUnitLabel ?? undefined,
    currency: i.currency ?? undefined,
  }));
}

const WasteSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function WasteSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [rows, setRows] = useState<Row[]>(toRows(kaizen));
  const [error, setError] = useState<string | null>(null);

  const hasNotApplicable = rows.some((r) => r.waste === "NOT_APPLICABLE");
  const availableWastes = WASTE_OPTIONS.filter((w) => {
    if (hasNotApplicable) return false;
    if (w.value === "NOT_APPLICABLE") return rows.length === 0;
    return !rows.some((r) => r.waste === w.value);
  });

  const addRow = (waste: KaizenWaste) => {
    if (waste === "NOT_APPLICABLE") {
      setRows([{ waste: "NOT_APPLICABLE", whatIsMeasured: "Not applicable", unit: "PIECES" }]);
      return;
    }
    setRows((prev) => [...prev, { waste, whatIsMeasured: "", unit: "PIECES" }]);
  };

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      for (const r of rows) {
        if (r.waste === "NOT_APPLICABLE") continue;
        if (!r.whatIsMeasured.trim()) throw new Error(`Say what you will measure for ${WASTE_LABELS[r.waste]}.`);
        if (r.unit === "OTHER" && !r.otherUnitLabel?.trim()) throw new Error("Specify the unit label for 'Other'.");
        if (r.unit === "CURRENCY" && !r.currency) throw new Error("Select a currency for the currency-unit row.");
      }
      return KaizenService.updateWaste(kaizen.id, { impacts: rows.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })) }, token);
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  if (!access.editable) {
    return (
      <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.6">Waste Reduced</SectionLabel>
        {kaizen.wasteImpacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not set.</p>
        ) : (
          <div className="space-y-3">
            {kaizen.wasteImpacts.map((i) => (
              <div key={i.id} className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-1">{WASTE_LABELS[i.waste]}</p>
                {i.waste !== "NOT_APPLICABLE" && (
                  <>
                    <p className="text-sm text-foreground">{i.whatIsMeasured}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {i.beforeValue ?? "-"} → {i.afterValue ?? "-"}{" "}
                      {i.unit === "OTHER" ? i.otherUnitLabel : i.unit === "CURRENCY" ? i.currency ?? UNIT_LABELS[i.unit] : UNIT_LABELS[i.unit]}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <details open={rows.length > 0} className="group bg-background border border-border rounded-xl p-6 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
        <span>
          Does it cut any waste? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <p className="text-xs text-muted-foreground mt-3 mb-4">
        Waste is effort that adds no value, like walking, waiting or rework. Add any this kaizen reduces.
      </p>
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.waste} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary">
                {WASTE_LABELS[row.waste]}
                {WASTE_HINTS[row.waste] && <span className="font-normal text-muted-foreground"> · {WASTE_HINTS[row.waste]}</span>}
              </p>
              <Button variant="ghost" type="button" onClick={() => removeRow(index)} className="text-muted-foreground hover:text-danger transition-colors">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {row.waste !== "NOT_APPLICABLE" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">What is measured?</label>
                  <Input
                    type="text"
                    value={row.whatIsMeasured}
                    onChange={(e) => updateRow(index, { whatIsMeasured: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Now</label>
                    <Input
                      type="text"
                      value={row.beforeValue ?? ""}
                      onChange={(e) => updateRow(index, { beforeValue: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Goal</label>
                    <Input
                      type="text"
                      value={row.afterValue ?? ""}
                      onChange={(e) => updateRow(index, { afterValue: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Unit</label>
                    <NativeSelect
                      value={row.unit}
                      onChange={(e) => updateRow(index, { unit: e.target.value as KaizenUnit })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                {row.unit === "OTHER" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Unit label</label>
                    <Input
                      type="text"
                      value={row.otherUnitLabel ?? ""}
                      onChange={(e) => updateRow(index, { otherUnitLabel: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                )}
                {row.unit === "CURRENCY" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Currency</label>
                    <CurrencySelect value={row.currency} onChange={(currency) => updateRow(index, { currency })} className="w-full" />
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {availableWastes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableWastes.map((w) => (
              <Button variant="ghost"
                key={w.value}
                type="button"
                onClick={() => addRow(w.value)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> {w.label}
              </Button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </details>
  );
});

export default WasteSection;
