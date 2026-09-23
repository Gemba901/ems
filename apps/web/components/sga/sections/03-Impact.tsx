"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  SgaService,
  SgaQcdsmtCategory,
  SgaQcdsmtImpactItemPayload,
  SgaUnit,
  SgaWaste,
  SgaWasteImpactItemPayload,
} from "@/services/sga.service";
import {
  CurrencySelect,
  QCDSMT_CATEGORIES,
  QCDSMT_LABELS,
  SectionLabel,
  UNIT_OPTIONS,
  WASTE_LABELS,
  WASTE_OPTIONS,
} from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type Row = SgaQcdsmtImpactItemPayload;
type WasteRow = SgaWasteImpactItemPayload;

function toRows(sga: SgaSectionProps["sga"]): Row[] {
  return sga.qcdsmtImpacts.map((i) => ({
    category: i.category,
    description: i.description ?? undefined,
    whatIsMeasured: i.whatIsMeasured,
    baselineValue: i.baselineValue ?? undefined,
    targetValue: i.targetValue ?? undefined,
    unit: i.unit,
    otherUnitLabel: i.otherUnitLabel ?? undefined,
    currency: i.currency ?? undefined,
    expectedBenefit: i.expectedBenefit ?? undefined,
  }));
}

function toWasteRows(sga: SgaSectionProps["sga"]): WasteRow[] {
  return sga.wasteImpacts.map((w) => ({
    waste: w.waste,
    description: w.description ?? undefined,
    whatIsMeasured: w.whatIsMeasured,
    baselineValue: w.baselineValue ?? undefined,
    targetValue: w.targetValue ?? undefined,
    unit: w.unit,
    otherUnitLabel: w.otherUnitLabel ?? undefined,
    currency: w.currency ?? undefined,
    expectedBenefit: w.expectedBenefit ?? undefined,
  }));
}

const ImpactSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ImpactSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [rows, setRows] = useState<Row[]>(toRows(sga));
  const [wasteRows, setWasteRows] = useState<WasteRow[]>(toWasteRows(sga));
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const availableCategories = QCDSMT_CATEGORIES.filter((c) => !rows.some((r) => r.category === c.value));
  const availableWastes = WASTE_OPTIONS.filter((w) => !wasteRows.some((r) => r.waste === w.value));

  const addRow = (category: SgaQcdsmtCategory) => {
    setRows((prev) => [...prev, { category, whatIsMeasured: "", unit: "PIECES" }]);
  };

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addWaste = (waste: SgaWaste) => {
    const blank: WasteRow = { waste, whatIsMeasured: "", unit: "PIECES" };
    setWasteRows((prev) => (waste === "NOT_APPLICABLE" ? [blank] : [...prev, blank]));
  };

  const updateWasteRow = (index: number, patch: Partial<WasteRow>) => {
    setWasteRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeWasteRow = (index: number) => {
    setWasteRows((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (rows.length === 0) throw new Error("Add at least one QCDSMT impact.");
      for (const r of rows) {
        if (!r.whatIsMeasured.trim()) throw new Error("Every impact needs a measurement description.");
        if (r.unit === "OTHER" && !r.otherUnitLabel?.trim()) throw new Error("Specify the unit label for 'Other'.");
        if (r.unit === "CURRENCY" && !r.currency) throw new Error("Select a currency for the currency-unit impact.");
      }
      for (const w of wasteRows) {
        if (w.waste === "NOT_APPLICABLE") continue;
        if (!w.whatIsMeasured?.trim()) throw new Error("Every selected waste needs a measurement description.");
        if (w.unit === "OTHER" && !w.otherUnitLabel?.trim()) throw new Error("Specify the unit label for 'Other'.");
        if (w.unit === "CURRENCY" && !w.currency) throw new Error("Select a currency for the currency-unit waste.");
      }
      return SgaService.updateImpact(
        sga.id,
        {
          impacts: rows.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })),
          wasteImpacts: wasteRows.map((w) => ({ ...w, whatIsMeasured: w.whatIsMeasured?.trim() })),
        },
        token,
      );
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

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.3">Expected Impact</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        Record the Quality / Cost / Delivery / Safety / Morale / Technology dimensions this SGA affects, and tag any of the seven wastes it reduces.
      </p>
      <div className="space-y-4">
        {rows.length === 0 && !editable && <p className="text-sm text-slate-400">No QCDSMT impacts recorded.</p>}
        {rows.map((row, index) => (
          <div key={row.category} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-600">{QCDSMT_LABELS[row.category]}</p>
              {editable && (
                <button type="button" onClick={() => removeRow(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">How is this affected now?</label>
              <input
                type="text"
                value={row.description ?? ""}
                disabled={!editable}
                onChange={(e) => updateRow(index, { description: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">What is measured?</label>
              <input
                type="text"
                value={row.whatIsMeasured}
                disabled={!editable}
                onChange={(e) => updateRow(index, { whatIsMeasured: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Baseline</label>
                <input
                  type="text"
                  value={row.baselineValue ?? ""}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { baselineValue: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Target</label>
                <input
                  type="text"
                  value={row.targetValue ?? ""}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { targetValue: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Unit</label>
                <select
                  value={row.unit}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { unit: e.target.value as SgaUnit })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { otherUnitLabel: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            )}
            {row.unit === "CURRENCY" && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Currency</label>
                <CurrencySelect value={row.currency} onChange={(currency) => updateRow(index, { currency })} disabled={!editable} className="w-full" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Expected benefit</label>
              <input
                type="text"
                value={row.expectedBenefit ?? ""}
                disabled={!editable}
                onChange={(e) => updateRow(index, { expectedBenefit: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>
        ))}

        {editable && availableCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => addRow(c.value)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> {c.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Seven wastes <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <div className="space-y-3">
            {wasteRows.length === 0 && !editable && <p className="text-sm text-slate-400">No wastes recorded.</p>}
            {wasteRows.map((row, index) => (
              <div key={row.waste} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-600">{WASTE_LABELS[row.waste]}</p>
                  {editable && (
                    <button type="button" onClick={() => removeWasteRow(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {row.waste !== "NOT_APPLICABLE" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">How is this affected now?</label>
                      <input
                        type="text"
                        value={row.description ?? ""}
                        disabled={!editable}
                        onChange={(e) => updateWasteRow(index, { description: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">What is measured?</label>
                      <input
                        type="text"
                        value={row.whatIsMeasured ?? ""}
                        disabled={!editable}
                        onChange={(e) => updateWasteRow(index, { whatIsMeasured: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Baseline</label>
                        <input
                          type="text"
                          value={row.baselineValue ?? ""}
                          disabled={!editable}
                          onChange={(e) => updateWasteRow(index, { baselineValue: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Target</label>
                        <input
                          type="text"
                          value={row.targetValue ?? ""}
                          disabled={!editable}
                          onChange={(e) => updateWasteRow(index, { targetValue: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Unit</label>
                        <select
                          value={row.unit}
                          disabled={!editable}
                          onChange={(e) => updateWasteRow(index, { unit: e.target.value as SgaUnit })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                          disabled={!editable}
                          onChange={(e) => updateWasteRow(index, { otherUnitLabel: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                    )}
                    {row.unit === "CURRENCY" && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Currency</label>
                        <CurrencySelect value={row.currency} onChange={(currency) => updateWasteRow(index, { currency })} disabled={!editable} className="w-full" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Expected benefit</label>
                      <input
                        type="text"
                        value={row.expectedBenefit ?? ""}
                        disabled={!editable}
                        onChange={(e) => updateWasteRow(index, { expectedBenefit: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}

            {editable && availableWastes.length > 0 && wasteRows[0]?.waste !== "NOT_APPLICABLE" && (
              <div className="flex flex-wrap gap-1.5">
                {availableWastes.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => addWaste(w.value)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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

export default ImpactSection;
