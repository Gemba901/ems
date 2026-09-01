"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChargePreparationService,
  SteelChargePreparation,
  AdditivePrepared,
  RecordScrapSortingPayload,
  RecordScrapCuttingPayload,
  RecordContaminantRemovalPayload,
  PrepareAdditivesPayload,
  RecordReturnScrapCheckPayload,
  PrepareChargeRecipePayload,
  StageChargeMaterialPayload,
  CHARGE_STAGE_ORDER,
} from "@/services/steel-charge-preparation.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { ScreenSidebar } from "@/components/steel/p04/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p04/ContextSummary";
import { ChargeProgress } from "@/components/steel/p04/ChargeProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p04/screenMap";
import { Field, SubStep, SaveButton, SubStepStatus } from "@/components/steel/p04/shared";
import { Recycle, Info, ListChecks, Lightbulb, Trash2, Plus } from "lucide-react";

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

type Props = { prep: SteelChargePreparation; token: string; onRefresh: () => void };

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <ScreenSidebar>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            Get the selected material ready for the furnace: sort it, cut anything oversized, remove contaminants,
            prepare additives, check for return scrap, then build and stage the charge recipe.
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
            Once the material is staged near the furnace, this preparation moves on to verification and Charge ID
            release.
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
            <li>Cutting and return scrap steps only need details filled in if they apply to this charge.</li>
            <li>The recipe defines how much of each material this charge should use.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P04-A03 ──

function ScrapSortingForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [weight, setWeight] = useState("");
  const [rejectedNotes, setRejectedNotes] = useState("");
  const [gradeNotes, setGradeNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordScrapSortingPayload) => ChargePreparationService.recordScrapSorting(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = Number(weight) > 0;
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="0.001" placeholder="Sorted weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Input placeholder="Rejected items notes (optional)" value={rejectedNotes} onChange={(e) => setRejectedNotes(e.target.value)} />
      <Input placeholder="Scrap grade notes (optional)" value={gradeNotes} onChange={(e) => setGradeNotes(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ sortedWeightTonnes: Number(weight), rejectedItemsNotes: rejectedNotes || undefined, scrapGradeNotes: gradeNotes || undefined })}>
        <SaveButton pending={mutation.isPending} label="Record scrap sorting" />
      </Button>
    </div>
  );
}

// ── P04-A04 ──

function ScrapCuttingForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [cuttingRequired, setCuttingRequired] = useState(false);
  const [cuttingTime, setCuttingTime] = useState("");
  const [powerOrGas, setPowerOrGas] = useState("");
  const [cutQty, setCutQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordScrapCuttingPayload) => ChargePreparationService.recordScrapCutting(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
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
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({
          cuttingRequired,
          cuttingTimeMinutes: cuttingRequired && cuttingTime ? Number(cuttingTime) : undefined,
          cuttingPowerOrGasUsed: cuttingRequired && powerOrGas ? powerOrGas : undefined,
          cutQuantityTonnes: cuttingRequired && cutQty ? Number(cutQty) : undefined,
        })}
      >
        <SaveButton pending={mutation.isPending} label="Record scrap cutting" />
      </Button>
    </div>
  );
}

// ── P04-A05 ──

function ContaminantRemovalForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [removed, setRemoved] = useState(true);
  const [removedNotes, setRemovedNotes] = useState("");
  const [issueNotes, setIssueNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordContaminantRemovalPayload) => ChargePreparationService.recordContaminantRemoval(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={removed} onChange={(e) => setRemoved(e.target.checked)} />
        Contaminants and unsafe items removed
      </label>
      <Input placeholder="Removed items notes (optional)" value={removedNotes} onChange={(e) => setRemovedNotes(e.target.value)} />
      <Input placeholder="Contamination issue notes (optional)" value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ contaminantsRemoved: removed, removedItemsNotes: removedNotes || undefined, contaminationIssueNotes: issueNotes || undefined })}>
        <SaveButton pending={mutation.isPending} label="Record contaminant removal" />
      </Button>
    </div>
  );
}

// ── P04-A06 ──

function AdditivesForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [items, setItems] = useState<AdditivePrepared[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: PrepareAdditivesPayload) => ChargePreparationService.prepareAdditives(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const updateItem = (idx: number, patch: Partial<AdditivePrepared>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { itemName: "", quantity: 0 }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
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
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ additivesPrepared: items.length > 0 ? items : undefined, additivesNotes: notes || undefined })}>
        <SaveButton pending={mutation.isPending} label="Save additives" />
      </Button>
    </div>
  );
}

// ── P04-A07 ──

function ReturnScrapForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [available, setAvailable] = useState(false);
  const [qty, setQty] = useState("");
  const [source, setSource] = useState("");
  const [grade, setGrade] = useState("");
  const [contaminationNotes, setContaminationNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordReturnScrapCheckPayload) => ChargePreparationService.recordReturnScrapCheck(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
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
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({
          returnScrapAvailable: available,
          returnScrapQtyTonnes: available && qty ? Number(qty) : undefined,
          returnScrapSource: available && source ? source : undefined,
          returnScrapGrade: available && grade ? grade : undefined,
          returnScrapContaminationNotes: available && contaminationNotes ? contaminationNotes : undefined,
        })}
      >
        <SaveButton pending={mutation.isPending} label="Record return scrap check" />
      </Button>
    </div>
  );
}

// ── P04-A08 ──

function RecipeForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [scrap, setScrap] = useState("");
  const [dri, setDri] = useState("");
  const [alloy, setAlloy] = useState("");
  const [additive, setAdditive] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: PrepareChargeRecipePayload) => ChargePreparationService.prepareChargeRecipe(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = Number(scrap) > 0;
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" step="0.001" placeholder="Scrap weight (tonnes)" value={scrap} onChange={(e) => setScrap(e.target.value)} />
        <Input type="number" step="0.001" placeholder="DRI weight (tonnes, optional)" value={dri} onChange={(e) => setDri(e.target.value)} />
        <Input type="number" step="0.001" placeholder="Alloy weight (tonnes, optional)" value={alloy} onChange={(e) => setAlloy(e.target.value)} />
        <Input type="number" step="0.001" placeholder="Additive weight (tonnes, optional)" value={additive} onChange={(e) => setAdditive(e.target.value)} />
      </div>
      <Input placeholder="Recipe notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button
        size="sm"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate({
          recipeScrapWeightTonnes: Number(scrap),
          recipeDriWeightTonnes: dri ? Number(dri) : undefined,
          recipeAlloyWeightTonnes: alloy ? Number(alloy) : undefined,
          recipeAdditiveWeightTonnes: additive ? Number(additive) : undefined,
          recipeNotes: notes || undefined,
        })}
      >
        <SaveButton pending={mutation.isPending} label="Save charge recipe" />
      </Button>
    </div>
  );
}

function RecipeTable({ prep }: { prep: SteelChargePreparation }) {
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
            <th className="py-1.5 pr-3">Recipe (t)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-3 font-medium text-slate-800">{r.label}</td>
              <td className="py-1.5 pr-3 text-slate-600">{r.target}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-medium">
            <td className="py-1.5 pr-3">Total</td>
            <td className="py-1.5 pr-3">{recipeTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── P04-A09 ──

function StagingForm({ prep, token, onDone }: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [location, setLocation] = useState("");
  const [weight, setWeight] = useState("");
  const [sequence, setSequence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: StageChargeMaterialPayload) => ChargePreparationService.stageChargeMaterial(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = location.trim().length > 0 && Number(weight) > 0;
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Staging location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Input type="number" step="0.001" placeholder="Staged weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Input type="number" step="1" placeholder="Staging sequence (optional)" value={sequence} onChange={(e) => setSequence(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ stagingLocation: location, stagedWeightTonnes: Number(weight), stagingSequence: sequence ? Number(sequence) : undefined })}>
        <SaveButton pending={mutation.isPending} label="Record staging" />
      </Button>
    </div>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S2MaterialPreparation({ prep, token, onRefresh }: Props) {
  const actions = prep.allowedActions ?? [];
  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  const sortingStatus = subStatus(actions.includes("RECORD_SCRAP_SORTING"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A03_SCRAP_SORTED"));
  const cuttingStatus = subStatus(actions.includes("RECORD_SCRAP_CUTTING"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A04_SCRAP_CUT"));
  const contaminantStatus = subStatus(actions.includes("REMOVE_CONTAMINANTS"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A05_CONTAMINANTS_REMOVED"));
  const additivesStatus = subStatus(actions.includes("PREPARE_ADDITIVES"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A06_ADDITIVES_PREPARED"));
  const returnScrapStatus = subStatus(actions.includes("CHECK_RETURN_SCRAP"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A07_RETURN_SCRAP_CHECKED"));
  const recipeStatus = subStatus(actions.includes("PREPARE_RECIPE"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A08_RECIPE_PREPARED"));
  const stagingStatus = subStatus(actions.includes("STAGE_MATERIAL"), stageIdx >= CHARGE_STAGE_ORDER.indexOf("A09_MATERIAL_STAGED"));

  const groupDone = [
    sortingStatus === "done",
    cuttingStatus === "done" && contaminantStatus === "done",
    additivesStatus === "done" && returnScrapStatus === "done",
    recipeStatus === "done" && stagingStatus === "done",
  ].filter(Boolean).length;
  const activeGroupIdx = groupDone < 4 ? groupDone : null;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
        code="P04"
          icon={Recycle}
          title="Material Preparation"
          subtitle="Sort, clean, and stage the material, then build the furnace charge recipe."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[1]} doneCount={groupDone} activeIndex={activeGroupIdx} activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P04")?.color.bar} />
        <ContextSummary prep={prep} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1">1. Material Sorting</p>
            <SubStep
              code="P04-A03"
              title="Scrap Sorting"
              status={sortingStatus}
              summary={prep.sortedWeightTonnes !== null ? `Sorted ${prep.sortedWeightTonnes} t` : undefined}
            >
              {sortingStatus === "active" && <ScrapSortingForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1 pt-2">2. Cutting & Cleanup</p>
            <SubStep
              code="P04-A04"
              title="Oversized Scrap Cutting"
              status={cuttingStatus}
              summary={`Cutting ${prep.cuttingRequired ? "required" : "not required"}`}
            >
              {cuttingStatus === "active" && <ScrapCuttingForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P04-A05"
              title="Contaminant / Unsafe Item Removal"
              status={contaminantStatus}
              summary={`Contaminants ${prep.contaminantsRemoved ? "removed" : "not removed"}`}
            >
              {contaminantStatus === "active" && <ContaminantRemovalForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1 pt-2">3. Additives & Return Scrap</p>
            <SubStep
              code="P04-A06"
              title="Additives & Alloys Preparation"
              status={additivesStatus}
              summary={(prep.additivesPrepared ?? []).length > 0 ? `${prep.additivesPrepared!.length} additive(s) recorded` : "No additives recorded"}
            >
              {additivesStatus === "active" && <AdditivesForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P04-A07"
              title="Internal Return Scrap Check"
              status={returnScrapStatus}
              summary={`Return scrap ${prep.returnScrapAvailable ? "available" : "not available"}`}
            >
              {returnScrapStatus === "active" && <ReturnScrapForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1 pt-2">4. Charge Recipe</p>
            <SubStep
              code="P04-A08"
              title="Furnace Charge Recipe"
              status={recipeStatus}
              summary={prep.recipeScrapWeightTonnes !== null ? `Scrap ${prep.recipeScrapWeightTonnes} t recipe saved` : undefined}
            >
              {recipeStatus === "active" && <RecipeForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P04-A09"
              title="Stage Material Near Furnace"
              status={stagingStatus}
              summary={prep.stagingLocation ? `Staged at ${prep.stagingLocation}` : undefined}
            >
              {stagingStatus === "active" && <StagingForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>
          </div>
          <ScreenSidebar>
            <ChargeProgress prep={prep} />
            <Sidebar />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
