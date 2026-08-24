"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  HeatApprovalService,
  SteelHeatApproval,
  UpdateHeatApprovalStatusPayload,
} from "@/services/steel-heat-approval.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { ScreenSidebar } from "@/components/steel/p06/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p06/ContextSummary";
import { HeatApprovalProgress } from "@/components/steel/p06/HeatApprovalProgress";
import { Field } from "@/components/steel/p06/shared";
import { statusBadgeClass } from "@/lib/steelStatusColors";
import { ChemistryTab, chemistryTabStatuses, formatChemistry } from "./S1ChemistrySampling";
import { HeatCycleTab, heatCycleTabStatuses } from "./S2TemperatureLadle";
import { ClipboardList, FlaskConical, Thermometer, FileText, FileStack, Loader2, CheckCircle2, XCircle, MessageCircleQuestion } from "lucide-react";

const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

type TabKey = "summary" | "chemistry" | "heat-cycle" | "samples" | "documents";

const TABS: { key: TabKey; label: string; icon: typeof ClipboardList }[] = [
  { key: "summary", label: "Summary", icon: ClipboardList },
  { key: "chemistry", label: "Chemistry", icon: FlaskConical },
  { key: "heat-cycle", label: "Heat Cycle", icon: Thermometer },
  { key: "samples", label: "Samples & Tests", icon: FileText },
  { key: "documents", label: "Documents", icon: FileStack },
];

function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={
            "flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors " +
            (active === tab.key
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// "Heat Summary" card — every field is a real column on SteelHeatApproval
// or its P05 melting/P01 plan lineage. "Heat Weight" (outputWeightTonnes)
// and "Furnace" (melting.furnace) are only present once getById selects
// them; both were added to heat-approval.service.ts's include for this.
function SummaryTab({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  const grade = heatApproval.requiredGrade ?? heatApproval.melting?.chargePreparation?.plan?.grade ?? null;
  const furnace = heatApproval.melting?.furnace?.name ?? heatApproval.melting?.furnaceId ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Heat Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Furnace" value={furnace} />
          <Field label="Steel Grade" value={grade} />
          <Field label="Submitted By" value={`${heatApproval.createdBy.firstName} ${heatApproval.createdBy.lastName}`} />
          <Field label="Submitted On" value={new Date(heatApproval.createdAt).toLocaleString()} />
          <Field label="Tap Temperature" value={heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : null} />
          <Field label="Heat Weight" value={heatApproval.melting?.outputWeightTonnes != null ? `${heatApproval.melting.outputWeightTonnes} Tonnes` : null} />
          <div>
            <p className="text-xs text-slate-400">Heat Cycle Doc</p>
            <Badge className={statusBadgeClass(heatApproval.status)}>{heatApproval.status.replace(/_/g, " ")}</Badge>
          </div>
        </CardContent>
      </Card>

      {/*
        Mockup shows a "Chemistry Compliance" table with per-element
        Target(Min-Max)/Deviation columns. There's no grade-spec model
        backing per-element target ranges in this system — only the actual
        composition and an overall matches-grade boolean — so only those
        real fields are shown here rather than fabricating ranges.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chemistry Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          {heatApproval.chemistryComposition ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-4 font-medium">Element</th>
                    <th className="py-1.5 pr-4 font-medium">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(heatApproval.chemistryComposition).map(([el, v]) => (
                    <tr key={el} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 pr-4 text-slate-700">{el} (%)</td>
                      <td className="py-1.5 pr-4 font-medium text-slate-900">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-slate-500">Matches required grade:</span>
                {heatApproval.chemistryMatchesGrade === true ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                ) : heatApproval.chemistryMatchesGrade === false ? (
                  <span className="inline-flex items-center gap-1 text-red-600 font-medium"><XCircle className="h-3.5 w-3.5" /> Deviation</span>
                ) : (
                  <span className="text-slate-400">Not yet compared</span>
                )}
              </div>
              {heatApproval.chemistryDeviationNotes && (
                <p className="mt-2 text-xs text-slate-500">Notes: {heatApproval.chemistryDeviationNotes}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No chemistry analysis recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Key Evaluations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {[
            {
              label: "Heat Cycle Steps Completed",
              ok: heatApproval.liquidTemperatureCelsius !== null && heatApproval.ladleReady === true,
              value:
                heatApproval.liquidTemperatureCelsius !== null && heatApproval.ladleReady === true
                  ? "Completed"
                  : "Pending",
            },
            {
              label: "Temperature Recorded",
              ok: heatApproval.liquidTemperatureCelsius !== null,
              value: heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : "Not recorded",
            },
            {
              label: "Chemistry Within Specification",
              ok: heatApproval.chemistryMatchesGrade === true,
              value: heatApproval.chemistryMatchesGrade === true ? "Compliant" : heatApproval.chemistryMatchesGrade === false ? "Deviation" : "Pending",
            },
            {
              label: "Samples & Tests Attached",
              ok: heatApproval.chemistryComposition !== null,
              value: heatApproval.chemistryComposition !== null ? "Yes" : "No",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                {row.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                {row.label}
              </span>
              <span className="font-medium text-slate-800">{row.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SamplesTab({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Samples & Tests</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Sample reference" value={heatApproval.sampleRef} />
        <Field label="Sampled at" value={heatApproval.sampleTakenAt ? new Date(heatApproval.sampleTakenAt).toLocaleString() : null} />
        <Field label="Lab reference" value={heatApproval.labRef} />
        <Field label="Analyzed chemistry" value={formatChemistry(heatApproval.chemistryComposition)} />
        <Field label="Re-tested chemistry" value={formatChemistry(heatApproval.retestChemistryComposition)} />
        <Field label="Re-test not applicable" value={heatApproval.retestNotApplicable ? "Yes" : null} />
      </CardContent>
    </Card>
  );
}

function DocumentsTab() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-slate-500">No document data is currently tracked for heat approval records in this system.</p>
        <p className="text-xs text-slate-400 mt-1">This tab is a placeholder — omitted rather than showing fabricated document rows.</p>
      </CardContent>
    </Card>
  );
}

function RequestClarificationButton({ heatApproval, token, canAct, onRefresh }: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onRefresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: UpdateHeatApprovalStatusPayload) => HeatApprovalService.updateStatus(heatApproval.id, payload, token),
    onSuccess: onRefresh,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={!canAct || mutation.isPending}
        title={!canAct ? "Only Management, Admin, or Super Admin can put a record on hold." : undefined}
        onClick={() => mutation.mutate({ status: "ON_HOLD", notes: "Clarification requested during heat review." })}
        className="gap-2"
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleQuestion className="h-4 w-4" />}
        Request Clarification
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RejectHeatButton({ heatApproval, token, canAct, onRefresh }: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onRefresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: UpdateHeatApprovalStatusPayload) => HeatApprovalService.updateStatus(heatApproval.id, payload, token),
    onSuccess: onRefresh,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={!canAct || mutation.isPending}
        title={!canAct ? "Only Management, Admin, or Super Admin can reject a heat." : undefined}
        onClick={() => mutation.mutate({ status: "CANCELLED", notes: "Rejected during heat review." })}
        className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
        Reject Heat
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function HeatReview({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const canAct = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const [tab, setTab] = useState<TabKey>("summary");

  const { analyzeStatus, compareStatus, correctionStatus, materialStatus, retestStatus } = chemistryTabStatuses(heatApproval);
  const { tempStatus, ladleStatus } = heatCycleTabStatuses(heatApproval);

  // "Proceed to Approval" is enabled once every screen-2-owned activity
  // (A02-A08) is real-done — i.e. the record's current allowedActions no
  // longer point at any of them, meaning it has already reached A09 and
  // the detail page (see page.tsx) will render the Approval & Tap
  // Authorization screen instead. It has no separate mutation of its own —
  // there's no backend "proceed" action distinct from completing A08 — so
  // clicking it just refetches to move on.
  const allDone = [analyzeStatus, compareStatus, correctionStatus, materialStatus, retestStatus, tempStatus, ladleStatus].every(
    (s) => s === "done",
  );

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          code="P06"
          icon={ClipboardList}
          title="Heat Review"
          subtitle="Review chemistry, temperature, and heat cycle information"
          rightContent={<span className="text-sm text-slate-500 font-medium">Heat ID: {heatApproval.approvalNumber}</span>}
        />
        <ContextSummary heatApproval={heatApproval} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <TabBar active={tab} onChange={setTab} />
            {tab === "summary" && <SummaryTab heatApproval={heatApproval} />}
            {tab === "chemistry" && <ChemistryTab heatApproval={heatApproval} token={token} onRefresh={onRefresh} />}
            {tab === "heat-cycle" && <HeatCycleTab heatApproval={heatApproval} token={token} onRefresh={onRefresh} />}
            {tab === "samples" && <SamplesTab heatApproval={heatApproval} />}
            {tab === "documents" && <DocumentsTab />}

            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <RequestClarificationButton heatApproval={heatApproval} token={token} canAct={canAct} onRefresh={onRefresh} />
                <RejectHeatButton heatApproval={heatApproval} token={token} canAct={canAct} onRefresh={onRefresh} />
              </div>
              <Button
                type="button"
                disabled={!allDone}
                title={!allDone ? "Complete all chemistry and heat cycle steps first." : undefined}
                onClick={onRefresh}
              >
                Proceed to Approval
              </Button>
            </div>
          </div>
          <ScreenSidebar>
            <HeatApprovalProgress heatApproval={heatApproval} />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
