"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SgaService, SgaVerificationStage } from "@/services/sga.service";
import {
  formatDateTime,
  SectionLabel,
  VERIFICATION_DECISION_LABELS,
  VERIFICATION_STAGE_LABELS,
} from "@/components/sga/sga-ui";
import {
  canActOnVerificationStage,
  isDelegatedVerification,
  SgaAccessContext,
} from "@/components/sga/gating";
import { SgaSectionProps } from "./types";

const STAGES: SgaVerificationStage[] = ["HOD", "STEERING_COMMITTEE", "FINANCE"];

function StageCard({
  sga,
  stage,
  ctx,
  token,
  onSaved,
}: {
  sga: SgaSectionProps["sga"];
  stage: SgaVerificationStage;
  ctx: SgaAccessContext;
  token: string;
  onSaved: (updated: SgaSectionProps["sga"]) => void;
}) {
  const remarksId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entry = sga.verifications.find((v) => v.stage === stage);
  const canAct = canActOnVerificationStage(sga, stage, ctx);
  const isDelegated = canAct && isDelegatedVerification(stage, ctx);

  const mutation = useMutation({
    mutationFn: (decision: "VERIFIED" | "RETURN") =>
      SgaService.submitVerificationStage(
        sga.id,
        { stage, decision, remarks: remarks.trim() || undefined },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {VERIFICATION_STAGE_LABELS[stage]}
        </p>
        {entry && (
          <StatusBadge
            status={
              entry.decision === "RETURN"
                ? "RETURNED_FOR_REWORK"
                : entry.decision
            }
            label={VERIFICATION_DECISION_LABELS[entry.decision]}
          />
        )}
      </div>
      {entry?.verifiedBy && (
        <p className="text-xs text-muted-foreground">
          By {entry.verifiedBy.firstName} {entry.verifiedBy.lastName}
          {entry.verifiedAt && ` · ${formatDateTime(entry.verifiedAt)}`}
        </p>
      )}
      {entry?.remarks && (
        <p className="text-xs text-muted-foreground italic">
          “{entry.remarks}”
        </p>
      )}

      {canAct && (
        <div className="space-y-2 pt-2 border-t border-border">
          {isDelegated && (
            <p className="text-[11px] text-muted-foreground italic">
              Recording on behalf of {VERIFICATION_STAGE_LABELS[stage]}
            </p>
          )}
          <Label htmlFor={remarksId}>Remarks (optional)</Label>
          <Textarea
            id={remarksId}
            disabled={mutation.isPending}
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (optional)..."
          />
          {error && (
            <p
              role="alert"
              className="text-xs text-danger bg-danger-subtle border border-danger rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                if (mutation.isPending) return;
                setError(null);
                mutation.mutate("VERIFIED");
              }}
            >
              {mutation.isPending && mutation.variables === "VERIFIED" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Verified
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                if (mutation.isPending) return;
                setError(null);
                mutation.mutate("RETURN");
              }}
              variant="outline"
            >
              {mutation.isPending && mutation.variables === "RETURN" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Return
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerificationSection({
  sga,
  access,
  token,
  onSaved,
  ctx,
}: SgaSectionProps & { ctx: SgaAccessContext }) {
  if (!access.visible) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="6.2">Verification &amp; Closure</SectionLabel>
      <p className="text-xs text-muted-foreground mb-4">
        This SGA closes once all required stages verify it. Any stage returning
        it sends it back for rework.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STAGES.map((stage) => (
          <StageCard
            key={stage}
            sga={sga}
            stage={stage}
            ctx={ctx}
            token={token}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
}
