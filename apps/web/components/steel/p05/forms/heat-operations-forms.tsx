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
  HEAT_CYCLE_EVENT_LABELS,
  toOperatorMessage,
} from "@/services/steel-melting.service";
import { FurnaceService, FurnaceLining } from "@/services/steel-furnace.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SaveButton, HelpSection } from "@/components/steel/p05/shared";
import { RepeatableRowTable } from "@/components/steel/p05/RepeatableRowTable";

const MATERIAL_CATEGORIES: HeatChargeMaterialCategory[] = ["SCRAP", "RAW_METAL", "ALLOY", "ADDITIVE", "OTHER"];

// Relocated, unchanged, from the former HeatOperations screen's Sidebar() —
// shown in the on-demand Help popover for A01-A09 instead of a persistent
// sidebar column.
export const OPERATIONS_HELP: { title: string; sections: HelpSection[] } = {
  title: "About Heat Operations",
  sections: [
    {
      heading: "About this workspace",
      body: "Confirm the furnace and charge are ready, load and start the melt, then monitor power and temperature throughout the heat.",
    },
    {
      heading: "What happens next",
      body: "Once monitoring is underway, the record moves on to recording additions, output, and handover to refining.",
    },
    {
      heading: "Tips",
      body: (
        <ul className="space-y-1.5 list-disc pl-4">
          <li>Do not skip the utility check — it protects both safety and the furnace itself.</li>
          <li>Loading cannot proceed until the actual material is confirmed to match the recipe.</li>
          <li>High kWh/tonne is a cost signal worth flagging in the interruptions field.</li>
          <li>An unusually long melting time may indicate a charge or furnace issue.</li>
        </ul>
      ),
    },
  ],
};

// Minimal inline form for registering a new FurnaceLining campaign against
// this heat's furnace, surfaced from the P05-A02 lining picker since there
// was previously no UI for it at all (only the backend POST
// /steel/furnaces/:id/linings endpoint existed). Starting a new lining
// retires the furnace's current active one server-side (FurnaceService.addLining).
function AddLiningInlineForm({
  furnaceId,
  token,
  onCreated,
  onCancel,
}: {
  furnaceId: string;
  token: string;
  onCreated: (lining: FurnaceLining) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [installedAt, setInstalledAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [material, setMaterial] = useState("");
  const [thicknessRemainingMm, setThicknessRemainingMm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      FurnaceService.addLining(
        furnaceId,
        {
          code: code || undefined,
          installedAt: installedAt ? new Date(installedAt).toISOString() : undefined,
          material: material || undefined,
          thicknessRemainingMm: thicknessRemainingMm ? Number(thicknessRemainingMm) : undefined,
        },
        token,
      ),
    onSuccess: onCreated,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 mt-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Lining code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} />
        <Input placeholder="Material (optional)" value={material} onChange={(e) => setMaterial(e.target.value)} />
        <Input
          type="number"
          placeholder="Thickness remaining (mm, optional)"
          value={thicknessRemainingMm}
          onChange={(e) => setThicknessRemainingMm(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          <SaveButton pending={mutation.isPending} label="Save Lining" />
        </Button>
      </div>
    </div>
  );
}

export function LiningCheckForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const [condition, setCondition] = useState("");
  const [liningRefId, setLiningRefId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [heatCount, setHeatCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAddLining, setShowAddLining] = useState(false);

  const furnaceId = melting.furnace?.id;
  const queryClient = useQueryClient();
  const { data: linings, isLoading: liningsLoading } = useQuery({
    queryKey: ["furnace-linings", furnaceId],
    queryFn: () => FurnaceService.getLinings(furnaceId!, token),
    enabled: !!furnaceId,
  });
  const activeLinings = (linings ?? []).filter((l) => l.status === "ACTIVE");

  const mutation = useMutation({
    mutationFn: (payload: FurnaceLiningCheckPayload) => MeltingService.furnaceLiningCheck(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {furnaceId ? (
        <div>
          <label className="text-xs text-slate-400 block mb-0.5">Lining campaign</label>
          <div className="flex items-center gap-2">
            <select
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={liningRefId}
              onChange={(e) => setLiningRefId(e.target.value)}
            >
              <option value="">{liningsLoading ? "Loading linings..." : "Select the active lining..."}</option>
              {activeLinings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code ?? `Installed ${new Date(l.installedAt).toLocaleDateString()} · ${l.heatsCompleted} heats completed`}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setShowAddLining((v) => !v)}>
              + Add New Lining
            </Button>
          </div>
          {activeLinings.length === 0 && !liningsLoading && !showAddLining && (
            <p className="text-xs text-amber-600 mt-1">
              No active lining is registered for this furnace. Use &quot;+ Add New Lining&quot; above, or the free-text fields below.
            </p>
          )}
          {showAddLining && (
            <AddLiningInlineForm
              furnaceId={furnaceId!}
              token={token}
              onCreated={(lining) => {
                queryClient.invalidateQueries({ queryKey: ["furnace-linings", furnaceId] });
                setLiningRefId(lining.id);
                setShowAddLining(false);
              }}
              onCancel={() => setShowAddLining(false)}
            />
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
            reason: editReason,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Confirm lining condition" />
      </Button>
    </div>
  );
}

export function SystemsCheckForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const [water, setWater] = useState(false);
  const [power, setPower] = useState(false);
  const [hydraulic, setHydraulic] = useState(false);
  const [alarms, setAlarms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: FurnaceSystemsCheckPayload) => MeltingService.furnaceSystemsCheck(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
        onClick={() =>
          mutation.mutate({ waterPressureFlowOk: water, powerSystemOk: power, hydraulicSystemOk: hydraulic, alarmsOk: alarms, reason: editReason })
        }
      >
        <SaveButton pending={mutation.isPending} label="Confirm systems ready" />
      </Button>
    </div>
  );
}

export function PreviousHeatForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const [ref, setRef] = useState("");
  const [status, setStatus] = useState("");
  const [delay, setDelay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: PreviousHeatReadinessPayload) => MeltingService.previousHeatReadiness(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
        onClick={() =>
          mutation.mutate({ previousHeatRef: ref || undefined, slagCleaningStatus: status, readinessDelayReason: delay || undefined, reason: editReason })
        }
      >
        <SaveButton pending={mutation.isPending} label="Confirm furnace readiness" />
      </Button>
    </div>
  );
}

export function VerifyChargeForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const [lotRef, setLotRef] = useState("");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: VerifyChargeRecipePayload) => MeltingService.verifyChargeRecipe(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
        onClick={() => mutation.mutate({ materialLotRef: lotRef || undefined, actualWeightVsRecipeOk: ok, reason: editReason })}
      >
        <SaveButton pending={mutation.isPending} label="Verify charge" />
      </Button>
    </div>
  );
}

// P05-A06 — material charges are entered as repeatable rows (each an
// immediate addMaterialCharge call) alongside the existing equipment/
// sequence fields, matching P04's RecipeForm+RecipeTable-in-one-SubStep
// pattern. "Confirm Charge Loaded" (loadCharge) stays a single API call —
// its contract is unchanged — but is gated on >=1 charge row existing.
export function LoadChargeForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const queryClient = useQueryClient();
  const [equipment, setEquipment] = useState("");
  const [sequence, setSequence] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: charges } = useQuery({
    queryKey: ["heat-material-charges", melting.id],
    queryFn: () => MeltingService.getMaterialCharges(melting.id, token),
  });
  const chargeRows = charges ?? [];

  const addCharge = useMutation({
    mutationFn: (payload: AddHeatMaterialChargePayload) => MeltingService.addMaterialCharge(melting.id, payload, token),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["heat-material-charges", melting.id] }),
  });

  const loadMutation = useMutation({
    mutationFn: (payload: LoadChargePayload) => MeltingService.loadCharge(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
  });

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">Material charges</p>
        <RepeatableRowTable
          rows={chargeRows}
          rowKey={(c) => c.id}
          columns={[
            { key: "material", header: "Material", render: (c) => `${c.material}${c.grade ? ` (${c.grade})` : ""}` },
            { key: "category", header: "Category", render: (c) => c.materialCategory },
            { key: "batch", header: "Batch", render: (c) => c.batchRef ?? "—" },
            { key: "planned", header: "Planned", align: "right", render: (c) => c.plannedQuantity ?? "—" },
            { key: "actual", header: "Actual", align: "right", render: (c) => c.actualQuantity },
            { key: "unit", header: "Unit", render: (c) => c.unit },
            { key: "chargedAt", header: "Charged at", render: (c) => new Date(c.chargedAt).toLocaleTimeString() },
          ]}
          fields={[
            { key: "material", type: "text", placeholder: "Material" },
            {
              key: "materialCategory",
              type: "select",
              options: MATERIAL_CATEGORIES.map((c) => ({ value: c, label: c.replace("_", " ") })),
            },
            { key: "grade", type: "text", placeholder: "Grade (optional)" },
            { key: "batchRef", type: "text", placeholder: "Batch/lot (optional)" },
            { key: "plannedQuantity", type: "number", step: "0.01", placeholder: "Planned qty (optional)" },
            { key: "actualQuantity", type: "number", step: "0.01", placeholder: "Actual qty" },
            { key: "unit", type: "text", defaultValue: "MT", placeholder: "Unit" },
          ]}
          submitLabel="Add charge row"
          submitting={addCharge.isPending}
          canSubmit={(v) => !!v.material && !!v.actualQuantity && !!v.unit}
          onSubmit={async (v) => {
            await addCharge.mutateAsync({
              material: v.material,
              materialCategory: v.materialCategory as HeatChargeMaterialCategory,
              grade: v.grade || undefined,
              batchRef: v.batchRef || undefined,
              plannedQuantity: v.plannedQuantity ? Number(v.plannedQuantity) : undefined,
              actualQuantity: Number(v.actualQuantity),
              unit: v.unit,
            });
          }}
        />
      </div>

      <div className="space-y-3 pt-2 border-t">
        <Input placeholder="Loading equipment used (optional)" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        <Input placeholder="Charge sequence (optional)" value={sequence} onChange={(e) => setSequence(e.target.value)} />
        {chargeRows.length === 0 && <p className="text-xs text-amber-600">Add at least one material charge row before confirming the charge is loaded.</p>}
        <Button
          size="sm"
          disabled={chargeRows.length === 0 || loadMutation.isPending}
          onClick={() =>
            loadMutation.mutate({ loadingEquipment: equipment || undefined, chargeSequence: sequence || undefined, reason: editReason })
          }
        >
          <SaveButton pending={loadMutation.isPending} label="Confirm Charge Loaded" />
        </Button>
      </div>
    </div>
  );
}

export function StartMeltingForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: StartMeltingPayload) => MeltingService.startMelting(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Operator (optional)" value={operator} onChange={(e) => setOperator(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ meltingOperator: operator || undefined, reason: editReason })}>
        <SaveButton pending={mutation.isPending} label="Start melting operation" />
      </Button>
    </div>
  );
}

// P05-A08+A09 merged — "Monitor Melt". There is no dedicated power-reading
// HeatCycleEventType in the backend enum, so power entries are logged as
// ADJUSTMENT events with unit "kWh" (a convention scoped to this form, not
// a schema/DTO change) — temperature entries use TEMPERATURE_READING as
// before. The readings table shows every logged event unfiltered (alarms,
// delays, interventions included); the quick-add form only offers the two
// monitoring kinds. "Confirm monitoring complete" calls the existing
// monitorPower then monitorTemperature mutations — unchanged contracts,
// called sequentially because the backend requires A08 before A09 — using
// the most recently logged value of each kind.
const POWER_EVENT_UNIT = "kWh";

export function MonitorMeltForm({
  melting,
  token,
  onDone,
  editReason,
}: {
  melting: SteelMelting;
  token: string;
  onDone: () => void;
  editReason?: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: events } = useQuery({
    queryKey: ["heat-cycle-events", melting.id],
    queryFn: () => MeltingService.getCycleEvents(melting.id, token),
  });
  const eventRows = events ?? [];

  const logEvent = useMutation({
    mutationFn: (payload: RecordHeatCycleEventPayload) => MeltingService.recordCycleEvent(melting.id, payload, token),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["heat-cycle-events", melting.id] }),
  });

  const powerMutation = useMutation({ mutationFn: (payload: MonitorPowerPayload) => MeltingService.monitorPower(melting.id, payload, token) });
  const tempMutation = useMutation({ mutationFn: (payload: MonitorTemperaturePayload) => MeltingService.monitorTemperature(melting.id, payload, token) });
  const confirming = powerMutation.isPending || tempMutation.isPending;

  const latestTempEvent = eventRows
    .filter((e) => e.eventType === "TEMPERATURE_READING" && e.temperatureCelsius !== null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
  const latestPowerEvent = eventRows
    .filter((e) => e.eventType === "ADJUSTMENT" && e.unit === POWER_EVENT_UNIT && e.quantity !== null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];

  const handleConfirm = async () => {
    if (!latestTempEvent || !latestPowerEvent) return;
    setError(null);
    try {
      await powerMutation.mutateAsync({ powerKwh: latestPowerEvent.quantity ?? undefined, reason: editReason });
      await tempMutation.mutateAsync({ temperatureCelsius: latestTempEvent.temperatureCelsius!, reason: editReason });
      onDone();
    } catch (err) {
      setError(toOperatorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">Readings log</p>
        <RepeatableRowTable
          rows={eventRows}
          rowKey={(e) => e.id}
          maxHeightClass="max-h-64 overflow-y-auto"
          columns={[
            { key: "time", header: "Time", render: (e) => new Date(e.occurredAt).toLocaleTimeString() },
            { key: "type", header: "Type", render: (e) => HEAT_CYCLE_EVENT_LABELS[e.eventType] },
            {
              key: "value",
              header: "Value",
              render: (e) => (e.temperatureCelsius !== null ? `${e.temperatureCelsius}°C` : e.quantity !== null ? `${e.quantity}${e.unit ? ` ${e.unit}` : ""}` : "—"),
            },
            { key: "notes", header: "Notes", render: (e) => e.notes ?? "—" },
          ]}
          fields={[
            {
              key: "kind",
              type: "select",
              options: [
                { value: "TEMPERATURE_READING", label: "Temperature Reading" },
                { value: "ADJUSTMENT", label: "Power Reading" },
              ],
              defaultValue: "TEMPERATURE_READING",
            },
            { key: "value", type: "number", step: "0.01", placeholder: "Value (°C or kWh, per kind above)" },
            { key: "notes", type: "text", placeholder: "Notes (optional)" },
          ]}
          submitLabel="Log reading"
          submitting={logEvent.isPending}
          canSubmit={(v) => !!v.value}
          onSubmit={async (v) => {
            const selectedKind = (v.kind as "TEMPERATURE_READING" | "ADJUSTMENT") ?? "TEMPERATURE_READING";
            await logEvent.mutateAsync({
              eventType: selectedKind,
              temperatureCelsius: selectedKind === "TEMPERATURE_READING" ? Number(v.value) : undefined,
              quantity: selectedKind === "ADJUSTMENT" ? Number(v.value) : undefined,
              unit: selectedKind === "ADJUSTMENT" ? POWER_EVENT_UNIT : undefined,
              notes: v.notes || undefined,
            });
          }}
        />
      </div>

      <div className="space-y-2 pt-2 border-t">
        {(!latestTempEvent || !latestPowerEvent) && (
          <p className="text-xs text-amber-600">
            Log at least one temperature reading and one power reading before confirming monitoring is complete.
          </p>
        )}
        <Button size="sm" disabled={!latestTempEvent || !latestPowerEvent || confirming} onClick={handleConfirm}>
          <SaveButton pending={confirming} label="Confirm monitoring complete" />
        </Button>
      </div>
    </div>
  );
}
