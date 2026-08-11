"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import {
  MaterialIntakeService,
  AllowedIntakeAction,
  INTAKE_STAGE_LABELS,
} from "@/services/material-intake.service";
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
import { S9GateArrival } from "./steps/S9GateArrival";
import { S10Inspection } from "./steps/S10Inspection";
import { S11Unloading } from "./steps/S11Unloading";
import { S12Storage } from "./steps/S12Storage";

const GROUPS = [
  { code: "S9", label: "Gate & Documents" },
  { code: "S10", label: "Inspection & Acceptance" },
  { code: "S11", label: "Unloading & Weighing" },
  { code: "S12", label: "Yard & Stock Release" },
];

// Which stepper group a given allowed action belongs to.
const ACTION_GROUP: Record<AllowedIntakeAction, number> = {
  VERIFY_DOCUMENTS: 0,
  RECORD_GROSS_WEIGHT: 0,
  RECORD_SAFETY_CHECK: 0,
  ASSIGN_UNLOADING_AREA: 1,
  RECORD_INSPECTION: 1,
  RECORD_ACCEPTANCE_DECISION: 1,
  RECORD_UNLOADING: 2,
  RECORD_NET_WEIGHT: 2,
  ASSIGN_YARD_LOCATION: 3,
  RELEASE_TO_STOCK: 3,
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

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

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["material-intake", params.id] });
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

  const actions = intake.allowedActions ?? [];
  const stageIdx = [
    "A01_GATE_ARRIVAL_RECORDED", "A02_DOCUMENTS_VERIFIED", "A03_GROSS_WEIGHT_CAPTURED", "A04_SAFETY_CHECKED",
    "A05_AREA_ASSIGNED", "A06_VISUAL_INSPECTED", "A07_HAZARD_CHECKED", "A08_RADIATION_CHECKED", "A09_CERTIFICATE_VERIFIED",
    "A10_ACCEPTANCE_DECIDED", "A11_UNLOADED", "A12_NET_WEIGHT_CAPTURED", "A13_YARD_STORED", "A14_STOCK_RELEASED",
  ].indexOf(intake.stage);

  let activeGroup: number;
  if (actions.length > 0) {
    activeGroup = ACTION_GROUP[actions[0]];
  } else if (stageIdx <= 3) {
    activeGroup = 0;
  } else if (stageIdx <= 9) {
    activeGroup = 1;
  } else if (stageIdx <= 11) {
    activeGroup = 2;
  } else {
    activeGroup = 3;
  }

  const stepComponents = [S9GateArrival, S10Inspection, S11Unloading, S12Storage];
  const ActiveStep = stepComponents[activeGroup];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Link href="/steel/p03" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to material intakes
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{intake.intakeNumber}</h1>
          <p className="text-sm text-slate-500">
            Material Intake ·{" "}
            <Link href={`/steel/p02/${intake.sourcingOrderId}`} className="hover:underline">
              {intake.sourcingOrder.sourcingNumber}
            </Link>
            {intake.sourcingOrder.supplier && <> · {intake.sourcingOrder.supplier.name}</>}
          </p>
        </div>
        <Badge className={STATUS_STYLES[intake.status] ?? ""}>{intake.status.replace(/_/g, " ")}</Badge>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-slate-400">Material</p>
            <p className="text-sm font-medium text-slate-800">{intake.materialType?.replace(/_/g, " ") ?? intake.sourcingOrder.materialType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Grade</p>
            <p className="text-sm font-medium text-slate-800">{intake.grade ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Net weight</p>
            <p className="text-sm font-medium text-slate-800">{intake.netWeightTonnes !== null ? `${intake.netWeightTonnes} t` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Stage</p>
            <p className="text-sm font-medium text-slate-800">{INTAKE_STAGE_LABELS[intake.stage]}</p>
          </div>
        </CardContent>
      </Card>

      {intake.status === "REJECTED" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          <XCircle className="h-4 w-4 shrink-0" />
          This material intake was rejected. {intake.decisionNotes && <>Reason: {intake.decisionNotes}</>}
        </div>
      )}
      {intake.status === "ON_HOLD" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This material intake is on hold. {intake.decisionNotes && <>Reason: {intake.decisionNotes}</>}
        </div>
      )}
      {intake.status === "RELEASED" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
          <PackageCheck className="h-4 w-4 shrink-0" />
          Material released for preparation/use.
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

      <ActiveStep intake={intake} token={accessToken!} onSaved={onSaved} onError={onError} />
    </div>
  );
}
