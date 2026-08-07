"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChargePreparationService, CHARGE_STAGE_ORDER } from "@/services/steel-charge-preparation.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, subStatus } from "./shared";

const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// P04-A11 — Create and release Charge ID
function ReleaseChargeForm({ prep, token, onSaved, onError }: StepProps) {
  const { user } = useAuthStore();
  const [notes, setNotes] = useState("");
  const canRelease = user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role);
  const varianceBlocked =
    prep.weightVarianceTonnes !== null && prep.weightVarianceTonnes !== 0 && !prep.varianceApproved;

  const mutation = useMutation({
    mutationFn: () => ChargePreparationService.releaseCharge(prep.id, { releaseNotes: notes || undefined }, token),
    onSuccess: onSaved,
    onError,
  });

  if (!canRelease) {
    return <p className="text-sm text-amber-600">Charge ID release is restricted to Super Admin, Admin, or Management roles.</p>;
  }

  return (
    <div className="space-y-3">
      {varianceBlocked && (
        <p className="text-xs text-amber-600">
          The verification variance must be approved (P04-A10) before the Charge ID can be released.
        </p>
      )}
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={varianceBlocked || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Release Charge ID" />
      </Button>
    </div>
  );
}

// P04-A12 — Close preparation handover to furnace
function CloseHandoverForm({ prep, token, onSaved, onError }: StepProps) {
  const { user } = useAuthStore();
  const [confirmed, setConfirmed] = useState(false);
  const [heatRef, setHeatRef] = useState("");
  const [notes, setNotes] = useState("");
  const canClose = user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role);

  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.closeFurnaceHandover(
        prep.id,
        { furnaceReadinessConfirmed: confirmed, plannedHeatReference: heatRef || undefined, handoverNotes: notes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });

  if (!canClose) {
    return <p className="text-sm text-amber-600">Furnace handover is restricted to Super Admin, Admin, or Management roles.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Furnace readiness confirmed
      </label>
      <Input placeholder="Planned heat reference (optional)" value={heatRef} onChange={(e) => setHeatRef(e.target.value)} />
      <Input placeholder="Handover notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!confirmed && (
        <p className="text-xs text-amber-600">Furnace readiness must be confirmed to close the handover.</p>
      )}
      <Button size="sm" disabled={!confirmed || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Close handover" />
      </Button>
    </div>
  );
}

export function S16ChargeRelease(props: StepProps) {
  const { prep } = props;
  const actions = prep.allowedActions ?? [];
  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  const releaseStatus = subStatus(actions.includes("RELEASE_CHARGE"), !!prep.chargeNumber);
  const handoverStatus = subStatus(actions.includes("CLOSE_HANDOVER"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A12_HANDOVER_CLOSED"));

  return (
    <div className="space-y-4">
      <SubStepCard code="Summary" title="Charge Preparation Summary" status="done">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Plan" value={prep.plan?.planNumber} />
          <Field label="Recipe total (t)" value={
            (prep.recipeScrapWeightTonnes ?? 0) +
            (prep.recipeDriWeightTonnes ?? 0) +
            (prep.recipeAlloyWeightTonnes ?? 0) +
            (prep.recipeAdditiveWeightTonnes ?? 0) || null
          } />
          <Field label="Actual weight" value={prep.actualWeightTonnes !== null ? `${prep.actualWeightTonnes} t` : null} />
          <Field label="Variance" value={prep.weightVarianceTonnes !== null ? `${prep.weightVarianceTonnes} t` : null} />
          <Field label="Selected lots" value={prep.materialLots.length || null} />
          <Field label="Staging location" value={prep.stagingLocation} />
        </div>
      </SubStepCard>

      <SubStepCard code="P04-A11" title="Release Charge ID" status={releaseStatus}>
        {releaseStatus === "done" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Charge released — Charge ID <span className="font-mono font-semibold">{prep.chargeNumber}</span>
            </div>
            <Field label="Released at" value={prep.chargeReleasedAt ? new Date(prep.chargeReleasedAt).toLocaleString() : null} />
          </div>
        ) : releaseStatus === "active" ? (
          <ReleaseChargeForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A12" title="Furnace Handover" status={handoverStatus}>
        {handoverStatus === "done" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Handover closed — ready for P05 Furnace.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned heat reference" value={prep.plannedHeatReference} />
              <Field label="Handover notes" value={prep.handoverNotes} />
              <Field label="Closed at" value={prep.handoverClosedAt ? new Date(prep.handoverClosedAt).toLocaleString() : null} />
            </div>
          </div>
        ) : handoverStatus === "active" ? (
          <CloseHandoverForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
