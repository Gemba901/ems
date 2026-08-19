"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MeltingService,
  SteelMelting,
  FurnaceLiningCheckPayload,
  FurnaceSystemsCheckPayload,
  PreviousHeatReadinessPayload,
  VerifyChargeRecipePayload,
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
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p05/shared";
import { Flame, Info, ListChecks, Lightbulb } from "lucide-react";

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
            Confirm the furnace, lining, utilities, and previous heat are ready, then verify the released charge and
            recipe before loading.
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
            Once the charge is verified, the record moves on to loading and starting the melt.
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
            <li>Do not skip the utility check — it protects both safety and the furnace itself.</li>
            <li>Loading cannot proceed until the actual material is confirmed to match the recipe.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function LiningCheckForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [condition, setCondition] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [heatCount, setHeatCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: FurnaceLiningCheckPayload) => MeltingService.furnaceLiningCheck(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Lining campaign ID (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
      <Input type="number" placeholder="Heat count since last reline (optional)" value={heatCount} onChange={(e) => setHeatCount(e.target.value)} />
      <Input placeholder="Visual condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
      <Button
        size="sm"
        disabled={!condition || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            liningCampaignId: campaignId || undefined,
            liningHeatCount: heatCount ? Number(heatCount) : undefined,
            liningVisualCondition: condition,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Confirm lining condition" />
      </Button>
    </div>
  );
}

function SystemsCheckForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [water, setWater] = useState(false);
  const [power, setPower] = useState(false);
  const [hydraulic, setHydraulic] = useState(false);
  const [alarms, setAlarms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: FurnaceSystemsCheckPayload) => MeltingService.furnaceSystemsCheck(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={water} onChange={(e) => setWater(e.target.checked)} />
        Cooling water pressure/flow OK
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={power} onChange={(e) => setPower(e.target.checked)} />
        Power system OK
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hydraulic} onChange={(e) => setHydraulic(e.target.checked)} />
        Hydraulic system OK
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={alarms} onChange={(e) => setAlarms(e.target.checked)} />
        Alarms OK
      </label>
      <Button
        size="sm"
        disabled={!water || !power || !hydraulic || !alarms || mutation.isPending}
        onClick={() => mutation.mutate({ waterPressureFlowOk: water, powerSystemOk: power, hydraulicSystemOk: hydraulic, alarmsOk: alarms })}
      >
        <SaveButton pending={mutation.isPending} label="Confirm systems ready" />
      </Button>
    </div>
  );
}

function PreviousHeatForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [ref, setRef] = useState("");
  const [status, setStatus] = useState("");
  const [delay, setDelay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: PreviousHeatReadinessPayload) => MeltingService.previousHeatReadiness(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Previous heat reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
      <Input placeholder="Slag/cleaning status" value={status} onChange={(e) => setStatus(e.target.value)} />
      <Input placeholder="Delay reason (optional)" value={delay} onChange={(e) => setDelay(e.target.value)} />
      <Button
        size="sm"
        disabled={!status || mutation.isPending}
        onClick={() => mutation.mutate({ previousHeatRef: ref || undefined, slagCleaningStatus: status, readinessDelayReason: delay || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Confirm furnace readiness" />
      </Button>
    </div>
  );
}

function VerifyChargeForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [lotRef, setLotRef] = useState("");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: VerifyChargeRecipePayload) => MeltingService.verifyChargeRecipe(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Field label="Charge ID" value={melting.chargeNumberSnapshot} />
      <Input placeholder="Material lot reference (optional)" value={lotRef} onChange={(e) => setLotRef(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        Actual material matches the charge recipe
      </label>
      {!ok && <p className="text-xs text-amber-600">Loading cannot proceed until this is confirmed.</p>}
      <Button
        size="sm"
        disabled={!ok || mutation.isPending}
        onClick={() => mutation.mutate({ materialLotRef: lotRef || undefined, actualWeightVsRecipeOk: ok })}
      >
        <SaveButton pending={mutation.isPending} label="Verify charge" />
      </Button>
    </div>
  );
}

export function S1FurnaceReadiness({
  melting, token, onRefresh,
}: { melting: SteelMelting; token: string; onRefresh: () => void }) {
  const actions = melting.allowedActions ?? [];
  const liningStatus = subStatus(actions.includes("CHECK_LINING"), !!melting.liningVisualCondition);
  const systemsStatus = subStatus(actions.includes("CHECK_UTILITIES"), melting.alarmsOk !== null);
  const previousHeatStatus = subStatus(actions.includes("CHECK_PREVIOUS_HEAT"), !!melting.slagCleaningStatus);
  const verifyStatus = subStatus(actions.includes("VERIFY_CHARGE"), melting.actualWeightVsRecipeOk !== null);

  const statuses = [liningStatus, systemsStatus, previousHeatStatus, verifyStatus];
  const doneCount = 1 + statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");
  const activeIdx = activeRel === -1 ? null : activeRel + 1;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={Flame}
          title="Furnace Readiness & Charge Verification"
          subtitle="Confirm the furnace, utilities, and previous heat are ready, then verify the charge before loading."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[0]} doneCount={doneCount} activeIndex={activeIdx} />
        <ContextSummary melting={melting} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStep
              code="P05-A01"
              title="Furnace Availability Confirmed"
              status="done"
              summary={`Furnace ${melting.furnaceId ?? "—"}${melting.operatorName ? ` · ${melting.operatorName}` : ""}`}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Furnace" value={melting.furnaceId} />
                <Field label="Planned heat" value={melting.plannedHeatRef} />
                <Field label="Operator" value={melting.operatorName} />
                <Field label="Shift" value={melting.shift} />
              </div>
            </SubStep>

            <SubStep
              code="P05-A02"
              title="Furnace Lining Check"
              status={liningStatus}
              summary={melting.liningVisualCondition ? `Condition: ${melting.liningVisualCondition}` : undefined}
            >
              {liningStatus === "active" && <LiningCheckForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A03"
              title="Furnace Systems Check"
              status={systemsStatus}
              summary={melting.alarmsOk !== null ? `Systems ${melting.waterPressureFlowOk && melting.powerSystemOk && melting.hydraulicSystemOk && melting.alarmsOk ? "OK" : "flagged"}` : undefined}
            >
              {systemsStatus === "active" && <SystemsCheckForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A04"
              title="Previous Heat Readiness"
              status={previousHeatStatus}
              summary={melting.slagCleaningStatus ? `Cleaning: ${melting.slagCleaningStatus}` : undefined}
            >
              {previousHeatStatus === "active" && <PreviousHeatForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A05"
              title="Verify Charge ID & Recipe"
              status={verifyStatus}
              summary={melting.actualWeightVsRecipeOk !== null ? `Matches recipe: ${melting.actualWeightVsRecipeOk ? "Yes" : "No"}` : undefined}
            >
              {verifyStatus === "active" && <VerifyChargeForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>
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
