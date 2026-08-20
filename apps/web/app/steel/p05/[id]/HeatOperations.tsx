"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MeltingService,
  SteelMelting,
  FurnaceLiningCheckPayload,
  FurnaceSystemsCheckPayload,
  PreviousHeatReadinessPayload,
  VerifyChargeRecipePayload,
  LoadChargePayload,
  StartMeltingPayload,
  MonitorPowerPayload,
  MonitorTemperaturePayload,
  AddHeatMaterialChargePayload,
  RecordHeatCycleEventPayload,
  HeatChargeMaterialCategory,
  HeatCycleEventType,
  HEAT_CYCLE_EVENT_LABELS,
} from "@/services/steel-melting.service";
import { FurnaceService } from "@/services/steel-furnace.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p05/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p05/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p05/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p05/ContextSummary";
import { MeltingProgress } from "@/components/steel/p05/MeltingProgress";
import { HEAT_OPERATIONS_STEPS, HEAT_OPERATIONS_TABS, HeatOperationsTabKey } from "@/components/steel/p05/screenMap";
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p05/shared";
import { Flame, Info, ListChecks, Lightbulb, Layers, Activity } from "lucide-react";

const MATERIAL_CATEGORIES: HeatChargeMaterialCategory[] = ["SCRAP", "RAW_METAL", "ALLOY", "ADDITIVE", "OTHER"];
const EVENT_TYPES = Object.keys(HEAT_CYCLE_EVENT_LABELS) as HeatCycleEventType[];

function Sidebar() {
  return (
    <ScreenSidebar>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            Confirm the furnace and charge are ready, load and start the melt, then monitor power and temperature
            throughout the heat.
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
            Once monitoring is underway, the record moves on to recording additions, output, and handover to
            refining in Review &amp; Release.
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
            <li>High kWh/tonne is a cost signal worth flagging in the interruptions field.</li>
            <li>An unusually long melting time may indicate a charge or furnace issue.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function LiningCheckForm({ melting, token, onDone }: { melting: SteelMelting; token: string; onDone: () => void }) {
  const [condition, setCondition] = useState("");
  const [liningRefId, setLiningRefId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [heatCount, setHeatCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const furnaceId = melting.furnace?.id;
  const { data: linings, isLoading: liningsLoading } = useQuery({
    queryKey: ["furnace-linings", furnaceId],
    queryFn: () => FurnaceService.getLinings(furnaceId!, token),
    enabled: !!furnaceId,
  });
  const activeLinings = (linings ?? []).filter((l) => l.status === "ACTIVE");

  const mutation = useMutation({
    mutationFn: (payload: FurnaceLiningCheckPayload) => MeltingService.furnaceLiningCheck(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {furnaceId ? (
        <div>
          <label className="text-xs text-slate-400 block mb-0.5">Lining campaign</label>
          <select
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={liningRefId}
            onChange={(e) => setLiningRefId(e.target.value)}
          >
            <option value="">{liningsLoading ? "Loading linings..." : "Select the active lining..."}</option>
            {activeLinings.map((l) => (
              <option key={l.id} value={l.id}>
                Installed {new Date(l.installedAt).toLocaleDateString()} · {l.heatsCompleted} heats completed
              </option>
            ))}
          </select>
          {activeLinings.length === 0 && !liningsLoading && (
            <p className="text-xs text-amber-600 mt-1">
              No active lining is registered for this furnace. Record a new lining campaign in furnace master data,
              or use the free-text fields below.
            </p>
          )}
        </div>
      ) : (
        <Input placeholder="Lining campaign ID (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
      )}
      <Input type="number" placeholder="Heat count since last reline (optional)" value={heatCount} onChange={(e) => setHeatCount(e.target.value)} />
      <Input placeholder="Visual condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
      <Button
        size="sm"
        disabled={!condition || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            liningRefId: liningRefId || undefined,
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

function MaterialChargesPanel({ melting, token }: { melting: SteelMelting; token: string }) {
  const queryClient = useQueryClient();
  const [material, setMaterial] = useState("");
  const [category, setCategory] = useState<HeatChargeMaterialCategory>("SCRAP");
  const [grade, setGrade] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [unit, setUnit] = useState("MT");
  const [error, setError] = useState<string | null>(null);

  const { data: charges } = useQuery({
    queryKey: ["heat-material-charges", melting.id],
    queryFn: () => MeltingService.getMaterialCharges(melting.id, token),
  });

  const mutation = useMutation({
    mutationFn: (payload: AddHeatMaterialChargePayload) => MeltingService.addMaterialCharge(melting.id, payload, token),
    onSuccess: () => {
      setMaterial("");
      setGrade("");
      setBatchRef("");
      setPlannedQty("");
      setActualQty("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["heat-material-charges", melting.id] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const canAdd = !!material && !!actualQty && !!unit;
  const isClosed = melting.status === "CANCELLED" || melting.status === "CLOSED" || melting.status === "ON_HOLD";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-slate-500" />
          Material Charges
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(charges ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Material</th>
                  <th className="py-1 pr-2">Category</th>
                  <th className="py-1 pr-2">Batch</th>
                  <th className="py-1 pr-2 text-right">Planned</th>
                  <th className="py-1 pr-2 text-right">Actual</th>
                  <th className="py-1 pr-2">Unit</th>
                  <th className="py-1 pr-2">Charged at</th>
                </tr>
              </thead>
              <tbody>
                {(charges ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-1 pr-2 text-slate-400">{c.sequence}</td>
                    <td className="py-1 pr-2 font-medium text-slate-700">{c.material}{c.grade ? ` (${c.grade})` : ""}</td>
                    <td className="py-1 pr-2">{c.materialCategory}</td>
                    <td className="py-1 pr-2">{c.batchRef ?? "—"}</td>
                    <td className="py-1 pr-2 text-right">{c.plannedQuantity ?? "—"}</td>
                    <td className="py-1 pr-2 text-right">{c.actualQuantity}</td>
                    <td className="py-1 pr-2">{c.unit}</td>
                    <td className="py-1 pr-2 text-slate-400">{new Date(c.chargedAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isClosed && (
          <div className="space-y-2 pt-2 border-t">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Input placeholder="Material" value={material} onChange={(e) => setMaterial(e.target.value)} />
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as HeatChargeMaterialCategory)}
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
              <Input placeholder="Grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
              <Input placeholder="Batch/lot (optional)" value={batchRef} onChange={(e) => setBatchRef(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Planned qty (optional)" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Actual qty" value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
              <Input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!canAdd || mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  material,
                  materialCategory: category,
                  grade: grade || undefined,
                  batchRef: batchRef || undefined,
                  plannedQuantity: plannedQty ? Number(plannedQty) : undefined,
                  actualQuantity: Number(actualQty),
                  unit,
                })
              }
            >
              <SaveButton pending={mutation.isPending} label="Add charge row" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HeatEventsPanel({ melting, token, filterType }: { melting: SteelMelting; token: string; filterType?: HeatCycleEventType }) {
  const queryClient = useQueryClient();
  const [eventType, setEventType] = useState<HeatCycleEventType>(filterType ?? "TEMPERATURE_READING");
  const [temperature, setTemperature] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: events } = useQuery({
    queryKey: ["heat-cycle-events", melting.id],
    queryFn: () => MeltingService.getCycleEvents(melting.id, token),
  });

  const mutation = useMutation({
    mutationFn: (payload: RecordHeatCycleEventPayload) => MeltingService.recordCycleEvent(melting.id, payload, token),
    onSuccess: () => {
      setTemperature("");
      setQuantity("");
      setNotes("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["heat-cycle-events", melting.id] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const isClosed = melting.status === "CANCELLED" || melting.status === "CLOSED" || melting.status === "ON_HOLD";
  const visibleEvents = filterType ? (events ?? []).filter((e) => e.eventType === filterType) : (events ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-slate-500" />
          {filterType ? "Temperature Readings" : "Heat Timeline"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleEvents.length > 0 && (
          <ul className="space-y-1.5 text-xs max-h-64 overflow-y-auto">
            {visibleEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-2 border-b border-slate-100 pb-1.5">
                <span className="text-slate-400 shrink-0 w-16">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                <span className="font-medium text-slate-700 shrink-0">{HEAT_CYCLE_EVENT_LABELS[e.eventType]}</span>
                {e.temperatureCelsius !== null && <span className="text-slate-500">{e.temperatureCelsius}°C</span>}
                {e.quantity !== null && <span className="text-slate-500">{e.quantity}{e.unit ? ` ${e.unit}` : ""}</span>}
                {e.notes && <span className="text-slate-500 truncate">{e.notes}</span>}
              </li>
            ))}
          </ul>
        )}
        {visibleEvents.length === 0 && <p className="text-xs text-slate-400">No events logged yet.</p>}

        {!isClosed && (
          <div className="space-y-2 pt-2 border-t">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filterType ? (
                <input type="hidden" value={filterType} />
              ) : (
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as HeatCycleEventType)}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{HEAT_CYCLE_EVENT_LABELS[t]}</option>
                  ))}
                </select>
              )}
              <Input type="number" step="1" placeholder="Temp °C (optional)" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Qty (optional)" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  eventType: filterType ?? eventType,
                  temperatureCelsius: temperature ? Number(temperature) : undefined,
                  quantity: quantity ? Number(quantity) : undefined,
                  notes: notes || undefined,
                })
              }
            >
              <SaveButton pending={mutation.isPending} label="Log event" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HeatOperations({
  melting, token, onRefresh,
}: { melting: SteelMelting; token: string; onRefresh: () => void }) {
  const [tab, setTab] = useState<HeatOperationsTabKey>("overview");
  const actions = melting.allowedActions ?? [];

  const liningStatus = subStatus(actions.includes("CHECK_LINING"), !!melting.liningVisualCondition);
  const systemsStatus = subStatus(actions.includes("CHECK_UTILITIES"), melting.alarmsOk !== null);
  const previousHeatStatus = subStatus(actions.includes("CHECK_PREVIOUS_HEAT"), !!melting.slagCleaningStatus);
  const verifyStatus = subStatus(actions.includes("VERIFY_CHARGE"), melting.actualWeightVsRecipeOk !== null);
  const loadStatus = subStatus(actions.includes("LOAD_CHARGE"), !!melting.loadingTime);
  const startStatus = subStatus(actions.includes("START_MELTING"), !!melting.meltingStartTime);
  const powerStatus = subStatus(actions.includes("MONITOR_POWER"), melting.powerKwh !== null);
  const tempStatus = subStatus(actions.includes("MONITOR_TEMPERATURE"), melting.temperatureCelsius !== null);

  const statuses = [liningStatus, systemsStatus, previousHeatStatus, verifyStatus, loadStatus, startStatus, powerStatus, tempStatus];
  const doneCount = 1 + statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");
  const activeIdx = activeRel === -1 ? null : activeRel + 1;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={Flame}
          title="Heat Input / Operations"
          subtitle="Confirm readiness, load and start the melt, and monitor power and temperature — one workspace for the whole heat cycle."
        />
        <WorkflowIndicator steps={HEAT_OPERATIONS_STEPS} doneCount={doneCount} activeIndex={activeIdx} />
        <ContextSummary melting={melting} />

        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200">
          {HEAT_OPERATIONS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors " +
                (tab === t.key ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {tab === "overview" && (
              <>
                <SubStep
                  code="P05-A01"
                  title="Furnace Availability Confirmed"
                  status="done"
                  summary={`Furnace ${melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : (melting.furnaceId ?? "—")}${melting.operatorName ? ` · ${melting.operatorName}` : ""}`}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Furnace" value={melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : melting.furnaceId} />
                    <Field label="Planned heat" value={melting.plannedHeatRef} />
                    <Field label="Operator" value={melting.operatorName} />
                    <Field label="Shift" value={melting.shift} />
                  </div>
                </SubStep>

                <SubStep
                  code="P05-A02"
                  title="Furnace Lining Check"
                  status={liningStatus}
                  summary={
                    melting.liningVisualCondition
                      ? `Condition: ${melting.liningVisualCondition}${melting.lining ? ` · ${melting.lining.heatsCompleted} heats on this lining` : ""}`
                      : undefined
                  }
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
              </>
            )}

            {tab === "materials" && (
              <>
                <SubStep
                  code="P05-A05"
                  title="Verify Charge ID & Recipe"
                  status={verifyStatus}
                  summary={melting.actualWeightVsRecipeOk !== null ? `Matches recipe: ${melting.actualWeightVsRecipeOk ? "Yes" : "No"}` : undefined}
                >
                  {verifyStatus === "active" && <VerifyChargeForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <SubStep
                  code="P05-A06"
                  title="Load Charge into Furnace"
                  status={loadStatus}
                  summary={melting.loadingTime ? `Loaded ${new Date(melting.loadingTime).toLocaleString()}` : undefined}
                >
                  {loadStatus === "active" && <LoadChargeForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>

                <MaterialChargesPanel melting={melting} token={token} />
              </>
            )}

            {tab === "temperature" && (
              <>
                <SubStep
                  code="P05-A09"
                  title="Monitor Melting Time & Temperature"
                  status={tempStatus}
                  summary={melting.temperatureCelsius !== null ? `${melting.temperatureCelsius} °C` : undefined}
                >
                  {tempStatus === "active" && <TemperatureForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>
                <HeatEventsPanel melting={melting} token={token} filterType="TEMPERATURE_READING" />
              </>
            )}

            {tab === "power" && (
              <SubStep
                code="P05-A08"
                title="Monitor Power Consumption"
                status={powerStatus}
                summary={melting.powerKwh !== null ? `${melting.powerKwh} kWh` : undefined}
              >
                {powerStatus === "active" && <PowerForm melting={melting} token={token} onDone={onRefresh} />}
              </SubStep>
            )}

            {tab === "events" && (
              <>
                <SubStep
                  code="P05-A07"
                  title="Start Melting Operation"
                  status={startStatus}
                  summary={melting.meltingStartTime ? `Started ${new Date(melting.meltingStartTime).toLocaleString()}` : undefined}
                >
                  {startStatus === "active" && <StartMeltingForm melting={melting} token={token} onDone={onRefresh} />}
                </SubStep>
                <HeatEventsPanel melting={melting} token={token} />
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
