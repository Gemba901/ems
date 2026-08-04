"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, SubStepStatus } from "./shared";

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

function YardLocationForm({ intake, token, onSaved, onError }: StepProps) {
  const [location, setLocation] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.assignYardLocation(intake.id, { yardLocation: location }, token),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <Input placeholder="Yard location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Button size="sm" disabled={!location.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Assign yard location" />
      </Button>
    </div>
  );
}

function ReleaseForm({ intake, token, onSaved, onError }: StepProps) {
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.releaseToStock(intake.id, { stockReleaseNotes: notes || undefined }, token),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
        Stock release is recorded against the material intake. Full inventory stock integration will be
        enabled when the inventory module/model is available.
      </div>
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Release for preparation / use" />
      </Button>
    </div>
  );
}

export function S12Storage(props: StepProps) {
  const { intake } = props;
  const actions = intake.allowedActions ?? [];

  const yardStatus = subStatus(actions.includes("ASSIGN_YARD_LOCATION"), intake.yardLocation !== null);
  const releaseStatus = subStatus(actions.includes("RELEASE_TO_STOCK"), intake.status === "RELEASED");

  return (
    <div className="space-y-4">
      <SubStepCard code="P03-A13" title="Store Material in Yard Location" status={yardStatus}>
        {yardStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Yard location" value={intake.yardLocation} />
            <Field label="Stored at" value={intake.storedAt ? new Date(intake.storedAt).toLocaleString() : null} />
          </div>
        ) : yardStatus === "active" ? (
          <YardLocationForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A14" title="Update Stock & Release for Preparation/Use" status={releaseStatus}>
        {releaseStatus === "done" ? (
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">
              Released for preparation/use on {intake.stockReleasedAt ? new Date(intake.stockReleasedAt).toLocaleString() : "—"}.
            </div>
            <Field label="Release notes" value={intake.stockReleaseNotes} />
            <p className="text-xs text-slate-400">
              Stock release is recorded against the material intake. Full inventory stock integration will be
              enabled when the inventory module/model is available.
            </p>
          </div>
        ) : releaseStatus === "active" ? (
          <ReleaseForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
