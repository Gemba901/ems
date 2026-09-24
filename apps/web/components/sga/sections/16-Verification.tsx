"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { SgaService, SgaVerificationStage } from "@/services/sga.service";
import {
  formatDateTime,
  SectionLabel,
  VERIFICATION_DECISION_BADGE,
  VERIFICATION_DECISION_LABELS,
  VERIFICATION_STAGE_LABELS,
} from "@/components/sga/sga-ui";
import { canActOnVerificationStage, isDelegatedVerification, SgaAccessContext } from "@/components/sga/gating";
import { SgaSectionProps } from "./types";

const STAGES: SgaVerificationStage[] = ["AFFECTED_DEPARTMENT", "HOD", "STEERING_COMMITTEE", "FINANCE"];

function StageCard({ sga, stage, ctx, token, onSaved }: {
  sga: SgaSectionProps["sga"];
  stage: SgaVerificationStage;
  ctx: SgaAccessContext;
  token: string;
  onSaved: (updated: SgaSectionProps["sga"]) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entry = sga.verifications.find((v) => v.stage === stage);
  const canAct = canActOnVerificationStage(sga, stage, ctx);
  const isDelegated = canAct && isDelegatedVerification(stage, ctx);

  const mutation = useMutation({
    mutationFn: (decision: "VERIFIED" | "RETURN") =>
      SgaService.submitVerificationStage(sga.id, { stage, decision, remarks: remarks.trim() || undefined }, token),
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

      {canAct && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {isDelegated && (
            <p className="text-[11px] text-slate-400 italic">Recording on behalf of {VERIFICATION_STAGE_LABELS[stage]}</p>
          )}
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (optional)..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
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

export default function VerificationSection({ sga, access, token, onSaved, ctx }: SgaSectionProps & { ctx: SgaAccessContext }) {
  if (!access.visible) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="6.2">Verification &amp; Closure</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        This SGA closes once all four stages verify it. Any stage returning it sends it back for rework.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STAGES.map((stage) => (
          <StageCard key={stage} sga={sga} stage={stage} ctx={ctx} token={token} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}
