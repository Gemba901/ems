"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SgaQcdsmtCategory, SgaService, SgaUnit, SgaWaste, UpdateSgaResultMeasureItemPayload } from "@/services/sga.service";
import { QCDSMT_LABELS, SectionLabel, UNIT_LABELS, UNIT_OPTIONS, WASTE_LABELS } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type Row = UpdateSgaResultMeasureItemPayload;

function toRows(sga: SgaSectionProps["sga"]): Row[] {
  return sga.measures.map((m) => ({
    id: m.id,
    whatIsMeasured: m.whatIsMeasured,
    baselineValue: m.baselineValue ?? undefined,
    targetValue: m.targetValue ?? undefined,
    finalResultValue: m.finalResultValue ?? undefined,
    unit: m.unit,
    otherUnitLabel: m.otherUnitLabel ?? undefined,
    linkedQcdsmt: m.linkedQcdsmt ?? undefined,
    linkedWaste: m.linkedWaste ?? undefined,
  }));
}

const QCDSMT_VALUES: SgaQcdsmtCategory[] = ["QUALITY", "COST", "DELIVERY", "SAFETY", "MORALE", "TECHNOLOGY"];
const WASTE_VALUES: SgaWaste[] = ["TRANSPORTATION", "INVENTORY", "MOTION", "WAITING", "OVERPRODUCTION", "OVERPROCESSING", "DEFECTS", "NOT_APPLICABLE"];

const ResultsSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ResultsSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [rows, setRows] = useState<Row[]>(toRows(sga));
  const [error, setError] = useState<string | null>(null);

  const addRow = () => {
    setRows((prev) => [...prev, { whatIsMeasured: "", unit: "PIECES" }]);
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
        if (!r.whatIsMeasured.trim()) throw new Error("Every measure needs a description.");
        if (r.unit === "OTHER" && !r.otherUnitLabel?.trim()) throw new Error("Specify the unit label for 'Other'.");
      }
      return SgaService.updateResults(
        sga.id,
        { measures: rows.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })) },
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

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="5.12">Check the Results</SectionLabel>
        {sga.measures.length === 0 ? (
          <p className="text-sm text-slate-400">No measures recorded.</p>
        ) : (
          <div className="space-y-3">
            {sga.measures.map((m) => (
              <div key={m.id} className="border border-slate-100 rounded-lg p-3">
                <p className="text-sm text-slate-700">{m.whatIsMeasured}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Baseline {m.baselineValue ?? "-"} → Target {m.targetValue ?? "-"} → Result{" "}
                  <span className="font-semibold text-blue-600">{m.finalResultValue ?? "-"}</span>{" "}
                  {m.unit === "OTHER" ? m.otherUnitLabel : UNIT_LABELS[m.unit]}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="5.12">Check the Results</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">Record the final result against each baseline/target measure.</p>
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-600">Measure {index + 1}</p>
              <button type="button" onClick={() => removeRow(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">What is measured?</label>
              <input
                type="text"
                value={row.whatIsMeasured}
                onChange={(e) => updateRow(index, { whatIsMeasured: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Baseline</label>
                <input
                  type="text"
                  value={row.baselineValue ?? ""}
                  onChange={(e) => updateRow(index, { baselineValue: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Target</label>
                <input
                  type="text"
                  value={row.targetValue ?? ""}
                  onChange={(e) => updateRow(index, { targetValue: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-blue-600 block mb-1">Final result</label>
                <input
                  type="text"
                  value={row.finalResultValue ?? ""}
                  onChange={(e) => updateRow(index, { finalResultValue: e.target.value })}
                  className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Unit</label>
                <select
                  value={row.unit}
                  onChange={(e) => updateRow(index, { unit: e.target.value as SgaUnit })}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Linked QCDSMT (optional)</label>
                <select
                  value={row.linkedQcdsmt ?? ""}
                  onChange={(e) => updateRow(index, { linkedQcdsmt: (e.target.value || undefined) as SgaQcdsmtCategory | undefined })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="">None</option>
                  {QCDSMT_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {QCDSMT_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Linked Waste (optional)</label>
                <select
                  value={row.linkedWaste ?? ""}
                  onChange={(e) => updateRow(index, { linkedWaste: (e.target.value || undefined) as SgaWaste | undefined })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="">None</option>
                  {WASTE_VALUES.map((w) => (
                    <option key={w} value={w}>
                      {WASTE_LABELS[w]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add measure
        </button>

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

export default ResultsSection;
