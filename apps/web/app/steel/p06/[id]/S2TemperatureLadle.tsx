"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  HeatApprovalService,
  SteelHeatApproval,
  CheckTemperaturePayload,
  CheckLadleReadinessPayload,
} from "@/services/steel-heat-approval.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { ScreenSidebar } from "@/components/steel/p06/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p06/ContextSummary";
import { HeatApprovalProgress } from "@/components/steel/p06/HeatApprovalProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p06/screenMap";
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p06/shared";
import { Thermometer, Info, ListChecks, Lightbulb } from "lucide-react";

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
            Confirm the liquid steel temperature and check that the ladle is ready and its lining is in good
            condition before approval.
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
            After the ladle is confirmed ready, the record moves on to chemistry and temperature approval.
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
            <li>Do not skip the ladle lining check — it protects both product quality and safety.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function TemperatureForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [temp, setTemp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CheckTemperaturePayload) => HeatApprovalService.checkTemperature(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="1" placeholder="Liquid steel temperature (°C)" value={temp} onChange={(e) => setTemp(e.target.value)} />
      <Button size="sm" disabled={!temp || mutation.isPending} onClick={() => mutation.mutate({ liquidTemperatureCelsius: Number(temp) })}>
        <SaveButton pending={mutation.isPending} label="Record temperature" />
      </Button>
    </div>
  );
}

function LadleReadinessForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [ladleId, setLadleId] = useState("");
  const [condition, setCondition] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CheckLadleReadinessPayload) => HeatApprovalService.checkLadleReadiness(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Ladle ID (optional)" value={ladleId} onChange={(e) => setLadleId(e.target.value)} />
      <Input placeholder="Lining condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} />
        Ladle confirmed ready
      </label>
      {!ready && <p className="text-xs text-amber-600">Approval cannot proceed until the ladle is confirmed ready.</p>}
      <Button
        size="sm"
        disabled={!condition || !ready || mutation.isPending}
        onClick={() => mutation.mutate({ ladleId: ladleId || undefined, ladleLiningCondition: condition, ladleReady: ready })}
      >
        <SaveButton pending={mutation.isPending} label="Confirm ladle readiness" />
      </Button>
    </div>
  );
}

export function S2TemperatureLadle({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const actions = heatApproval.allowedActions ?? [];
  const tempStatus = subStatus(actions.includes("CHECK_TEMPERATURE"), heatApproval.liquidTemperatureCelsius !== null);
  const ladleStatus = subStatus(actions.includes("CHECK_LADLE_READINESS"), heatApproval.ladleReady !== null);

  const statuses = [tempStatus, ladleStatus];
  const doneCount = statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
        code="P06"
          icon={Thermometer}
          title="Temperature & Ladle Readiness"
          subtitle="Check the liquid steel temperature and confirm the ladle is ready before approval."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[1]} doneCount={doneCount} activeIndex={activeRel === -1 ? null : activeRel} activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P06")?.color.bar} />
        <ContextSummary heatApproval={heatApproval} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStep
              code="P06-A07"
              title="Check Liquid Steel Temperature"
              status={tempStatus}
              summary={heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : undefined}
            >
              {tempStatus === "active" && <TemperatureForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P06-A08"
              title="Check Ladle Readiness & Lining Condition"
              status={ladleStatus}
              summary={`Ladle ${heatApproval.ladleId ?? "—"} · Ready: ${heatApproval.ladleReady ? "Yes" : "No"}`}
            >
              {ladleStatus === "active" && <LadleReadinessForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>
          </div>
          <ScreenSidebar>
            <HeatApprovalProgress heatApproval={heatApproval} />
            <Sidebar />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
