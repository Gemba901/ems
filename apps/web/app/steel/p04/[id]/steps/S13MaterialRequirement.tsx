"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, subStatus } from "./shared";

// P04-A01 is recorded at creation time (plan selected on the "New Charge
// Preparation" form). This screen covers P04-A02 — select material lots.

function LotSelectionForm({ prep, token, onSaved, onError }: StepProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const { data: released, isLoading } = useQuery({
    queryKey: ["material-intake", "released-lots"],
    queryFn: () => MaterialIntakeService.getAll(token, { status: "RELEASED", limit: 100 }),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.selectMaterialLots(
        prep.id,
        { intakeIds: selected, lotSelectionNotes: notes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const lots = released?.data ?? [];

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : lots.length === 0 ? (
        <p className="text-sm text-slate-400">No released material lots are currently available.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {lots.map((lot) => (
            <label
              key={lot.id}
              className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(lot.id)}
                onChange={() => toggle(lot.id)}
              />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <span className="font-medium text-slate-800">{lot.intakeNumber}</span>
                <span className="text-slate-500">{lot.materialType?.replace(/_/g, " ") ?? "—"}</span>
                <span className="text-slate-500">{lot.grade ?? "—"}</span>
                <span className="text-slate-500">{lot.netWeightTonnes !== null ? `${lot.netWeightTonnes} t` : "—"}</span>
              </div>
            </label>
          ))}
        </div>
      )}
      <Input placeholder="Lot selection notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={selected.length === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label={`Select ${selected.length || ""} lot${selected.length === 1 ? "" : "s"}`} />
      </Button>
    </div>
  );
}

export function S13MaterialRequirement(props: StepProps) {
  const { prep } = props;
  const actions = prep.allowedActions ?? [];
  const lotsStatus = subStatus(actions.includes("SELECT_LOTS"), prep.materialLots.length > 0);

  return (
    <div className="space-y-4">
      <SubStepCard code="P04-A01" title="Production Plan & Material Requirement" status="done">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Plan" value={prep.plan?.planNumber} />
          <Field label="Plan status" value={prep.plan?.status} />
          <Field label="Stock availability confirmed" value={prep.stockAvailabilityConfirmed === null ? null : prep.stockAvailabilityConfirmed ? "Yes" : "No"} />
          <Field label="Requirement notes" value={prep.requirementNotes} />
        </div>
      </SubStepCard>

      <SubStepCard code="P04-A02" title="Select Raw Material Lots" status={lotsStatus}>
        {lotsStatus === "done" ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Selected lots</p>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {prep.materialLots.map((lot) => (
                <div key={lot.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{lot.intake.intakeNumber}</span>
                  <span className="text-slate-500">{lot.intake.materialType?.replace(/_/g, " ") ?? "—"} · {lot.intake.grade ?? "—"} · {lot.intake.netWeightTonnes !== null ? `${lot.intake.netWeightTonnes} t` : "—"}</span>
                </div>
              ))}
            </div>
            <Field label="Notes" value={prep.lotSelectionNotes} />
          </div>
        ) : lotsStatus === "active" ? (
          <LotSelectionForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
