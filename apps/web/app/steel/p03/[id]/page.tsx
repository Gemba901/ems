"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MaterialIntakeService, AllowedIntakeAction } from "@/services/material-intake.service";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle, Ban } from "lucide-react";
import { S1GateDocuments } from "./S1GateDocuments";
import { S2InspectionAcceptance } from "./S2InspectionAcceptance";
import { S3UnloadingStorageRelease } from "./S3UnloadingStorageRelease";

// Which of the 3 screens (S1/S2/S3) owns each server-computed allowed
// action. This is the ONLY stage->screen taxonomy for P03 detail routing —
// it mirrors components/steel/p03/screenMap.ts's SCREENS grouping exactly,
// just keyed by action instead of by stage (allowedActions is the backend's
// authoritative "what can happen next", so routing follows it directly
// rather than re-deriving the same answer from stage/status locally).
const ACTION_SCREEN: Record<AllowedIntakeAction, number> = {
  VERIFY_DOCUMENTS: 0,
  RECORD_GROSS_WEIGHT: 0,
  RECORD_SAFETY_CHECK: 0,
  ASSIGN_UNLOADING_AREA: 1,
  RECORD_INSPECTION: 1,
  RECORD_ACCEPTANCE_DECISION: 1,
  RECORD_UNLOADING: 2,
  RECORD_NET_WEIGHT: 2,
  ASSIGN_YARD_LOCATION: 2,
  RELEASE_TO_STOCK: 2,
};

// A manual CANCELLED override can happen at any stage via the status
// endpoint — it isn't owned by any single screen, so it gets a small
// generic terminal card here rather than forcing it into S1/S2/S3.
function CancelledState() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p03" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to material intakes
      </Link>
      <Card className="border-red-200">
        <CardContent className="py-8 text-center space-y-2">
          <Ban className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-900">Material Intake Cancelled</p>
          <p className="text-xs text-slate-500">This intake was cancelled and cannot be progressed further.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MaterialIntakeDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: intake, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["material-intake", params.id],
    queryFn: () => MaterialIntakeService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      // Don't retry on 404/403-style "won't ever succeed" errors — only on
      // transient/network failures.
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  // Richer P02 context (PO number/quantity/price/terms) isn't included on
  // the intake's own embedded sourcingOrder — fetched separately from the
  // real, existing P02 endpoint. Screens degrade gracefully while this is
  // loading or if it fails, using only the lighter embedded fields.
  const sourcingOrderQuery = useQuery({
    queryKey: ["steel-sourcing-order", intake?.sourcingOrderId],
    queryFn: () => SteelSourcingService.getById(intake!.sourcingOrderId, accessToken!),
    enabled: !!accessToken && !!intake?.sourcingOrderId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["material-intake", params.id] });
    toast("Saved", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !intake) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this material intake.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p03" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to material intakes
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Material intake not found." : isForbidden ? "You don't have access to this record." : "Couldn't load this material intake."}
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

  if (intake.status === "CANCELLED") {
    return <CancelledState />;
  }

  const sourcingOrder = sourcingOrderQuery.data;
  const actions = intake.allowedActions ?? [];
  // REJECTED (no further actions, owned by S2) and RELEASED (owned by S3)
  // are rendered by their natural screen rather than a generic fallback —
  // actions.length === 0 only happens for those two terminal outcomes once
  // CANCELLED is already handled above.
  const screenIdx = actions.length > 0 ? ACTION_SCREEN[actions[0]] : intake.status === "REJECTED" ? 1 : 2;

  if (screenIdx === 0) {
    return <S1GateDocuments intake={intake} token={accessToken!} onRefresh={refresh} sourcingOrder={sourcingOrder} />;
  }
  if (screenIdx === 1) {
    return <S2InspectionAcceptance intake={intake} token={accessToken!} onRefresh={refresh} sourcingOrder={sourcingOrder} />;
  }
  return <S3UnloadingStorageRelease intake={intake} token={accessToken!} onRefresh={refresh} sourcingOrder={sourcingOrder} />;
}
