"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService } from "@/services/sga.service";
import { CurrencySelect, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const ResourcesSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ResourcesSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [requiredResources, setRequiredResources] = useState(sga.requiredResources ?? "");
  const [expectedBenefitSummary, setExpectedBenefitSummary] = useState(sga.expectedBenefitSummary ?? "");
  const [approximateInvestmentAmount, setApproximateInvestmentAmount] = useState(sga.approximateInvestmentAmount ?? "");
  const [approximateInvestmentCurrency, setApproximateInvestmentCurrency] = useState(sga.approximateInvestmentCurrency ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (approximateInvestmentAmount && !approximateInvestmentCurrency) {
        throw new Error("Select a currency for the approximate investment amount.");
      }
      return SgaService.updateResources(
        sga.id,
        {
          requiredResources: requiredResources.trim() || undefined,
          expectedBenefitSummary: expectedBenefitSummary.trim() || undefined,
          approximateInvestmentAmount: approximateInvestmentAmount ? Number(approximateInvestmentAmount) : undefined,
          approximateInvestmentCurrency: approximateInvestmentAmount ? approximateInvestmentCurrency : undefined,
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
        <SectionLabel n="2.6">Resources &amp; Investment</SectionLabel>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Required Resources</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.requiredResources || "Not set."}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Expected Benefit Summary</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.expectedBenefitSummary || "Not set."}</p>
          </div>
          {sga.approximateInvestmentAmount && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Approximate Investment</p>
              <p className="text-sm text-slate-700">
                {sga.approximateInvestmentCurrency} {sga.approximateInvestmentAmount}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.6">Resources &amp; Investment</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Required resources <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={requiredResources}
            onChange={(e) => setRequiredResources(e.target.value)}
            placeholder="What resources, tools, or budget are needed?"
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Expected benefit summary <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={expectedBenefitSummary}
            onChange={(e) => setExpectedBenefitSummary(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Approximate investment <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <div className="flex gap-2 min-w-0">
            <input
              type="number"
              min="0"
              step="0.01"
              value={approximateInvestmentAmount}
              onChange={(e) => setApproximateInvestmentAmount(e.target.value)}
              className="flex-1 min-w-0 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            <CurrencySelect value={approximateInvestmentCurrency} onChange={setApproximateInvestmentCurrency} className="w-32 shrink-0" />
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

export default ResourcesSection;
