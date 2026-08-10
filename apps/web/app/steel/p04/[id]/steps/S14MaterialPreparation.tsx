"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChargePreparationService, AdditivePrepared, CHARGE_STAGE_ORDER } from "@/services/steel-charge-preparation.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, subStatus } from "./shared";

// P04-A03 — Sort scrap by grade and usability
function ScrapSortingForm({ prep, token, onSaved, onError }: StepProps) {
  const [weight, setWeight] = useState("");
  const [rejectedNotes, setRejectedNotes] = useState("");
  const [gradeNotes, setGradeNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.recordScrapSorting(
        prep.id,
        { sortedWeightTonnes: Number(weight), rejectedItemsNotes: rejectedNotes || undefined, scrapGradeNotes: gradeNotes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  const valid = Number(weight) > 0;
  return (
    <div className="space-y-3">
      <Input type="number" step="0.001" placeholder="Sorted weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Input placeholder="Rejected items notes (optional)" value={rejectedNotes} onChange={(e) => setRejectedNotes(e.target.value)} />
      <Input placeholder="Scrap grade notes (optional)" value={gradeNotes} onChange={(e) => setGradeNotes(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record scrap sorting" />
      </Button>
    </div>
  );
}

// P04-A04 — Cut oversized scrap if needed
function ScrapCuttingForm({ prep, token, onSaved, onError }: StepProps) {
  const [cuttingRequired, setCuttingRequired] = useState(false);
  const [cuttingTime, setCuttingTime] = useState("");
  const [powerOrGas, setPowerOrGas] = useState("");
  const [cutQty, setCutQty] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.recordScrapCutting(
        prep.id,
        {
          cuttingRequired,
          cuttingTimeMinutes: cuttingRequired && cuttingTime ? Number(cuttingTime) : undefined,
          cuttingPowerOrGasUsed: cuttingRequired && powerOrGas ? powerOrGas : undefined,
          cutQuantityTonnes: cuttingRequired && cutQty ? Number(cutQty) : undefined,
        },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cuttingRequired} onChange={(e) => setCuttingRequired(e.target.checked)} />
        Oversized scrap cutting required
      </label>
      {cuttingRequired && (
        <>
          <Input type="number" step="0.01" placeholder="Cutting time (minutes, optional)" value={cuttingTime} onChange={(e) => setCuttingTime(e.target.value)} />
          <Input placeholder="Power/gas used (optional)" value={powerOrGas} onChange={(e) => setPowerOrGas(e.target.value)} />
          <Input type="number" step="0.001" placeholder="Cut quantity (tonnes, optional)" value={cutQty} onChange={(e) => setCutQty(e.target.value)} />
        </>
      )}
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record scrap cutting" />
      </Button>
    </div>
  );
}

// P04-A05 — Remove contaminants and unsafe items
function ContaminantRemovalForm({ prep, token, onSaved, onError }: StepProps) {
  const [removed, setRemoved] = useState(true);
  const [removedNotes, setRemovedNotes] = useState("");
  const [issueNotes, setIssueNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.recordContaminantRemoval(
        prep.id,
        { contaminantsRemoved: removed, removedItemsNotes: removedNotes || undefined, contaminationIssueNotes: issueNotes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={removed} onChange={(e) => setRemoved(e.target.checked)} />
        Contaminants and unsafe items removed
      </label>
      <Input placeholder="Removed items notes (optional)" value={removedNotes} onChange={(e) => setRemovedNotes(e.target.value)} />
      <Input placeholder="Contamination issue notes (optional)" value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record contaminant removal" />
      </Button>
    </div>
  );
}

// P04-A06 — Prepare additives and alloys
function AdditivesForm({ prep, token, onSaved, onError }: StepProps) {
  const [items, setItems] = useState<AdditivePrepared[]>([]);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.prepareAdditives(
        prep.id,
        { additivesPrepared: items.length > 0 ? items : undefined, additivesNotes: notes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });

  const updateItem = (idx: number, patch: Partial<AdditivePrepared>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { itemName: "", quantity: 0 }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
            <Input placeholder="Item name" value={item.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} />
            <Input type="number" step="0.001" placeholder="Quantity" value={item.quantity || ""} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
            <Input placeholder="Lot (optional)" value={item.lot ?? ""} onChange={(e) => updateItem(idx, { lot: e.target.value })} />
            <Input placeholder="Issue record (optional)" value={item.issueRecord ?? ""} onChange={(e) => updateItem(idx, { issueRecord: e.target.value })} />
            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add additive/alloy
        </Button>
      </div>
      <Input placeholder="Additives notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Save additives" />
      </Button>
    </div>
  );
}

// P04-A07 — Check internal return scrap availability
function ReturnScrapForm({ prep, token, onSaved, onError }: StepProps) {
  const [available, setAvailable] = useState(false);
  const [qty, setQty] = useState("");
  const [source, setSource] = useState("");
  const [grade, setGrade] = useState("");
  const [contaminationNotes, setContaminationNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      ChargePreparationService.recordReturnScrapCheck(
        prep.id,
        {
          returnScrapAvailable: available,
          returnScrapQtyTonnes: available && qty ? Number(qty) : undefined,
          returnScrapSource: available && source ? source : undefined,
          returnScrapGrade: available && grade ? grade : undefined,
          returnScrapContaminationNotes: available && contaminationNotes ? contaminationNotes : undefined,
        },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
        Internal return scrap available
      </label>
      {available && (
        <>
          <Input type="number" step="0.001" placeholder="Return scrap quantity (tonnes, optional)" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Input placeholder="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} />
          <Input placeholder="Grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Input placeholder="Contamination notes (optional)" value={contaminationNotes} onChange={(e) => setContaminationNotes(e.target.value)} />
        </>
      )}
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record return scrap check" />
      </Button>
    </div>
  );
}

export function S14MaterialPreparation(props: StepProps) {
  const { prep } = props;
  const actions = prep.allowedActions ?? [];

  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  const sortingStatus = subStatus(actions.includes("RECORD_SCRAP_SORTING"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A03_SCRAP_SORTED"));
  const cuttingStatus = subStatus(actions.includes("RECORD_SCRAP_CUTTING"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A04_SCRAP_CUT"));
  const contaminantStatus = subStatus(actions.includes("REMOVE_CONTAMINANTS"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A05_CONTAMINANTS_REMOVED"));
  const additivesStatus = subStatus(actions.includes("PREPARE_ADDITIVES"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A06_ADDITIVES_PREPARED"));
  const returnScrapStatus = subStatus(actions.includes("CHECK_RETURN_SCRAP"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A07_RETURN_SCRAP_CHECKED"));

  return (
    <div className="space-y-4">
      <SubStepCard code="P04-A03" title="Scrap Sorting" status={sortingStatus}>
        {sortingStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sorted weight" value={prep.sortedWeightTonnes !== null ? `${prep.sortedWeightTonnes} t` : null} />
            <Field label="Rejected items" value={prep.rejectedItemsNotes} />
            <Field label="Grade notes" value={prep.scrapGradeNotes} />
          </div>
        ) : sortingStatus === "active" ? (
          <ScrapSortingForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A04" title="Oversized Scrap Cutting" status={cuttingStatus}>
        {cuttingStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cutting required" value={prep.cuttingRequired ? "Yes" : "No"} />
            <Field label="Cutting time" value={prep.cuttingTimeMinutes !== null ? `${prep.cuttingTimeMinutes} min` : null} />
            <Field label="Power/gas used" value={prep.cuttingPowerOrGasUsed} />
            <Field label="Cut quantity" value={prep.cutQuantityTonnes !== null ? `${prep.cutQuantityTonnes} t` : null} />
          </div>
        ) : cuttingStatus === "active" ? (
          <ScrapCuttingForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A05" title="Contaminant / Unsafe Item Removal" status={contaminantStatus}>
        {contaminantStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contaminants removed" value={prep.contaminantsRemoved ? "Yes" : "No"} />
            <Field label="Removed items" value={prep.removedItemsNotes} />
            <Field label="Issue notes" value={prep.contaminationIssueNotes} />
          </div>
        ) : contaminantStatus === "active" ? (
          <ContaminantRemovalForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A06" title="Additives & Alloys Preparation" status={additivesStatus}>
        {additivesStatus === "done" ? (
          <div className="space-y-2">
            {(prep.additivesPrepared ?? []).length > 0 ? (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {prep.additivesPrepared!.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-slate-800">{item.itemName}</span>
                    <span className="text-slate-500">{item.quantity}{item.lot ? ` · ${item.lot}` : ""}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No additives recorded.</p>
            )}
            <Field label="Notes" value={prep.additivesNotes} />
          </div>
        ) : additivesStatus === "active" ? (
          <AdditivesForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P04-A07" title="Internal Return Scrap Check" status={returnScrapStatus}>
        {returnScrapStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Available" value={prep.returnScrapAvailable ? "Yes" : "No"} />
            <Field label="Quantity" value={prep.returnScrapQtyTonnes !== null ? `${prep.returnScrapQtyTonnes} t` : null} />
            <Field label="Source" value={prep.returnScrapSource} />
            <Field label="Grade" value={prep.returnScrapGrade} />
            <Field label="Contamination notes" value={prep.returnScrapContaminationNotes} />
          </div>
        ) : returnScrapStatus === "active" ? (
          <ReturnScrapForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
