"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { KaizenService, KaizenWaste, KaizenWasteImpactItemPayload, KaizenUnit } from "@/services/kaizen.service";
import { CurrencySelect, SectionLabel, UNIT_LABELS, UNIT_OPTIONS, WASTE_LABELS, WASTE_OPTIONS } from "@/components/kaizen/kaizen-ui";
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
      if (rows.length === 0) throw new Error("Add at least one waste, or 'Not applicable'.");
      for (const r of rows) {
        if (r.waste === "NOT_APPLICABLE") continue;
        if (!r.whatIsMeasured.trim()) throw new Error("Every waste row needs a measurement description.");
        if (r.unit === "OTHER" && !r.otherUnitLabel?.trim()) throw new Error("Specify the unit label for 'Other'.");
        if (r.unit === "CURRENCY" && !r.currency) throw new Error("Select a currency for the currency-unit row.");
      }
      return KaizenService.updateWaste(kaizen.id, { impacts: rows.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })) }, token);
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
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
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n={6}>Waste Reduced</SectionLabel>
        {kaizen.wasteImpacts.length === 0 ? (
          <p className="text-sm text-slate-400">Not set.</p>
        ) : (
          <div className="space-y-3">
            {kaizen.wasteImpacts.map((i) => (
              <div key={i.id} className="border border-slate-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">{WASTE_LABELS[i.waste]}</p>
                {i.waste !== "NOT_APPLICABLE" && (
                  <>
                    <p className="text-sm text-slate-700">{i.whatIsMeasured}</p>
                    <p className="text-xs text-slate-500 mt-1">
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
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={6}>Waste Reduced</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        Which of the 7 wastes does this kaizen reduce? Record a before/after measurement for each.
      </p>
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.waste} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-600">{WASTE_LABELS[row.waste]}</p>
              <button type="button" onClick={() => removeRow(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {row.waste !== "NOT_APPLICABLE" && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">What is measured?</label>
                  <input
                    type="text"
                    value={row.whatIsMeasured}
                    onChange={(e) => updateRow(index, { whatIsMeasured: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Before</label>
                    <input
                      type="text"
                      value={row.beforeValue ?? ""}
                      onChange={(e) => updateRow(index, { beforeValue: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">After</label>
                    <input
                      type="text"
                      value={row.afterValue ?? ""}
                      onChange={(e) => updateRow(index, { afterValue: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Unit</label>
                    <select
                      value={row.unit}
                      onChange={(e) => updateRow(index, { unit: e.target.value as KaizenUnit })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {row.unit === "OTHER" && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Unit label</label>
                    <input
                      type="text"
                      value={row.otherUnitLabel ?? ""}
                      onChange={(e) => updateRow(index, { otherUnitLabel: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                )}
                {row.unit === "CURRENCY" && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Currency</label>
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
              <button
                key={w.value}
                type="button"
                onClick={() => addRow(w.value)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> {w.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default WasteSection;
