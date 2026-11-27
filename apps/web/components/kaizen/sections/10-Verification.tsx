"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { KaizenService, KaizenVerificationStage } from "@/services/kaizen.service";
import { CurrencySelect, formatDateTime, SectionLabel, VERIFICATION_DECISION_LABELS, VERIFICATION_STAGE_LABELS } from "@/components/kaizen/kaizen-ui";
import { canActOnVerificationStage, isDelegatedVerification, KaizenAccessContext } from "@/components/kaizen/gating";
import { KaizenSectionProps } from "./types";

const STAGES: KaizenVerificationStage[] = ["HOD", "STEERING_COMMITTEE", "FINANCE"];

function StageCard({ kaizen, stage, ctx, token, onSaved }: {
  kaizen: KaizenSectionProps["kaizen"];
  stage: KaizenVerificationStage;
  ctx: KaizenAccessContext;
  token: string;
  onSaved: (updated: KaizenSectionProps["kaizen"]) => void;
}) {
  const fieldId = useId();
  const [remarks, setRemarks] = useState("");
  const [benefitAmount, setBenefitAmount] = useState("");
  const [benefitCurrency, setBenefitCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entry = kaizen.verifications.find((v) => v.stage === stage);
  const canAct = canActOnVerificationStage(kaizen, stage, ctx);
  const isFinance = stage === "FINANCE";
  const isDelegated = canAct && isDelegatedVerification(stage, ctx);

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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{VERIFICATION_STAGE_LABELS[stage]}</p>
        {entry && (
          <StatusBadge status={entry.decision === "RETURN" ? "RETURNED_FOR_REWORK" : entry.decision} label={VERIFICATION_DECISION_LABELS[entry.decision]} />
        )}
      </div>
      {entry?.verifiedBy && (
        <p className="text-xs text-muted-foreground">
          By {entry.verifiedBy.firstName} {entry.verifiedBy.lastName}
          {entry.verifiedAt && ` · ${formatDateTime(entry.verifiedAt)}`}
        </p>
      )}
      {entry?.remarks && <p className="text-xs text-muted-foreground italic">“{entry.remarks}”</p>}
      {stage === "FINANCE" && entry?.verifiedBenefitAmount && (
        <p className="text-xs text-muted-foreground">
          Verified benefit: {entry.verifiedBenefitCurrency} {entry.verifiedBenefitAmount}
        </p>
      )}

      {canAct && (
        <div className="space-y-2 pt-2 border-t border-border">
          {isDelegated && (
            <p className="text-[11px] text-muted-foreground italic">
              Recording on behalf of {VERIFICATION_STAGE_LABELS[stage]}
            </p>
          )}
          {isFinance && (
            <div className="flex gap-2 min-w-0">
              <Input
                aria-label="Verified benefit amount"
                disabled={mutation.isPending}
                type="number"
                min="0"
                step="0.01"
                value={benefitAmount}
                onChange={(e) => setBenefitAmount(e.target.value)}
                placeholder="Verified benefit amount (optional)"
                className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              />
              <CurrencySelect ariaLabel="Verified benefit currency" disabled={mutation.isPending} value={benefitCurrency} onChange={setBenefitCurrency} className="text-xs w-28 shrink-0" />
            </div>
          )}
          <Label htmlFor={fieldId}>Remarks (optional)</Label>
          <Textarea id={fieldId} disabled={mutation.isPending}
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (optional)..."
            className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary resize-none"
          />
          {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="default"
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                if (mutation.isPending) return;
                setError(null);
                mutation.mutate("VERIFIED");
              }}
              className="flex items-center gap-1.5 bg-success hover:bg-success disabled:opacity-60 text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {mutation.isPending && mutation.variables === "VERIFIED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Verified
            </Button>
            <Button variant="ghost"
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setError(null);
                mutation.mutate("RETURN");
              }}
              className="flex items-center gap-1.5 border border-warning text-warning hover:bg-warning-subtle disabled:opacity-60 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {mutation.isPending && mutation.variables === "RETURN" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Return
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerificationSection({ kaizen, access, token, onSaved, ctx }: KaizenSectionProps & { ctx: KaizenAccessContext }) {
  if (!access.visible) return null;

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n={4}>Verification &amp; Closure</SectionLabel>
      <p className="text-xs text-muted-foreground mb-4">
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
