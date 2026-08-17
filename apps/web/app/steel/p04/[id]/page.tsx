"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { ChargePreparationService, AllowedChargeAction } from "@/services/steel-charge-preparation.service";
import { stageToScreenIndex } from "@/components/steel/p04/screenMap";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle, Ban } from "lucide-react";
import { S1RequirementSelection } from "./S1RequirementSelection";
import { S2MaterialPreparation } from "./S2MaterialPreparation";
import { S3VerificationRelease } from "./S3VerificationRelease";

// Which of the 3 screens (S1/S2/S3) owns each server-computed allowed
// action. This is the ONLY stage->screen taxonomy for P04 detail routing —
// it mirrors components/steel/p04/screenMap.ts's SCREENS grouping exactly,
// just keyed by action instead of by stage (allowedActions is the backend's
// authoritative "what can happen next", so routing follows it directly
// rather than re-deriving the same answer from stage/status locally).
const ACTION_SCREEN: Record<AllowedChargeAction, number> = {
  SELECT_LOTS: 0,
  RECORD_SCRAP_SORTING: 1,
  RECORD_SCRAP_CUTTING: 1,
  REMOVE_CONTAMINANTS: 1,
  PREPARE_ADDITIVES: 1,
  CHECK_RETURN_SCRAP: 1,
  PREPARE_RECIPE: 1,
  STAGE_MATERIAL: 1,
  VERIFY_MATERIAL: 2,
  RELEASE_CHARGE: 2,
  CLOSE_HANDOVER: 2,
};

// A manual CANCELLED override can happen at any stage via the status
// endpoint — it isn't owned by any single screen, so it gets a small
// generic terminal card here rather than forcing it into S1/S2/S3.
function CancelledState() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p04" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to charge preparations
      </Link>
      <Card className="border-red-200">
        <CardContent className="py-8 text-center space-y-2">
          <Ban className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">Charge Preparation Cancelled</p>
          <p className="text-xs text-slate-500">This charge preparation was cancelled and cannot be progressed further.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChargePreparationDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prep, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["charge-preparation", params.id],
    queryFn: () => ChargePreparationService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["charge-preparation", params.id] });
    toast("Saved", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !prep) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this charge preparation.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p04" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to charge preparations
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Charge preparation not found." : isForbidden ? "You don't have access to this record." : "Couldn't load this charge preparation."}
            </p>
            <p className="text-xs text-slate-400">{message}</p>
            {!isNotFound && !isForbidden && (
              <button
                onClick={() => refetch()}
                className="text-sm font-medium text-slate-700 hover:text-slate-900 underline"
              >
                Retry
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (prep.status === "CANCELLED") {
    return <CancelledState />;
  }

  const actions = prep.allowedActions ?? [];
  // ON_HOLD and CLOSED both return an empty allowedActions[] — in both
  // cases falling back to the stage-based screen is correct: ON_HOLD lands
  // on whatever screen the preparation was frozen at (that screen shows
  // everything as locked, since no actions are currently allowed), and
  // CLOSED lands on S3, which renders its own terminal "handover complete"
  // state once prep.status === "CLOSED".
  const screenIdx = actions.length > 0 ? ACTION_SCREEN[actions[0]] : stageToScreenIndex(prep.stage);

  if (screenIdx === 0) {
    return <S1RequirementSelection prep={prep} token={accessToken!} onRefresh={refresh} />;
  }
  if (screenIdx === 1) {
    return <S2MaterialPreparation prep={prep} token={accessToken!} onRefresh={refresh} />;
  }
  return <S3VerificationRelease prep={prep} token={accessToken!} onRefresh={refresh} />;
}
