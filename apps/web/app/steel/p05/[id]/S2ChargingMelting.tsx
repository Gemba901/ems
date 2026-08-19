"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MeltingService,
  SteelMelting,
  LoadChargePayload,
  StartMeltingPayload,
  MonitorPowerPayload,
  MonitorTemperaturePayload,
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
            Load the verified charge, start melting, and monitor power and temperature throughout the heat.
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
            After monitoring, the record moves on to recording any additions and closing out the melt.
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
            <li>High kWh/tonne is a cost signal worth flagging in the interruptions field.</li>
            <li>An unusually long melting time may indicate a charge or furnace issue.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function LoadChargeForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [equipment, setEquipment] = useState("");
  const [sequence, setSequence] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: LoadChargePayload) => MeltingService.loadCharge(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Loading equipment used (optional)" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      <Input placeholder="Charge sequence (optional)" value={sequence} onChange={(e) => setSequence(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ loadingEquipment: equipment || undefined, chargeSequence: sequence || undefined })}>
        <SaveButton pending={mutation.isPending} label="Load charge into furnace" />
      </Button>
    </div>
  );
}

function StartMeltingForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: StartMeltingPayload) => MeltingService.startMelting(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Operator (optional)" value={operator} onChange={(e) => setOperator(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ meltingOperator: operator || undefined })}>
        <SaveButton pending={mutation.isPending} label="Start melting operation" />
      </Button>
    </div>
  );
}

function PowerForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [kwh, setKwh] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [interruptions, setInterruptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: MonitorPowerPayload) => MeltingService.monitorPower(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="0.01" placeholder="Power consumption (kWh)" value={kwh} onChange={(e) => setKwh(e.target.value)} />
      <Input type="number" step="0.1" placeholder="Elapsed time (minutes, optional)" value={elapsed} onChange={(e) => setElapsed(e.target.value)} />
      <Input placeholder="Power interruptions (optional)" value={interruptions} onChange={(e) => setInterruptions(e.target.value)} />
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ powerKwh: kwh ? Number(kwh) : undefined, powerElapsedMinutes: elapsed ? Number(elapsed) : undefined, powerInterruptions: interruptions || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Record power monitoring" />
      </Button>
    </div>
  );
}

function TemperatureForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [temp, setTemp] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [delay, setDelay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: MonitorTemperaturePayload) => MeltingService.monitorTemperature(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="1" placeholder="Temperature (°C)" value={temp} onChange={(e) => setTemp(e.target.value)} />
      <Input type="number" step="0.1" placeholder="Elapsed time (minutes, optional)" value={elapsed} onChange={(e) => setElapsed(e.target.value)} />
      <Input placeholder="Delay reason (optional)" value={delay} onChange={(e) => setDelay(e.target.value)} />
      <Button
        size="sm"
        disabled={!temp || mutation.isPending}
        onClick={() => mutation.mutate({ temperatureCelsius: Number(temp), temperatureElapsedMinutes: elapsed ? Number(elapsed) : undefined, temperatureDelayReason: delay || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Record temperature monitoring" />
      </Button>
    </div>
  );
}

export function S2ChargingMelting({
  melting, token, onRefresh,
}: { melting: SteelMelting; token: string; onRefresh: () => void }) {
  const actions = melting.allowedActions ?? [];
  const loadStatus = subStatus(actions.includes("LOAD_CHARGE"), !!melting.loadingTime);
  const startStatus = subStatus(actions.includes("START_MELTING"), !!melting.meltingStartTime);
  const powerStatus = subStatus(actions.includes("MONITOR_POWER"), melting.powerKwh !== null);
  const tempStatus = subStatus(actions.includes("MONITOR_TEMPERATURE"), melting.temperatureCelsius !== null);

  const statuses = [loadStatus, startStatus, powerStatus, tempStatus];
  const doneCount = statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={Thermometer}
          title="Charging & Melting Operation"
          subtitle="Load the charge, start melting, and monitor power and temperature."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[1]} doneCount={doneCount} activeIndex={activeRel === -1 ? null : activeRel} />
        <ContextSummary melting={melting} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStep
              code="P05-A06"
              title="Load Charge into Furnace"
              status={loadStatus}
              summary={melting.loadingTime ? `Loaded ${new Date(melting.loadingTime).toLocaleString()}` : undefined}
            >
              {loadStatus === "active" && <LoadChargeForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A07"
              title="Start Melting Operation"
              status={startStatus}
              summary={melting.meltingStartTime ? `Started ${new Date(melting.meltingStartTime).toLocaleString()}` : undefined}
            >
              {startStatus === "active" && <StartMeltingForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A08"
              title="Monitor Power Consumption"
              status={powerStatus}
              summary={melting.powerKwh !== null ? `${melting.powerKwh} kWh` : undefined}
            >
              {powerStatus === "active" && <PowerForm melting={melting} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P05-A09"
              title="Monitor Melting Time & Temperature"
              status={tempStatus}
              summary={melting.temperatureCelsius !== null ? `${melting.temperatureCelsius} °C` : undefined}
            >
              {tempStatus === "active" && <TemperatureForm melting={melting} token={token} onDone={onRefresh} />}
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
