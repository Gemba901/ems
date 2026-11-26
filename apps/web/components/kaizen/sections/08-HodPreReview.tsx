"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRightCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KaizenService } from "@/services/kaizen.service";
import {
  HOD_PRE_REVIEW_LABELS,
  SectionLabel,
} from "@/components/kaizen/kaizen-ui";
import { KaizenSectionProps } from "./types";

type Decision = "APPROVE" | "RETURN" | "REJECT" | "MOVE_TO_SGA";

export default function HodPreReviewSection({
  kaizen,
  access,
  token,
  onSaved,
}: KaizenSectionProps) {
  const remarksId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (decision: Decision) =>
      KaizenService.submitHodPreReview(
        kaizen.id,
        { decision, remarks: remarks.trim() || undefined },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Failed to submit review"),
  });

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n={2}>HOD Pre-Implementation Review</SectionLabel>
        {kaizen.hodPreReviewDecision === "PENDING" ? (
          <p className="text-sm text-muted-foreground">
            Awaiting department HOD review.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                {HOD_PRE_REVIEW_LABELS[kaizen.hodPreReviewDecision]}
              </span>
              {kaizen.hodPreReviewBy &&
                ` by ${kaizen.hodPreReviewBy.firstName} ${kaizen.hodPreReviewBy.lastName}`}
            </p>
            {kaizen.hodPreReviewRemarks && (
              <p className="text-sm text-muted-foreground italic">
                “{kaizen.hodPreReviewRemarks}”
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n={2}>HOD Pre-Implementation Review</SectionLabel>
      <p className="text-xs text-muted-foreground mb-4">
        Review parts 1-7 before this kaizen proceeds to implementation.
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
              mutation.mutate("APPROVE");
            }}
          >
            {mutation.isPending && mutation.variables === "APPROVE" ? (
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
              mutation.mutate("RETURN");
            }}
            variant="outline"
          >
            {mutation.isPending && mutation.variables === "RETURN" ? (
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
              mutation.mutate("REJECT");
            }}
            variant="destructive"
          >
            {mutation.isPending && mutation.variables === "REJECT" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Reject
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (mutation.isPending) return;
              setError(null);
              mutation.mutate("MOVE_TO_SGA");
            }}
            variant="outline"
          >
            {mutation.isPending && mutation.variables === "MOVE_TO_SGA" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightCircle className="h-4 w-4" />
            )}
            Move to SGA
          </Button>
        </div>
      </div>
    </div>
  );
}
