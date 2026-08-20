"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MeltingService, AllowedMeltingAction } from "@/services/steel-melting.service";
import { stageToScreenIndex } from "@/components/steel/p05/screenMap";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle, Ban, Flame, ShieldCheck } from "lucide-react";
import { HeatOperations } from "./HeatOperations";
import { ReviewRelease } from "./ReviewRelease";
import type { SteelMelting } from "@/services/steel-melting.service";

// Which of the 2 consolidated UI screens (Heat Operations / Review &
// Release) owns each server-computed allowed action. Mirrors
// components/steel/p05/screenMap.ts's SCREENS grouping (S1+S2 -> Heat
// Operations, S3 -> Review & Release) — allowedActions is the backend's
// authoritative "what can happen next", so routing follows it directly
// rather than re-deriving the same answer from stage/status locally.
const ACTION_SCREEN: Record<AllowedMeltingAction, number> = {
  CHECK_LINING: 0,
  CHECK_UTILITIES: 0,
  CHECK_PREVIOUS_HEAT: 0,
  VERIFY_CHARGE: 0,
  LOAD_CHARGE: 0,
  START_MELTING: 0,
  MONITOR_POWER: 0,
  MONITOR_TEMPERATURE: 0,
  RECORD_ADDITIONS: 1,
  REMOVE_SLAG: 1,
  RECORD_OUTPUT: 1,
  CONFIRM_READY: 1,
  REFINING_HANDOVER: 1,
};

// Persistent [Operations][Review & Release] toggle shown above whichever
// screen is active — lets the operator switch between the two consolidated
// workspaces directly, rather than only being auto-routed by
// allowedActions. Individual A01-A14 inputs inside each screen remain
// gated by allowedActions/subStatus() regardless of which tab is selected,
// so switching tabs never bypasses backend-enforced sequencing.
function WorkspaceTabs({ melting, active, onChange }: { melting: SteelMelting; active: number; onChange: (idx: number) => void }) {
  const closed = melting.status === "CLOSED";
  return (
    <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center gap-1">
        <button
          onClick={() => onChange(0)}
          className={
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors " +
            (active === 0 ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800")
          }
        >
          <Flame className="h-4 w-4" />
          Operations
        </button>
        <button
          onClick={() => onChange(1)}
          className={
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors " +
            (active === 1 ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800")
          }
        >
          <ShieldCheck className="h-4 w-4" />
          {closed ? "Review & Release (Closed)" : "Review & Release"}
        </button>
      </div>
    </div>
  );
}

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
  const [manualTab, setManualTab] = useState<number | null>(null);

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
  // on whatever screen the record was frozen at, and CLOSED lands on
  // Review & Release, which renders its own terminal "handover complete"
  // state once melting.status === "CLOSED".
  const autoScreenIdx = actions.length > 0 ? ACTION_SCREEN[actions[0]] : (stageToScreenIndex(melting.stage) === 2 ? 1 : 0);
  // The operator can freely switch tabs (manualTab); the backend's
  // allowedActions still gates every individual A01-A14 input inside
  // whichever screen is shown, so this never bypasses sequencing.
  const activeIdx = manualTab ?? autoScreenIdx;

  return (
    <div>
      <WorkspaceTabs melting={melting} active={activeIdx} onChange={setManualTab} />
      {activeIdx === 0 ? (
        <HeatOperations melting={melting} token={accessToken!} onRefresh={refresh} />
      ) : (
        <ReviewRelease melting={melting} token={accessToken!} onRefresh={refresh} />
      )}
    </div>
  );
}
