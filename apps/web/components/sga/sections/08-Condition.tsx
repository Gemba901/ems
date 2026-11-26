"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SgaService, SgaMeasureItemPayload, SgaQcdsmtCategory, SgaUnit, SgaWaste } from "@/services/sga.service";
import { QCDSMT_LABELS, SectionLabel, UNIT_OPTIONS, WASTE_LABELS } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type Row = SgaMeasureItemPayload;

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

const ConditionSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ConditionSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [evidenceSource, setEvidenceSource] = useState(sga.evidenceSource ?? "");
  const [immediateControlNeeded, setImmediateControlNeeded] = useState(sga.immediateControlNeeded ?? false);
  const [rows, setRows] = useState<Row[]>(toRows(sga));
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

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
      return SgaService.updateCondition(
        sga.id,
        {
          evidenceSource: evidenceSource.trim() || undefined,
          immediateControlNeeded,
          measures: rows.map((r) => ({ ...r, whatIsMeasured: r.whatIsMeasured.trim() })),
        },
        token,
      );
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

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="3.2">Current Condition</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Evidence source <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            type="text"
            value={evidenceSource}
            disabled={!editable}
            onChange={(e) => setEvidenceSource(e.target.value)}
            placeholder="e.g. Gemba walk, audit report, production log"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <label className={`flex items-center gap-2.5 text-sm text-foreground ${editable ? "cursor-pointer" : "cursor-default opacity-80"}`}>
          <Input
            type="checkbox"
            checked={immediateControlNeeded}
            disabled={!editable}
            onChange={(e) => setImmediateControlNeeded(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring/20"
          />
          <span className="font-semibold">Immediate control needed?</span>
        </label>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-foreground">Baseline measures</p>
          {rows.length === 0 && !editable && <p className="text-sm text-muted-foreground">No measures recorded.</p>}
          {rows.map((row, index) => (
            <div key={index} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary">Measure {index + 1}</p>
                {editable && (
                  <Button variant="ghost" type="button" onClick={() => removeRow(index)} className="text-muted-foreground hover:text-danger transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">What is measured?</label>
                <Input
                  type="text"
                  value={row.whatIsMeasured}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, { whatIsMeasured: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Baseline</label>
                  <Input
                    type="text"
                    value={row.baselineValue ?? ""}
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { baselineValue: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Target</label>
                  <Input
                    type="text"
                    value={row.targetValue ?? ""}
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { targetValue: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Unit</label>
                  <NativeSelect
                    value={row.unit}
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { unit: e.target.value as SgaUnit })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
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
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { otherUnitLabel: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Linked QCDSMT (optional)</label>
                  <NativeSelect
                    value={row.linkedQcdsmt ?? ""}
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { linkedQcdsmt: (e.target.value || undefined) as SgaQcdsmtCategory | undefined })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <option value="">None</option>
                    {QCDSMT_VALUES.map((c) => (
                      <option key={c} value={c}>
                        {QCDSMT_LABELS[c]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Linked Waste (optional)</label>
                  <NativeSelect
                    value={row.linkedWaste ?? ""}
                    disabled={!editable}
                    onChange={(e) => updateRow(index, { linkedWaste: (e.target.value || undefined) as SgaWaste | undefined })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <option value="">None</option>
                    {WASTE_VALUES.map((w) => (
                      <option key={w} value={w}>
                        {WASTE_LABELS[w]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </div>
          ))}
          {editable && (
            <Button variant="ghost"
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add measure
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ConditionSection;
