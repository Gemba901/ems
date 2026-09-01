"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { CurrencySelect, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const ImplementationPlanSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ImplementationPlanSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [requiredMaterials, setRequiredMaterials] = useState(kaizen.requiredMaterials ?? "");
  const [estimatedCost, setEstimatedCost] = useState(kaizen.estimatedCost ?? "");
  const [estimatedCostCurrency, setEstimatedCostCurrency] = useState(kaizen.estimatedCostCurrency ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!requiredMaterials.trim()) throw new Error("Describe the materials required.");
      if (estimatedCost && !estimatedCostCurrency) throw new Error("Select a currency for the estimated cost.");
      return KaizenService.updateImplementationPlan(
        kaizen.id,
        {
          requiredMaterials: requiredMaterials.trim(),
          estimatedCost: estimatedCost ? String(estimatedCost) : undefined,
          estimatedCostCurrency: estimatedCost ? estimatedCostCurrency : undefined,
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

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.7">Required Materials &amp; Estimated Cost</SectionLabel>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{kaizen.requiredMaterials || "Not set."}</p>
        {kaizen.estimatedCost && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Estimated Cost</p>
            <p className="text-sm text-slate-700">
              {kaizen.estimatedCostCurrency} {kaizen.estimatedCost}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.7">Required Materials &amp; Estimated Cost</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Required materials <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={requiredMaterials}
            onChange={(e) => setRequiredMaterials(e.target.value)}
            placeholder="What materials, tools, or resources are needed to implement this kaizen?"
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Estimated cost <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <div className="flex gap-2 min-w-0">
            <input
              type="number"
              min="0"
              step="0.01"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              className="flex-1 min-w-0 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            <CurrencySelect value={estimatedCostCurrency} onChange={setEstimatedCostCurrency} className="w-32 shrink-0" />
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

export default ImplementationPlanSection;
