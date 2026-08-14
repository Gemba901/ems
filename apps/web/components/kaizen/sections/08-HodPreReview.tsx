"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRightCircle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { HOD_PRE_REVIEW_LABELS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionProps } from "./types";

type Decision = "APPROVE" | "RETURN" | "REJECT" | "MOVE_TO_SGA";

export default function HodPreReviewSection({ kaizen, access, token, onSaved }: KaizenSectionProps) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (decision: Decision) => KaizenService.submitHodPreReview(kaizen.id, { decision, remarks: remarks.trim() || undefined }, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to submit review"),
  });

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n={8}>HOD Pre-Implementation Review</SectionLabel>
        {kaizen.hodPreReviewDecision === "PENDING" ? (
          <p className="text-sm text-slate-400">Awaiting department HOD review.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{HOD_PRE_REVIEW_LABELS[kaizen.hodPreReviewDecision]}</span>
              {kaizen.hodPreReviewBy && ` by ${kaizen.hodPreReviewBy.firstName} ${kaizen.hodPreReviewBy.lastName}`}
            </p>
            {kaizen.hodPreReviewRemarks && <p className="text-sm text-slate-600 italic">"{kaizen.hodPreReviewRemarks}"</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={8}>HOD Pre-Implementation Review</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">Review parts 1-7 before this kaizen proceeds to implementation.</p>
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
              mutation.mutate("APPROVE");
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("RETURN");
            }}
            className="flex items-center gap-2 border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "RETURN" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Return
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("REJECT");
            }}
            className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "REJECT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate("MOVE_TO_SGA");
            }}
            className="flex items-center gap-2 border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            {mutation.isPending && mutation.variables === "MOVE_TO_SGA" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            Move to SGA
          </button>
        </div>
      </div>
    </div>
  );
}
