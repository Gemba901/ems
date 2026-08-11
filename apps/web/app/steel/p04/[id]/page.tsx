"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import {
  ChargePreparationService,
  AllowedChargeAction,
  CHARGE_STAGE_LABELS,
  CHARGE_STAGE_ORDER,
} from "@/services/steel-charge-preparation.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  PackageCheck,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { S13MaterialRequirement } from "./steps/S13MaterialRequirement";
import { S14MaterialPreparation } from "./steps/S14MaterialPreparation";
import { S15ChargeRecipe } from "./steps/S15ChargeRecipe";
import { S16ChargeRelease } from "./steps/S16ChargeRelease";

const GROUPS = [
  { code: "S13", label: "Material Requirement" },
  { code: "S14", label: "Scrap Sorting & Preparation" },
  { code: "S15", label: "Charge Recipe & Verification" },
  { code: "S16", label: "Charge Release & Handover" },
];

// Which stepper group a given allowed action belongs to.
const ACTION_GROUP: Record<AllowedChargeAction, number> = {
  SELECT_LOTS: 0,
  RECORD_SCRAP_SORTING: 1,
  RECORD_SCRAP_CUTTING: 1,
  REMOVE_CONTAMINANTS: 1,
  PREPARE_ADDITIVES: 1,
  CHECK_RETURN_SCRAP: 1,
  PREPARE_RECIPE: 2,
  STAGE_MATERIAL: 2,
  VERIFY_MATERIAL: 2,
  RELEASE_CHARGE: 3,
  CLOSE_HANDOVER: 3,
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  CLOSED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

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
      // Don't retry on 404/403-style "won't ever succeed" errors — only on
      // transient/network failures.
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["charge-preparation", params.id] });
    toast("Saved", "success");
  };
  const onError = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong", "error");

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

  const actions = prep.allowedActions ?? [];
  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  let activeGroup: number;
  if (actions.length > 0) {
    activeGroup = ACTION_GROUP[actions[0]];
  } else if (stageIdx <= 0) {
    activeGroup = 0;
  } else if (stageIdx <= 6) {
    activeGroup = 1;
  } else if (stageIdx <= 9) {
    activeGroup = 2;
  } else {
    activeGroup = 3;
  }

  const stepComponents = [S13MaterialRequirement, S14MaterialPreparation, S15ChargeRecipe, S16ChargeRelease];
  const ActiveStep = stepComponents[activeGroup];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Link href="/steel/p04" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to charge preparations
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{prep.prepNumber}</h1>
          <p className="text-sm text-slate-500">
            Charge Preparation ·{" "}
            <Link href={`/steel/p01/${prep.planId}`} className="hover:underline">
              {prep.plan?.planNumber}
            </Link>
            {prep.chargeNumber && <> · Charge {prep.chargeNumber}</>}
          </p>
        </div>
        <Badge className={STATUS_STYLES[prep.status] ?? ""}>{prep.status.replace(/_/g, " ")}</Badge>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-slate-400">Stage</p>
            <p className="text-sm font-medium text-slate-800">{CHARGE_STAGE_LABELS[prep.stage]}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Selected lots</p>
            <p className="text-sm font-medium text-slate-800">{prep.materialLots.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Charge ID</p>
            <p className="text-sm font-medium text-slate-800">{prep.chargeNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Created</p>
            <p className="text-sm font-medium text-slate-800">{new Date(prep.createdAt).toLocaleDateString()}</p>
          </div>
        </CardContent>
      </Card>

      {prep.status === "ON_HOLD" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This charge preparation is on hold.
        </div>
      )}
      {prep.status === "CANCELLED" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          <XCircle className="h-4 w-4 shrink-0" />
          This charge preparation was cancelled.
        </div>
      )}
      {prep.status === "CLOSED" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
          <PackageCheck className="h-4 w-4 shrink-0" />
          Handover closed — ready for P05 Furnace.
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {GROUPS.map((g, i) => (
          <div key={g.code} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                i < activeGroup
                  ? "bg-emerald-50 text-emerald-700"
                  : i === activeGroup
                    ? "bg-blue-50 text-blue-700"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < activeGroup ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              <span className="text-slate-400 font-mono">{g.code}</span>
              {g.label}
            </div>
            {i < GROUPS.length - 1 && <div className="w-4 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      <ActiveStep prep={prep} token={accessToken!} onSaved={onSaved} onError={onError} />
    </div>
  );
}
