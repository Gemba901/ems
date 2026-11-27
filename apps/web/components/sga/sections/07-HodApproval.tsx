"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SgaService } from "@/services/sga.service";
import { HOD_DECISION_LABELS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionProps } from "./types";

type Decision = "APPROVED" | "RETURNED" | "REJECTED";

export default function HodApprovalSection({
  sga,
  access,
  token,
  onSaved,
}: SgaSectionProps) {
  const remarksId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (decision: Decision) =>
      SgaService.submitHodApproval(
        sga.id,
        { decision, remarks: remarks.trim() || undefined },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) =>
      setError(
        err instanceof Error ? err.message : "Failed to submit decision",
      ),
  });

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="2.4">HOD Approval</SectionLabel>
        {sga.hodDecision === "PENDING" ? (
          <p className="text-sm text-muted-foreground">
            Awaiting main department HOD decision.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                {HOD_DECISION_LABELS[sga.hodDecision]}
              </span>
              {sga.hodDecisionBy &&
                ` by ${sga.hodDecisionBy.firstName} ${sga.hodDecisionBy.lastName}`}
            </p>
            {sga.hodRemarks && (
              <p className="text-sm text-muted-foreground italic">
                “{sga.hodRemarks}”
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.4">HOD Approval</SectionLabel>
      <p className="text-xs text-muted-foreground mb-4">
        Review sections 1–6 before the team continues.
      </p>
      <div className="space-y-4">
        <div>
          <Label htmlFor={remarksId} className="mb-1.5">
            Remarks{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Textarea
            id={remarksId}
            disabled={mutation.isPending}
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="text-xs text-danger bg-danger-subtle border border-danger rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (mutation.isPending) return;
              setError(null);
              mutation.mutate("APPROVED");
            }}
          >
            {mutation.isPending && mutation.variables === "APPROVED" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (mutation.isPending) return;
              setError(null);
              mutation.mutate("RETURNED");
            }}
            variant="outline"
          >
            {mutation.isPending && mutation.variables === "RETURNED" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Return
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (mutation.isPending) return;
              setError(null);
              mutation.mutate("REJECTED");
            }}
            variant="destructive"
          >
            {mutation.isPending && mutation.variables === "REJECTED" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
