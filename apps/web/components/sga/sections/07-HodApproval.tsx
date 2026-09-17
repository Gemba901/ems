"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { SgaService } from "@/services/sga.service";
import { HOD_DECISION_LABELS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionProps } from "./types";

type Decision = "APPROVED" | "RETURNED" | "REJECTED";

export default function HodApprovalSection({ sga, access, token, onSaved }: SgaSectionProps) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (decision: Decision) => SgaService.submitHodApproval(sga.id, { decision, remarks: remarks.trim() || undefined }, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to submit decision"),
  });

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="2.7">HOD Approval</SectionLabel>
        {sga.hodDecision === "PENDING" ? (
          <p className="text-sm text-slate-400">Awaiting main department HOD decision.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{HOD_DECISION_LABELS[sga.hodDecision]}</span>
              {sga.hodDecisionBy && ` by ${sga.hodDecisionBy.firstName} ${sga.hodDecisionBy.lastName}`}
            </p>
            {sga.hodRemarks && <p className="text-sm text-slate-600 italic">"{sga.hodRemarks}"</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.7">HOD Approval</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">Review sections 1-6 before this SGA proceeds to the team's work.</p>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Remarks <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("APPROVED");
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "APPROVED" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("RETURNED");
            }}
            className="flex items-center gap-2 border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "RETURNED" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Return
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("REJECTED");
            }}
            className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "REJECTED" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
