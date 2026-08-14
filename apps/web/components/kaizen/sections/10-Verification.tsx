"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { KaizenService, KaizenVerificationStage } from "@/services/kaizen.service";
import { CurrencySelect, formatDateTime, SectionLabel, VERIFICATION_DECISION_BADGE, VERIFICATION_DECISION_LABELS, VERIFICATION_STAGE_LABELS } from "@/components/kaizen/kaizen-ui";
import { canActOnVerificationStage, KaizenAccessContext } from "@/components/kaizen/gating";
import { KaizenSectionProps } from "./types";

const STAGES: KaizenVerificationStage[] = ["HOD", "STEERING_COMMITTEE", "FINANCE"];

function StageCard({ kaizen, stage, ctx, token, onSaved }: {
  kaizen: KaizenSectionProps["kaizen"];
  stage: KaizenVerificationStage;
  ctx: KaizenAccessContext;
  token: string;
  onSaved: (updated: KaizenSectionProps["kaizen"]) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [benefitAmount, setBenefitAmount] = useState("");
  const [benefitCurrency, setBenefitCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entry = kaizen.verifications.find((v) => v.stage === stage);
  const canAct = canActOnVerificationStage(kaizen, stage, ctx);
  const isFinance = stage === "FINANCE";

  const mutation = useMutation({
    mutationFn: (decision: "VERIFIED" | "RETURN") => {
      if (isFinance && decision === "VERIFIED" && benefitAmount && !benefitCurrency) {
        throw new Error("Select a currency for the verified benefit amount.");
      }
      return KaizenService.submitVerificationStage(
        kaizen.id,
        {
          stage,
          decision,
          remarks: remarks.trim() || undefined,
          ...(isFinance && decision === "VERIFIED" && {
            verifiedBenefitAmount: benefitAmount || undefined,
            verifiedBenefitCurrency: benefitAmount ? benefitCurrency : undefined,
          }),
        },
        token,
      );
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{VERIFICATION_STAGE_LABELS[stage]}</p>
        {entry && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${VERIFICATION_DECISION_BADGE[entry.decision]}`}>
            {VERIFICATION_DECISION_LABELS[entry.decision]}
          </span>
        )}
      </div>
      {entry?.verifiedBy && (
        <p className="text-xs text-slate-500">
          By {entry.verifiedBy.firstName} {entry.verifiedBy.lastName}
          {entry.verifiedAt && ` · ${formatDateTime(entry.verifiedAt)}`}
        </p>
      )}
      {entry?.remarks && <p className="text-xs text-slate-600 italic">"{entry.remarks}"</p>}
      {stage === "FINANCE" && entry?.verifiedBenefitAmount && (
        <p className="text-xs text-slate-600">
          Verified benefit: {entry.verifiedBenefitCurrency} {entry.verifiedBenefitAmount}
        </p>
      )}

      {canAct && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {isFinance && (
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={benefitAmount}
                onChange={(e) => setBenefitAmount(e.target.value)}
                placeholder="Verified benefit amount (optional)"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <CurrencySelect value={benefitCurrency} onChange={setBenefitCurrency} className="text-xs" />
            </div>
          )}
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (optional)..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
          />
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setError(null);
                mutation.mutate("VERIFIED");
              }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {mutation.isPending && mutation.variables === "VERIFIED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Verified
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setError(null);
                mutation.mutate("RETURN");
              }}
              className="flex items-center gap-1.5 border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {mutation.isPending && mutation.variables === "RETURN" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerificationSection({ kaizen, access, token, onSaved, ctx }: KaizenSectionProps & { ctx: KaizenAccessContext }) {
  if (!access.visible) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={10}>Verification &amp; Closure</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        This kaizen closes once all three stages verify it. Any stage returning it sends it back to Part 9 for rework.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STAGES.map((stage) => (
          <StageCard key={stage} kaizen={kaizen} stage={stage} ctx={ctx} token={token} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}
