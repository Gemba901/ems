"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Role } from "@/types/role";
import {
  MeltingService,
  SteelMelting,
  MeltingAddition,
  RecordAdditionsPayload,
  RemoveSlagPayload,
  RecordMeltOutputPayload,
  ConfirmLiquidReadyPayload,
  RefiningHandoverPayload,
  toOperatorMessage,
} from "@/services/steel-melting.service";
import { ListOrdered } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SaveButton, SubStepStatus, HelpSection } from "@/components/steel/p05/shared";
import { RepeatableRowTable } from "@/components/steel/p05/RepeatableRowTable";
import { Lock, Send, CheckCircle2, Loader2, Gauge, ClipboardCheck } from "lucide-react";

export const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// Relocated, unchanged, from the former ReviewRelease screen's Sidebar() —
// shown in the on-demand Help popover for A10-A14 instead of a persistent
// sidebar column.
export const REVIEW_RELEASE_HELP: { title: string; sections: HelpSection[] } = {
  title: "About Review & Release",
  sections: [
    {
      heading: "About this step",
      body: "Record any additions and slag removal, log the melt output, confirm the liquid steel is ready, review the heat cycle, then hand it over to refining/quality.",
    },
    {
      heading: "What happens next",
      body: "The refining handover completes this melting record. There is no further step after that in this module.",
    },
    {
      heading: "Tips",
      body: (
        <ul className="space-y-1.5 list-disc pl-4">
          <li>If no extra material was added, you can proceed without recording an addition.</li>
          <li>Only Management, Admin, or Super Admin can hand the record over to refining.</li>
        </ul>
      ),
    },
  ],
};

// P05-A10 — same repeatable-row-table treatment as material charges
// (P05-A06) and melt readings (P05-A08+A09), but recordAdditions is a
// single-shot call that replaces the whole additions array rather than a
// per-row create endpoint — so RepeatableRowTable's onSubmit here just
// appends to a local buffer, and a separate "Save" button below persists
// the buffer in one recordAdditions call. Zero additions stays a valid,
// explicit choice via that same button.
export function AdditionsForm({
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
  const [items, setItems] = useState<(MeltingAddition & { rowId: string })[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordAdditionsPayload) => MeltingService.recordAdditions(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
  });

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">If nothing needs to be added, save with no items to continue.</p>

      <RepeatableRowTable
        rows={items}
        rowKey={(i) => i.rowId}
        emptyLabel="No additions added."
        columns={[
          { key: "item", header: "Item", render: (i) => i.itemName },
          { key: "quantity", header: "Quantity", align: "right", render: (i) => i.quantity },
          { key: "reason", header: "Reason", render: (i) => i.reason ?? "—" },
        ]}
        fields={[
          { key: "itemName", type: "text", placeholder: "Item" },
          { key: "quantity", type: "number", step: "0.001", placeholder: "Quantity" },
          { key: "reason", type: "text", placeholder: "Reason (optional)" },
        ]}
        submitLabel="Add addition row"
        canSubmit={(v) => !!v.itemName && !!v.quantity}
        onSubmit={(v) => {
          setItems((prev) => [
            ...prev,
            { rowId: `${Date.now()}-${prev.length}`, itemName: v.itemName, quantity: Number(v.quantity), reason: v.reason || undefined },
          ]);
        }}
      />

      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            additions: items.length > 0 ? items.map(({ rowId: _rowId, ...addition }) => addition) : undefined,
            editReason,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label={items.length > 0 ? "Record additions" : "No additions — continue"} />
      </Button>
    </div>
  );
}

export function SlagForm({
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
  const [notApplicable, setNotApplicable] = useState(false);
  const [qty, setQty] = useState("");
  const [issue, setIssue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RemoveSlagPayload) => MeltingService.removeSlag(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
            reason: editReason,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Save slag removal" />
      </Button>
    </div>
  );
}

export function OutputForm({
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
  const [weight, setWeight] = useState("");
  const [meltTime, setMeltTime] = useState("");
  const [energy, setEnergy] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordMeltOutputPayload) => MeltingService.recordMeltOutput(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
            reason: editReason,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Record melting output" />
      </Button>
    </div>
  );
}

export function ConfirmReadyForm({
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
  const [temp, setTemp] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmLiquidReadyPayload) => MeltingService.confirmLiquidReady(melting.id, payload, token),
    onSuccess: onDone,
    onError: (err: unknown) => setError(toOperatorMessage(err)),
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
        onClick={() =>
          mutation.mutate({
            liquidReady: confirmed,
            liquidTemperatureCelsius: temp ? Number(temp) : undefined,
            liquidOperatorConfirmed: confirmed,
            reason: editReason,
          })
        }
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

export function HandoverPanel({
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
    onError: (err: unknown) => {
      setError(toOperatorMessage(err));
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
export function HeatSummaryPanel({ melting, token }: { melting: SteelMelting; token: string }) {
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

// Full HeatMaterialCharge row log (P05-A06 initial charge through P05-A10
// additions) — every charge row, not just the aggregate totalMaterialInput
// figure already shown in Material Balance above. Backed by the existing
// GET /steel/melting/:id/material-charges endpoint (MeltingService.getMaterialCharges
// on the API), which already returns the full row list — no new endpoint
// needed.
export function MaterialChargeLog({ melting, token }: { melting: SteelMelting; token: string }) {
  const { data: charges, isLoading } = useQuery({
    queryKey: ["heat-material-charges", melting.id],
    queryFn: () => MeltingService.getMaterialCharges(melting.id, token),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListOrdered className="h-4 w-4 text-slate-500" />
          Material Charge Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : !charges || charges.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-2">No material charge rows recorded for this heat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="font-medium py-1.5 pr-3">#</th>
                  <th className="font-medium py-1.5 pr-3">Material</th>
                  <th className="font-medium py-1.5 pr-3">Category</th>
                  <th className="font-medium py-1.5 pr-3">Grade</th>
                  <th className="font-medium py-1.5 pr-3">Batch Ref</th>
                  <th className="font-medium py-1.5 pr-3 text-right">Planned</th>
                  <th className="font-medium py-1.5 pr-3 text-right">Actual</th>
                  <th className="font-medium py-1.5 pr-3">Charged At</th>
                  <th className="font-medium py-1.5 pr-1">Charged By</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-500">{c.sequence}</td>
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{c.material}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{c.materialCategory}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{c.grade ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{c.batchRef ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">{c.plannedQuantity ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-700">{c.actualQuantity} {c.unit}</td>
                    <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{new Date(c.chargedAt).toLocaleString()}</td>
                    <td className="py-1.5 pr-1 text-slate-500 whitespace-nowrap">{c.chargedBy.firstName} {c.chargedBy.lastName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact readiness rollup so operators see what's outstanding without
// re-confirming already-completed steps — derived from the same
// subStatus() the timeline steps below already use.
export function ReadinessPanel({ items }: { items: { code: string; label: string; status: SubStepStatus }[] }) {
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
