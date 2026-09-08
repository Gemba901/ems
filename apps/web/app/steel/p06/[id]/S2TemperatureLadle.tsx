"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  HeatApprovalService,
  SteelHeatApproval,
  CheckTemperaturePayload,
  CheckLadleReadinessPayload,
} from "@/services/steel-heat-approval.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p06/shared";

// This module used to render its own full page. It's now consumed as the
// "Heat Cycle" tab of the Heat Review screen (see HeatReview.tsx) — page
// chrome moved there; only the real A07-A08 form logic/layout stayed here.

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

// Real done/active/locked status for A07-A08 — exported so HeatReview's
// Summary tab can reuse the same real conditions.
export function heatCycleTabStatuses(heatApproval: SteelHeatApproval) {
  const actions = heatApproval.allowedActions ?? [];
  return {
    tempStatus: subStatus(actions.includes("CHECK_TEMPERATURE"), heatApproval.liquidTemperatureCelsius !== null),
    ladleStatus: subStatus(actions.includes("CHECK_LADLE_READINESS"), heatApproval.ladleReady !== null),
  };
}

// Heat Cycle tab content for the Heat Review screen — the A07-A08
// sub-steps (temperature check, ladle readiness), without page chrome.
export function HeatCycleTab({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const { tempStatus, ladleStatus } = heatCycleTabStatuses(heatApproval);

  return (
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
  );
}
