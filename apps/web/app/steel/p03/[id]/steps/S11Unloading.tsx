"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { Button } from "@/components/ui/button";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, SubStepStatus } from "./shared";

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

function UnloadingForm({ intake, token, onSaved, onError }: StepProps) {
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.recordUnloading(intake.id, {}, token),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Confirm the accepted material has been safely unloaded.</p>
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Confirm unloading" />
      </Button>
    </div>
  );
}

function NetWeightForm({ intake, token, onSaved, onError }: StepProps) {
  const [tare, setTare] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.recordNetWeight(intake.id, { tareWeightTonnes: Number(tare) }, token),
    onSuccess: onSaved,
    onError,
  });
  const grossWeight = intake.grossWeightTonnes ?? 0;
  const tareNum = Number(tare);
  const valid = tare !== "" && tareNum >= 0 && tareNum <= grossWeight;
  const preview = tare !== "" && tareNum <= grossWeight ? grossWeight - tareNum : null;

  return (
    <div className="space-y-3">
      <Field label="Gross weight" value={`${grossWeight} t`} />
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Tare weight (tonnes)</label>
        <input
          type="number"
          step="0.001"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={tare}
          onChange={(e) => setTare(e.target.value)}
        />
      </div>
      {tare !== "" && tareNum > grossWeight && (
        <p className="text-xs text-red-600">Tare weight cannot exceed gross weight.</p>
      )}
      {preview !== null && (
        <p className="text-xs text-slate-400">
          Net weight preview: {preview.toFixed(3)} t — the server will confirm this on save.
        </p>
      )}
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record net weight" />
      </Button>
    </div>
  );
}

export function S11Unloading(props: StepProps) {
  const { intake } = props;
  const actions = intake.allowedActions ?? [];

  if (intake.acceptanceDecision !== "ACCEPT") {
    return (
      <SubStepCard code="P03-A11–A12" title="Unloading & Weighing" status="locked">
        <p className="text-sm text-slate-400">
          Only accepted material proceeds to unloading. This intake was {intake.acceptanceDecision?.toLowerCase() ?? "not yet decided"}.
        </p>
      </SubStepCard>
    );
  }

  const unloadingStatus = subStatus(actions.includes("RECORD_UNLOADING"), intake.unloadedAt !== null);
  const weightStatus = subStatus(actions.includes("RECORD_NET_WEIGHT"), intake.netWeightTonnes !== null);

  return (
    <div className="space-y-4">
      <SubStepCard code="P03-A11" title="Unload Approved Material" status={unloadingStatus}>
        {unloadingStatus === "done" ? (
          <Field label="Unloaded at" value={intake.unloadedAt ? new Date(intake.unloadedAt).toLocaleString() : null} />
        ) : unloadingStatus === "active" ? (
          <UnloadingForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A12" title="Tare Weight & Net Weight" status={weightStatus}>
        {weightStatus === "done" ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Gross weight" value={intake.grossWeightTonnes ? `${intake.grossWeightTonnes} t` : null} />
            <Field label="Tare weight" value={intake.tareWeightTonnes !== null ? `${intake.tareWeightTonnes} t` : null} />
            <Field label="Net weight" value={intake.netWeightTonnes !== null ? `${intake.netWeightTonnes} t` : null} />
          </div>
        ) : weightStatus === "active" ? (
          <NetWeightForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
