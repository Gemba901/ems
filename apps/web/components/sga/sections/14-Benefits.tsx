"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaBenefitPeriod, SgaService } from "@/services/sga.service";
import { BENEFIT_PERIOD_LABELS, BENEFIT_PERIOD_OPTIONS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const BenefitsSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function BenefitsSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [qcdsmtBenefitAchieved, setQcdsmtBenefitAchieved] = useState(sga.qcdsmtBenefitAchieved ?? "");
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

  const mutation = useMutation({
    mutationFn: () =>
      SgaService.updateBenefits(
        sga.id,
        {
          qcdsmtBenefitAchieved: qcdsmtBenefitAchieved.trim() || undefined,
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
      ),
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
        <SectionLabel n="5.13">Benefits &amp; Sustainability</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">QCDSMT Benefit Achieved</p>
            <p className="text-sm text-slate-700">{sga.qcdsmtBenefitAchieved || "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Waste Reduction Achieved</p>
            <p className="text-sm text-slate-700">{sga.wasteReductionAchieved || "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Financial Loss Before</p>
            <p className="text-sm text-slate-700">{sga.financialLossBeforeImprovement ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Verified Gross Benefit</p>
            <p className="text-sm text-slate-700">
              {sga.verifiedGrossBenefit ?? "Not set"}
              {sga.benefitPeriod ? ` (${BENEFIT_PERIOD_LABELS[sga.benefitPeriod]})` : ""}
            </p>
          </div>
          {sga.effectivenessConfirmationPeriod && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Effectiveness Confirmation Period</p>
              <p className="text-sm text-slate-700">{sga.effectivenessConfirmationPeriod}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            ["SOP Updated", sga.sopUpdated],
            ["Employees Trained", sga.employeesTrained],
            ["Follow-up Planned", sga.followUpCheckPlanned],
            ["Applied Elsewhere", sga.appliedElsewhere],
          ].map(([label, value]) => (
            <div key={label as string} className="border border-slate-100 rounded-lg p-2 text-center">
              <p className="text-xs text-slate-500">{label as string}</p>
              <p className={`text-sm font-semibold ${value ? "text-emerald-600" : "text-slate-400"}`}>{value ? "Yes" : "No"}</p>
            </div>
          ))}
        </div>
        {sga.lessonsLearned && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Lessons Learned</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.lessonsLearned}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="5.13">Benefits &amp; Sustainability</SectionLabel>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              QCDSMT benefit achieved <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={qcdsmtBenefitAchieved}
              onChange={(e) => setQcdsmtBenefitAchieved(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Waste reduction achieved <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={wasteReductionAchieved}
              onChange={(e) => setWasteReductionAchieved(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
              onChange={(e) => setFinancialLossBeforeImprovement(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
              onChange={(e) => setVerifiedGrossBenefit(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Benefit period <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <select
              value={benefitPeriod}
              onChange={(e) => setBenefitPeriod(e.target.value as SgaBenefitPeriod)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
              onChange={(e) => setEffectivenessConfirmationPeriod(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
              className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer border border-slate-200 rounded-lg px-3 py-2"
            >
              <input
                type="checkbox"
                checked={value as boolean}
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
            onChange={(e) => setLessonsLearned(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
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
