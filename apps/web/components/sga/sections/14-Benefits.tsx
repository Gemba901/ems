"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SgaBenefitPeriod, SgaQcdsmtBenefitItemPayload, SgaQcdsmtCategory, SgaService } from "@/services/sga.service";
import { BENEFIT_PERIOD_LABELS, BENEFIT_PERIOD_OPTIONS, QCDSMT_CATEGORIES, QCDSMT_LABELS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

type BenefitRow = SgaQcdsmtBenefitItemPayload;

const BenefitsSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function BenefitsSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [qcdsmtBenefits, setQcdsmtBenefits] = useState<BenefitRow[]>(
    sga.qcdsmtBenefits.map((b) => ({ category: b.category, whatWasAchieved: b.whatWasAchieved })),
  );
  const [wasteReductionAchieved, setWasteReductionAchieved] = useState(sga.wasteReductionAchieved ?? "");
  const [financialLossBeforeImprovement, setFinancialLossBeforeImprovement] = useState(sga.financialLossBeforeImprovement ?? "");
  const [verifiedGrossBenefit, setVerifiedGrossBenefit] = useState(sga.verifiedGrossBenefit ?? "");
  const [benefitPeriod, setBenefitPeriod] = useState<SgaBenefitPeriod | "">(sga.benefitPeriod ?? "");
  const [effectivenessConfirmationPeriod, setEffectivenessConfirmationPeriod] = useState(sga.effectivenessConfirmationPeriod ?? "");
  const [sopUpdated, setSopUpdated] = useState(sga.sopUpdated ?? false);
  const [employeesTrained, setEmployeesTrained] = useState(sga.employeesTrained ?? false);
  const [followUpCheckPlanned, setFollowUpCheckPlanned] = useState(sga.followUpCheckPlanned ?? false);
  const [appliedElsewhere, setAppliedElsewhere] = useState(sga.appliedElsewhere ?? false);
  const [lessonsLearned, setLessonsLearned] = useState(sga.lessonsLearned ?? "");
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const availableCategories = QCDSMT_CATEGORIES.filter((c) => !qcdsmtBenefits.some((b) => b.category === c.value));

  const addBenefit = (category: SgaQcdsmtCategory) => {
    setQcdsmtBenefits((prev) => [...prev, { category, whatWasAchieved: "" }]);
  };

  const updateBenefit = (index: number, whatWasAchieved: string) => {
    setQcdsmtBenefits((prev) => prev.map((b, i) => (i === index ? { ...b, whatWasAchieved } : b)));
  };

  const removeBenefit = (index: number) => {
    setQcdsmtBenefits((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      for (const b of qcdsmtBenefits) {
        if (!b.whatWasAchieved.trim()) throw new Error("Every QCDSMT benefit needs a description of what was achieved.");
      }
      return SgaService.updateBenefits(
        sga.id,
        {
          qcdsmtBenefits: qcdsmtBenefits.map((b) => ({ ...b, whatWasAchieved: b.whatWasAchieved.trim() })),
          wasteReductionAchieved: wasteReductionAchieved.trim() || undefined,
          financialLossBeforeImprovement: financialLossBeforeImprovement ? Number(financialLossBeforeImprovement) : undefined,
          verifiedGrossBenefit: verifiedGrossBenefit ? Number(verifiedGrossBenefit) : undefined,
          benefitPeriod: benefitPeriod || undefined,
          effectivenessConfirmationPeriod: effectivenessConfirmationPeriod.trim() || undefined,
          sopUpdated,
          employeesTrained,
          followUpCheckPlanned,
          appliedElsewhere,
          lessonsLearned: lessonsLearned.trim() || undefined,
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
      <SectionLabel n="5.2">Benefits &amp; Sustainability</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            QCDSMT benefit achieved <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <div className="space-y-3">
            {qcdsmtBenefits.length === 0 && !editable && <p className="text-sm text-slate-400">No QCDSMT benefits recorded.</p>}
            {qcdsmtBenefits.map((row, index) => (
              <div key={row.category} className="border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-600">{QCDSMT_LABELS[row.category]}</p>
                  {editable && (
                    <button type="button" onClick={() => removeBenefit(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">What was achieved?</label>
                  <input
                    type="text"
                    value={row.whatWasAchieved}
                    disabled={!editable}
                    onChange={(e) => updateBenefit(index, e.target.value)}
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
                    onClick={() => addBenefit(c.value)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Waste reduction achieved <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={wasteReductionAchieved}
              disabled={!editable}
              onChange={(e) => setWasteReductionAchieved(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Financial loss before improvement <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={financialLossBeforeImprovement}
              disabled={!editable}
              onChange={(e) => setFinancialLossBeforeImprovement(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Verified gross benefit <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={verifiedGrossBenefit}
              disabled={!editable}
              onChange={(e) => setVerifiedGrossBenefit(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Benefit period <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <select
              value={benefitPeriod}
              disabled={!editable}
              onChange={(e) => setBenefitPeriod(e.target.value as SgaBenefitPeriod)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Select...</option>
              {BENEFIT_PERIOD_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Effectiveness confirmation period <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={effectivenessConfirmationPeriod}
              disabled={!editable}
              onChange={(e) => setEffectivenessConfirmationPeriod(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["SOP updated", sopUpdated, setSopUpdated],
            ["Employees trained", employeesTrained, setEmployeesTrained],
            ["Follow-up check planned", followUpCheckPlanned, setFollowUpCheckPlanned],
            ["Applied elsewhere", appliedElsewhere, setAppliedElsewhere],
          ].map(([label, value, setter]) => (
            <label
              key={label as string}
              className={`flex items-center gap-2 text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 ${
                editable ? "cursor-pointer" : "cursor-default opacity-80"
              }`}
            >
              <input
                type="checkbox"
                checked={value as boolean}
                disabled={!editable}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
              />
              <span className="text-xs font-medium">{label as string}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Lessons learned <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={lessonsLearned}
            disabled={!editable}
            onChange={(e) => setLessonsLearned(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none disabled:bg-slate-50 disabled:text-slate-500"
          />
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

export default BenefitsSection;
