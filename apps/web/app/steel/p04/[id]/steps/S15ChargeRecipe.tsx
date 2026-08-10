"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChargePreparationService, CHARGE_STAGE_ORDER } from "@/services/steel-charge-preparation.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, subStatus } from "./shared";

// P04-A08 — Prepare furnace charge recipe
function RecipeForm({ prep, token, onSaved, onError }: StepProps) {
  const [scrap, setScrap] = useState("");
  const [dri, setDri] = useState("");
  const [alloy, setAlloy] = useState("");
  const [additive, setAdditive] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.prepareChargeRecipe(
        prep.id,
        {
          recipeScrapWeightTonnes: Number(scrap),
          recipeDriWeightTonnes: dri ? Number(dri) : undefined,
          recipeAlloyWeightTonnes: alloy ? Number(alloy) : undefined,
          recipeAdditiveWeightTonnes: additive ? Number(additive) : undefined,
          recipeNotes: notes || undefined,
        },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  const valid = Number(scrap) > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" step="0.001" placeholder="Scrap weight (tonnes)" value={scrap} onChange={(e) => setScrap(e.target.value)} />
        <Input type="number" step="0.001" placeholder="DRI weight (tonnes, optional)" value={dri} onChange={(e) => setDri(e.target.value)} />
        <Input type="number" step="0.001" placeholder="Alloy weight (tonnes, optional)" value={alloy} onChange={(e) => setAlloy(e.target.value)} />
        <Input type="number" step="0.001" placeholder="Additive weight (tonnes, optional)" value={additive} onChange={(e) => setAdditive(e.target.value)} />
      </div>
      <Input placeholder="Recipe notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Save charge recipe" />
      </Button>
    </div>
  );
}

// P04-A09 — Stage material near furnace charging area
function StagingForm({ prep, token, onSaved, onError }: StepProps) {
  const [location, setLocation] = useState("");
  const [weight, setWeight] = useState("");
  const [sequence, setSequence] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.stageChargeMaterial(
        prep.id,
        { stagingLocation: location, stagedWeightTonnes: Number(weight), stagingSequence: sequence ? Number(sequence) : undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  const valid = location.trim().length > 0 && Number(weight) > 0;
  return (
    <div className="space-y-3">
      <Input placeholder="Staging location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Input type="number" step="0.001" placeholder="Staged weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Input type="number" step="1" placeholder="Staging sequence (optional)" value={sequence} onChange={(e) => setSequence(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record staging" />
      </Button>
    </div>
  );
}

// P04-A10 — Verify actual material against charge recipe
function VerificationForm({ prep, token, onSaved, onError }: StepProps) {
  const [actualWeight, setActualWeight] = useState("");
  const [actualGrade, setActualGrade] = useState("");
  const [varianceApproved, setVarianceApproved] = useState(false);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.verifyChargeMaterial(
        prep.id,
        {
          actualWeightTonnes: Number(actualWeight),
          actualGrade: actualGrade || undefined,
          varianceApproved,
          verificationNotes: notes || undefined,
        },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  const valid = Number(actualWeight) > 0;
  return (
    <div className="space-y-3">
      <Input type="number" step="0.001" placeholder="Actual weight (tonnes)" value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} />
      <Input placeholder="Actual grade (optional)" value={actualGrade} onChange={(e) => setActualGrade(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={varianceApproved} onChange={(e) => setVarianceApproved(e.target.checked)} />
        Approve weight variance (required if actual differs from recipe total)
      </label>
      <Input placeholder="Verification notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Verify material" />
      </Button>
    </div>
  );
}

function RecipeTable({ prep }: { prep: StepProps["prep"] }) {
  const recipeTotal =
    (prep.recipeScrapWeightTonnes ?? 0) +
    (prep.recipeDriWeightTonnes ?? 0) +
    (prep.recipeAlloyWeightTonnes ?? 0) +
    (prep.recipeAdditiveWeightTonnes ?? 0);
  const rows = [
    { label: "Scrap", target: prep.recipeScrapWeightTonnes },
    { label: "DRI", target: prep.recipeDriWeightTonnes },
    { label: "Alloy", target: prep.recipeAlloyWeightTonnes },
    { label: "Additive", target: prep.recipeAdditiveWeightTonnes },
  ].filter((r) => r.target !== null && r.target !== undefined);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
            <th className="py-1.5 pr-3">Material</th>
            <th className="py-1.5 pr-3">Target (t)</th>
            <th className="py-1.5 pr-3">Actual (t)</th>
            <th className="py-1.5 pr-3">Variance (t)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-slate-800">{r.label}</td>
              <td className="py-1.5 pr-3 text-slate-600">{r.target}</td>
              <td className="py-1.5 pr-3 text-slate-400" colSpan={2}>—</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-medium">
            <td className="py-1.5 pr-3">Total</td>
            <td className="py-1.5 pr-3">{recipeTotal}</td>
            <td className="py-1.5 pr-3">{prep.actualWeightTonnes ?? "—"}</td>
            <td className="py-1.5 pr-3">
              {prep.weightVarianceTonnes !== null ? (
                <span className={prep.weightVarianceTonnes === 0 ? "text-emerald-600" : "text-amber-600"}>
                  {prep.weightVarianceTonnes > 0 ? "+" : ""}
                  {prep.weightVarianceTonnes}
                </span>
              ) : (
                "—"
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function S15ChargeRecipe(props: StepProps) {
  const { prep } = props;
  const actions = prep.allowedActions ?? [];
  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  const recipeStatus = subStatus(actions.includes("PREPARE_RECIPE"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A08_RECIPE_PREPARED"));
  const stagingStatus = subStatus(actions.includes("STAGE_MATERIAL"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A09_MATERIAL_STAGED"));
  const verificationStatus = subStatus(actions.includes("VERIFY_MATERIAL"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A10_VERIFICATION_DONE"));

  return (
    <div className="space-y-4">
      <SubStepCard code="P04-A08" title="Furnace Charge Recipe" status={recipeStatus}>
        {recipeStatus === "done" ? (
          <div className="space-y-3">
            <RecipeTable prep={prep} />
            <Field label="Recipe notes" value={prep.recipeNotes} />
          </div>
        ) : recipeStatus === "active" ? (
          <RecipeForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A09" title="Stage Material Near Furnace" status={stagingStatus}>
        {stagingStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Staging location" value={prep.stagingLocation} />
            <Field label="Staged weight" value={prep.stagedWeightTonnes !== null ? `${prep.stagedWeightTonnes} t` : null} />
            <Field label="Staging sequence" value={prep.stagingSequence} />
          </div>
        ) : stagingStatus === "active" ? (
          <StagingForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A10" title="Verify Actual Material vs Recipe" status={verificationStatus}>
        {verificationStatus === "done" ? (
          <div className="space-y-3">
            <RecipeTable prep={prep} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Actual grade" value={prep.actualGrade} />
              <Field label="Variance approved" value={prep.varianceApproved === null ? null : prep.varianceApproved ? "Yes" : "No"} />
              <Field label="Verification notes" value={prep.verificationNotes} />
            </div>
            {prep.weightVarianceTonnes !== null && prep.weightVarianceTonnes !== 0 && !prep.varianceApproved && (
              <p className="text-xs text-amber-600">
                The variance between actual material and the planned recipe must be approved before the Charge ID can be released.
              </p>
            )}
          </div>
        ) : verificationStatus === "active" ? (
          <VerificationForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
