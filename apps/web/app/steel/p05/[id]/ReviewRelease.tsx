"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  MeltingService,
  SteelMelting,
  RecordAdditionsPayload,
  RemoveSlagPayload,
  RecordMeltOutputPayload,
  ConfirmLiquidReadyPayload,
  RefiningHandoverPayload,
} from "@/services/steel-melting.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p05/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p05/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p05/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p05/ContextSummary";
import { MeltingProgress } from "@/components/steel/p05/MeltingProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p05/screenMap";
import { Field, SubStep, SaveButton, subStatus, SubStepStatus } from "@/components/steel/p05/shared";
import { HeatCycleDocument } from "@/components/steel/p05/HeatCycleDocument";
import { ShieldCheck, Info, ListChecks, Lightbulb, Lock, Send, CheckCircle2, Loader2, Gauge, ClipboardCheck, FileText } from "lucide-react";

const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

function Sidebar() {
  return (
    <ScreenSidebar>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            Record any additions and slag removal, log the melt output, confirm the liquid steel is ready, review the
            heat cycle, then hand it over to refining/quality.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-purple-600" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            The refining handover completes this melting record. There is no further step after that in this
            module.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            <li>If no extra material was added, you can proceed without recording an addition.</li>
            <li>Only Management, Admin, or Super Admin can hand the record over to refining.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function AdditionsForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordAdditionsPayload) => MeltingService.recordAdditions(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const hasAddition = !!item && !!qty;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">If nothing needs to be added, save with no items to continue.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="Item (optional)" value={item} onChange={(e) => setItem(e.target.value)} />
        <Input type="number" step="0.001" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            additions: hasAddition ? [{ itemName: item, quantity: Number(qty), reason: reason || undefined }] : undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label={hasAddition ? "Record addition" : "No additions — continue"} />
      </Button>
    </div>
  );
}

function SlagForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [notApplicable, setNotApplicable] = useState(false);
  const [qty, setQty] = useState("");
  const [issue, setIssue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RemoveSlagPayload) => MeltingService.removeSlag(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notApplicable} onChange={(e) => setNotApplicable(e.target.checked)} />
        Slag removal not applicable
      </label>
      {!notApplicable && (
        <>
          <Input type="number" step="0.01" placeholder="Estimated quantity (optional)" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Input placeholder="Issue found (optional)" value={issue} onChange={(e) => setIssue(e.target.value)} />
        </>
      )}
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            slagNotApplicable: notApplicable,
            slagQuantityEstimate: !notApplicable && qty ? Number(qty) : undefined,
            slagIssueFound: !notApplicable ? issue || undefined : undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Save slag removal" />
      </Button>
    </div>
  );
}

function OutputForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [weight, setWeight] = useState("");
  const [meltTime, setMeltTime] = useState("");
  const [energy, setEnergy] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordMeltOutputPayload) => MeltingService.recordMeltOutput(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="0.001" placeholder="Output weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step="0.1" placeholder="Melt time (minutes, optional)" value={meltTime} onChange={(e) => setMeltTime(e.target.value)} />
        <Input type="number" step="0.01" placeholder="Total energy (kWh, optional)" value={energy} onChange={(e) => setEnergy(e.target.value)} />
      </div>
      <Input placeholder="Additions summary (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <Button
        size="sm"
        disabled={!weight || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            outputWeightTonnes: Number(weight),
            outputMeltTimeMinutes: meltTime ? Number(meltTime) : undefined,
            outputEnergyTotalKwh: energy ? Number(energy) : undefined,
            outputAdditionsSummary: summary || undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Record melting output" />
      </Button>
    </div>
  );
}

function ConfirmReadyForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [temp, setTemp] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmLiquidReadyPayload) => MeltingService.confirmLiquidReady(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="1" placeholder="Liquid temperature (°C, optional)" value={temp} onChange={(e) => setTemp(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Operator confirms liquid steel is ready for sample/refining
      </label>
      {!confirmed && <p className="text-xs text-amber-600">Confirm readiness to unlock the refining handover.</p>}
      <Button
        size="sm"
        disabled={!confirmed || mutation.isPending}
        onClick={() => mutation.mutate({ liquidReady: confirmed, liquidTemperatureCelsius: temp ? Number(temp) : undefined, liquidOperatorConfirmed: confirmed })}
      >
        <SaveButton pending={mutation.isPending} label="Confirm liquid steel ready" />
      </Button>
    </div>
  );
}

function HandoverLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin can hand this melting record over to refining. Ask a Management
            or Admin user to complete this step.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmHandoverModal({
  melting, onConfirm, onCancel, submitting,
}: { melting: SteelMelting; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Send className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Hand over to refining?</h2>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
          <Field label="Heat-in-Process No." value={melting.heatInProcessNumber} />
          <Field label="Output weight" value={melting.outputWeightTonnes !== null ? `${melting.outputWeightTonnes} t` : null} />
        </div>
        <p className="text-sm text-slate-500">
          This closes the melting record and hands it to refining/quality for chemistry correction. It cannot be
          undone from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-red-600 hover:bg-red-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hand Over to Refining"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HandoverPanel({
  melting, token, canAct, onDone,
}: { melting: SteelMelting; token: string; canAct: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RefiningHandoverPayload) => MeltingService.refiningHandover(melting.id, payload, token),
    onSuccess: () => {
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canAct) return <HandoverLockedCard />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Handover notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
        <Send className="h-4 w-4" />
        Hand Over to Refining
      </Button>
      {confirming && (
        <ConfirmHandoverModal
          melting={melting}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ notes: notes || undefined })}
        />
      )}
    </div>
  );
}

// Material balance + cycle performance — stored measurements plus
// server-computed derived metrics only (getHeatSummary). Metrics the backend
// doesn't compute (no business-confirmed formula yet, e.g. energy/tonne) are
// shown as "Not available" rather than silently omitted or guessed at.
function HeatSummaryPanel({ melting, token }: { melting: SteelMelting; token: string }) {
  const { data: summary } = useQuery({
    queryKey: ["heat-summary", melting.id],
    queryFn: () => MeltingService.getHeatSummary(melting.id, token),
  });

  if (!summary) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-slate-500" />
            Material Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Field label="Planned input" value={`${summary.totalMaterialInput} (mixed units)`} />
          <Field label="Actual output" value={summary.totalOutputTonnes !== null ? `${summary.totalOutputTonnes} t` : null} />
          <Field label="Material loss" value={summary.materialLossTonnes !== null ? summary.materialLossTonnes.toFixed(2) : null} />
          <Field label="Yield %" value={summary.yieldPercent !== null ? `${summary.yieldPercent.toFixed(1)}%` : "Not available"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-slate-500" />
            Cycle Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Field label="Cycle duration" value={summary.cycleDurationMinutes !== null ? `${Math.round(summary.cycleDurationMinutes)} min` : null} />
          <Field label="Material additions" value={summary.materialAdditionsCount} />
          <Field label="Events logged" value={summary.eventsCount} />
          <Field label="Energy / tonne" value="Not available — formula not yet defined" />
          <Field label="Lining heats completed" value={summary.lining ? summary.lining.heatsCompleted : null} />
        </CardContent>
      </Card>
    </>
  );
}

// Compact readiness rollup so operators see what's outstanding without
// re-confirming already-completed steps — derived from the same
// subStatus() the SubStep cards below already use.
function ReadinessPanel({ items }: { items: { code: string; label: string; status: SubStepStatus }[] }) {
  const doneCount = items.filter((i) => i.status === "done").length;
  const ready = doneCount === items.length;

  return (
    <Card className={ready ? "border-emerald-200" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardCheck className={"h-4 w-4 " + (ready ? "text-emerald-600" : "text-slate-500")} />
          Completion Readiness — {doneCount} of {items.length} complete
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
          {items.map((i) => (
            <li key={i.code} className="flex items-center gap-2">
              {i.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : i.status === "active" ? (
                <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 ml-1 mr-1" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              )}
              <span className={i.status === "locked" ? "text-slate-400" : "text-slate-700"}>{i.label}</span>
            </li>
          ))}
        </ul>
        {!ready && <p className="text-xs text-amber-600 mt-3">Not yet ready for release — complete the outstanding items above.</p>}
      </CardContent>
    </Card>
  );
}

function ClosedState({ melting, token }: { melting: SteelMelting; token: string }) {
  return (
    <div className="space-y-4">
      <Card className="border-emerald-200">
        <CardContent className="py-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Handed Over to Refining</h2>
            <p className="text-sm text-slate-500 mt-1">{melting.heatInProcessNumber} is now closed.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-xl mx-auto text-left">
            <Field label="Output weight" value={melting.outputWeightTonnes !== null ? `${melting.outputWeightTonnes} t` : null} />
            <Field label="Liquid temperature" value={melting.liquidTemperatureCelsius !== null ? `${melting.liquidTemperatureCelsius} °C` : null} />
            <Field label="Handed over at" value={melting.handoverToRefiningAt ? new Date(melting.handoverToRefiningAt).toLocaleString() : null} />
          </div>
        </CardContent>
      </Card>
      <HeatSummaryPanel melting={melting} token={token} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-slate-500" />
            Heat Cycle Document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HeatCycleDocument melting={melting} token={token} />
        </CardContent>
      </Card>
    </div>
  );
}

export function ReviewRelease({
  melting, token, onRefresh,
}: { melting: SteelMelting; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const canAct = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = melting.allowedActions ?? [];
  const closed = melting.status === "CLOSED";

  const additionsStatus = subStatus(actions.includes("RECORD_ADDITIONS"), melting.additions !== null);
  const slagStatus = subStatus(actions.includes("REMOVE_SLAG"), melting.slagNotApplicable !== null || !!melting.slagRemovalTime);
  const outputStatus = subStatus(actions.includes("RECORD_OUTPUT"), melting.outputWeightTonnes !== null);
  const readyStatus = subStatus(actions.includes("CONFIRM_READY"), melting.liquidReady !== null);
  const handoverStatus = subStatus(actions.includes("REFINING_HANDOVER"), closed);

  const statuses = [additionsStatus, slagStatus, outputStatus, readyStatus, handoverStatus];
  const doneCount = closed ? 5 : statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");

  const readinessItems = [
    { code: "A10", label: "Additions Recorded", status: additionsStatus },
    { code: "A11", label: "Slag Removed", status: slagStatus },
    { code: "A12", label: "Output Recorded", status: outputStatus },
    { code: "A13", label: "Liquid Steel Ready", status: readyStatus },
    { code: "A14", label: "Handed Over to Refining", status: handoverStatus },
  ];

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={ShieldCheck}
          title="Review, Complete & Release"
          subtitle="Review the heat cycle, record additions, slag removal, and output, confirm readiness, and hand over to refining."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[2]} doneCount={doneCount} activeIndex={closed ? null : activeRel === -1 ? null : activeRel} />
        <ContextSummary melting={melting} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {closed ? (
              <ClosedState melting={melting} token={token} />
            ) : (
              <>
                <ReadinessPanel items={readinessItems} />
                <HeatSummaryPanel melting={melting} token={token} />

                <SubStep
                  code="P05-A10"
                  title="Record Extra Material Additions"
                  status={additionsStatus}
                  summary={melting.additions?.length ? `${melting.additions.length} addition(s)` : "None"}
                >
                  {additionsStatus === "active" && <AdditionsForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <SubStep
                  code="P05-A11"
                  title="Remove Slag or Unwanted Material"
                  status={slagStatus}
                  summary={`Slag removal ${melting.slagNotApplicable ? "not applicable" : "recorded"}`}
                >
                  {slagStatus === "active" && <SlagForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <SubStep
                  code="P05-A12"
                  title="Record Melting Output"
                  status={outputStatus}
                  summary={melting.outputWeightTonnes !== null ? `Output ${melting.outputWeightTonnes} t` : undefined}
                >
                  {outputStatus === "active" && <OutputForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <SubStep
                  code="P05-A13"
                  title="Confirm Liquid Steel Ready"
                  status={readyStatus}
                  summary={melting.liquidReady !== null ? `Ready: ${melting.liquidReady ? "Yes" : "No"}` : undefined}
                >
                  {readyStatus === "active" && <ConfirmReadyForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <Send className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Final Refining Handover / Authority Gate</p>
                  </div>
                  <SubStep code="P05-A14" title="Handover to Refining/Quality" status={handoverStatus}>
                    {handoverStatus === "active" && <HandoverPanel melting={melting} token={token} canAct={canAct} onDone={onRefresh} />}
                  </SubStep>
                </div>
              </>
            )}
          </div>
          <ScreenSidebar>
            <MeltingProgress melting={melting} />
            <Sidebar />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
