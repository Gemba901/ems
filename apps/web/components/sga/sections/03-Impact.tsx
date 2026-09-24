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
  HelpText,
  QCDSMT_CATEGORIES,
  QCDSMT_HINTS,
  QCDSMT_LABELS,
  REASON_DEFAULT_QCDSMT,
  SectionLabel,
  UNIT_OPTIONS,
  WASTE_LABELS,
  WASTE_OPTIONS,
  getPreferredCurrency,
} from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type Row = SgaQcdsmtImpactItemPayload;
type WasteRow = SgaWasteImpactItemPayload;

// Fields shared by QCDSMT and waste rows, edited by the same <MeasureFields> block.
type MeasureRow = Pick<
  Row,
  "description" | "baselineValue" | "targetValue" | "otherUnitLabel" | "currency" | "expectedBenefit"
> & { whatIsMeasured?: string; unit?: SgaUnit };

const INPUT_CLASS =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-500";

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

// A row the raiser added (or we pre-added) but never typed into — dropped on save
// rather than blocking a draft save.
function isBlank(r: MeasureRow) {
  return ![r.description, r.whatIsMeasured, r.baselineValue, r.targetValue, r.expectedBenefit].some((v) => v?.trim());
}

function checkRow(r: MeasureRow, name: string) {
  if (!r.whatIsMeasured?.trim()) throw new Error(`${name}: say what you will measure.`);
  if (r.unit === "OTHER" && !r.otherUnitLabel?.trim()) throw new Error(`${name}: type the unit name for "Other".`);
  if (r.unit === "CURRENCY" && !r.currency) throw new Error(`${name}: pick a currency.`);
}

function MeasureFields({
  row,
  editable,
  onChange,
}: {
  row: MeasureRow;
  editable: boolean;
  onChange: (patch: Partial<MeasureRow>) => void;
}) {
  const hasDetails = !!(row.description || row.expectedBenefit);
  return (
    <>
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">What will you measure?</label>
        <input
          type="text"
          value={row.whatIsMeasured ?? ""}
          disabled={!editable}
          placeholder="e.g. Rejected bottles per shift"
          onChange={(e) => onChange({ whatIsMeasured: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Now</label>
            <input
              type="text"
              inputMode="decimal"
              value={row.baselineValue ?? ""}
              disabled={!editable}
              placeholder="e.g. 40"
              onChange={(e) => onChange({ baselineValue: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Goal</label>
            <input
              type="text"
              inputMode="decimal"
              value={row.targetValue ?? ""}
              disabled={!editable}
              placeholder="e.g. 10"
              onChange={(e) => onChange({ targetValue: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Unit</label>
          <select
            value={row.unit ?? "PIECES"}
            disabled={!editable}
            onChange={(e) => {
              const unit = e.target.value as SgaUnit;
              onChange(unit === "CURRENCY" && !row.currency ? { unit, currency: getPreferredCurrency() } : { unit });
            }}
            className={INPUT_CLASS}
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
          <label className="text-xs font-medium text-slate-500 block mb-1">Unit name</label>
          <input
            type="text"
            value={row.otherUnitLabel ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ otherUnitLabel: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
      )}
      {row.unit === "CURRENCY" && (
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Currency</label>
          <CurrencySelect value={row.currency} onChange={(currency) => onChange({ currency })} disabled={!editable} className="w-full" />
        </div>
      )}
      <details open={hasDetails} className="group">
        <summary className="text-xs font-medium text-indigo-600 cursor-pointer select-none">More details (optional)</summary>
        <div className="space-y-3 pt-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">How is it today?</label>
            <input
              type="text"
              value={row.description ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ description: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Expected benefit</label>
            <input
              type="text"
              value={row.expectedBenefit ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ expectedBenefit: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </details>
    </>
  );
}

const ImpactSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ImpactSection(
  { sga, access, token, onSaved },
  ref,
) {
  const editable = access.editable;
  const [rows, setRows] = useState<Row[]>(() => {
    const saved = toRows(sga);
    // Start the raiser off with the dimension their reason most obviously affects.
    const suggested = sga.startingReason ? REASON_DEFAULT_QCDSMT[sga.startingReason] : undefined;
    if (saved.length === 0 && editable && suggested) {
      return [{ category: suggested, whatIsMeasured: "", unit: "PIECES" }];
    }
    return saved;
  });
  const [wasteRows, setWasteRows] = useState<WasteRow[]>(toWasteRows(sga));
  const [error, setError] = useState<string | null>(null);

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
      // "At least one impact" is checked on submit, not here, so a partial draft can be saved.
      const impacts = rows.filter((r) => !isBlank(r));
      const wastes = wasteRows.filter((w) => w.waste === "NOT_APPLICABLE" || !isBlank(w));
      impacts.forEach((r) => checkRow(r, QCDSMT_LABELS[r.category]));
      wastes.filter((w) => w.waste !== "NOT_APPLICABLE").forEach((w) => checkRow(w, WASTE_LABELS[w.waste]));
      return SgaService.updateImpact(
        sga.id,
        {
          impacts: impacts.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })),
          wasteImpacts: wastes.map((w) => ({ ...w, whatIsMeasured: w.whatIsMeasured?.trim() })),
        },
        token,
      );
    },
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
    },
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
      <SectionLabel n="1.3">What will improve?</SectionLabel>
      <HelpText>
        Pick at least one area this SGA will improve, and how you will know: what you will measure, where it is now and
        your goal.
      </HelpText>
      <div className="space-y-4 mt-3">
        {rows.length === 0 && !editable && <p className="text-sm text-slate-400">No improvements recorded.</p>}
        {rows.map((row, index) => (
          <div key={row.category} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-indigo-600">
                {QCDSMT_LABELS[row.category]}{" "}
                <span className="font-normal text-slate-400">· {QCDSMT_HINTS[row.category]}</span>
              </p>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove ${QCDSMT_LABELS[row.category]}`}
                  onClick={() => removeRow(index)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <MeasureFields row={row} editable={editable} onChange={(patch) => updateRow(index, patch)} />
          </div>
        ))}

        {editable && availableCategories.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">{rows.length ? "Add another area:" : "Add an area:"}</p>
            <div className="flex flex-wrap gap-1.5">
              {availableCategories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => addRow(c.value)}
                  title={QCDSMT_HINTS[c.value]}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-left"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {c.label} <span className="font-normal text-slate-400">({QCDSMT_HINTS[c.value]})</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <details open={wasteRows.length > 0} className="border-t border-slate-100 pt-4">
          <summary className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
            Does it reduce waste? <span className="text-xs font-normal text-slate-400">(optional)</span>
          </summary>
          <div className="space-y-3 pt-3">
            <HelpText>The seven wastes of lean: waiting, over-production, defects, excess motion, and so on.</HelpText>
            {wasteRows.length === 0 && !editable && <p className="text-sm text-slate-400">No wastes recorded.</p>}
            {wasteRows.map((row, index) => (
              <div key={row.waste} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-indigo-600">{WASTE_LABELS[row.waste]}</p>
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Remove ${WASTE_LABELS[row.waste]}`}
                      onClick={() => removeWasteRow(index)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {row.waste !== "NOT_APPLICABLE" && (
                  <MeasureFields row={row} editable={editable} onChange={(patch) => updateWasteRow(index, patch)} />
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </details>

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
