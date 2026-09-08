"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { HeatApprovalService, AllowedHeatApprovalAction } from "@/services/steel-heat-approval.service";
import { stageToScreenIndex } from "@/components/steel/p06/screenMap";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle, Ban } from "lucide-react";
import { HeatReview } from "./HeatReview";
import { ApprovalTapAuthorization } from "./S3ApprovalTappingRelease";

// Which of the 2 screens (Heat Review / Approval & Tap Authorization) owns
// each server-computed allowed action. This is the ONLY stage->screen
// taxonomy for P06 detail routing — it mirrors
// components/steel/p06/screenMap.ts's SCREENS grouping exactly, just keyed
// by action instead of by stage (allowedActions is the backend's
// authoritative "what can happen next", so routing follows it directly
// rather than re-deriving the same answer from stage/status locally).
const ACTION_SCREEN: Record<AllowedHeatApprovalAction, number> = {
  ANALYZE_SAMPLE: 0,
  COMPARE_CHEMISTRY: 0,
  DECIDE_CORRECTION: 0,
  ADD_CORRECTION_MATERIAL: 0,
  RETEST_CHEMISTRY: 0,
  CHECK_TEMPERATURE: 0,
  CHECK_LADLE_READINESS: 0,
  APPROVE_CHEMISTRY_TEMPERATURE: 1,
  CONFIRM_HEAT_NUMBER: 1,
  TAPPING_APPROVAL: 1,
  TAP_TO_LADLE: 1,
  RELEASE_TO_CASTING: 1,
};

// A manual CANCELLED override can happen at any stage via the status
// endpoint — it isn't owned by any single screen, so it gets a small
// generic terminal card here rather than forcing it into S1/S2/S3.
function CancelledState() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p06" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to heat approval records
      </Link>
      <Card className="border-red-200">
        <CardContent className="py-8 text-center space-y-2">
          <Ban className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">Heat Approval Record Cancelled</p>
          <p className="text-xs text-slate-500">This heat approval record was cancelled and cannot be progressed further.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HeatApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: heatApproval, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["heat-approval", params.id],
    queryFn: () => HeatApprovalService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["heat-approval", params.id] });
    toast("Saved", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !heatApproval) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this heat approval record.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p06" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to heat approval records
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Heat approval record not found." : isForbidden ? "You don't have access to this record." : "Couldn't load this heat approval record."}
            </p>
            <p className="text-xs text-slate-400">{message}</p>
            {!isNotFound && !isForbidden && (
              <button onClick={() => refetch()} className="text-sm font-medium text-slate-700 hover:text-slate-900 underline">
                Retry
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (heatApproval.status === "CANCELLED") {
    return <CancelledState />;
  }

  const actions = heatApproval.allowedActions ?? [];
  // ON_HOLD and CLOSED both return an empty allowedActions[] — in both
  // cases falling back to the stage-based screen is correct: ON_HOLD lands
  // on whatever screen the record was frozen at, and CLOSED lands on the
  // Approval & Tap Authorization screen, which renders its own terminal
  // "released to casting" state once heatApproval.status === "CLOSED".
  const screenIdx = actions.length > 0 ? ACTION_SCREEN[actions[0]] : stageToScreenIndex(heatApproval.stage);

  if (screenIdx === 0) {
    return <HeatReview heatApproval={heatApproval} token={accessToken!} onRefresh={refresh} />;
  }
  return <ApprovalTapAuthorization heatApproval={heatApproval} token={accessToken!} onRefresh={refresh} />;
}
