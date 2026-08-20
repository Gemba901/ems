"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MeltingService, AllowedMeltingAction } from "@/services/steel-melting.service";
import { stageToScreenIndex } from "@/components/steel/p05/screenMap";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle, Ban } from "lucide-react";
import { S1FurnaceReadiness } from "./S1FurnaceReadiness";
import { S2ChargingMelting } from "./S2ChargingMelting";
import { S3CompletionHandover } from "./S3CompletionHandover";

// Which of the 3 screens (S1/S2/S3) owns each server-computed allowed
// action. This is the ONLY stage->screen taxonomy for P05 detail routing —
// it mirrors components/steel/p05/screenMap.ts's SCREENS grouping exactly,
// just keyed by action instead of by stage (allowedActions is the backend's
// authoritative "what can happen next", so routing follows it directly
// rather than re-deriving the same answer from stage/status locally).
const ACTION_SCREEN: Record<AllowedMeltingAction, number> = {
  CHECK_LINING: 0,
  CHECK_UTILITIES: 0,
  CHECK_PREVIOUS_HEAT: 0,
  VERIFY_CHARGE: 0,
  LOAD_CHARGE: 1,
  START_MELTING: 1,
  MONITOR_POWER: 1,
  MONITOR_TEMPERATURE: 1,
  RECORD_ADDITIONS: 2,
  REMOVE_SLAG: 2,
  RECORD_OUTPUT: 2,
  CONFIRM_READY: 2,
  REFINING_HANDOVER: 2,
};

// A manual CANCELLED override can happen at any stage via the status
// endpoint — it isn't owned by any single screen, so it gets a small
// generic terminal card here rather than forcing it into S1/S2/S3.
function CancelledState() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p05" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to melting records
      </Link>
      <Card className="border-red-200">
        <CardContent className="py-8 text-center space-y-2">
          <Ban className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">Melting Record Cancelled</p>
          <p className="text-xs text-slate-500">This melting record was cancelled and cannot be progressed further.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MeltingDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: melting, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["melting", params.id],
    queryFn: () => MeltingService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["melting", params.id] });
    toast("Saved", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !melting) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this melting record.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p05" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to melting records
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Melting record not found." : isForbidden ? "You don't have access to this record." : "Couldn't load this melting record."}
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

  if (melting.status === "CANCELLED") {
    return <CancelledState />;
  }

  const actions = melting.allowedActions ?? [];
  // ON_HOLD and CLOSED both return an empty allowedActions[] — in both
  // cases falling back to the stage-based screen is correct: ON_HOLD lands
  // on whatever screen the record was frozen at, and CLOSED lands on S3,
  // which renders its own terminal "handover complete" state once
  // melting.status === "CLOSED".
  const screenIdx = actions.length > 0 ? ACTION_SCREEN[actions[0]] : stageToScreenIndex(melting.stage);

  if (screenIdx === 0) {
    return <S1FurnaceReadiness melting={melting} token={accessToken!} onRefresh={refresh} />;
  }
  if (screenIdx === 1) {
    return <S2ChargingMelting melting={melting} token={accessToken!} onRefresh={refresh} />;
  }
  return <S3CompletionHandover melting={melting} token={accessToken!} onRefresh={refresh} />;
}
