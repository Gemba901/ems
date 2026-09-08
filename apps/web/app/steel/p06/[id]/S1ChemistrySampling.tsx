"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  HeatApprovalService,
  SteelHeatApproval,
  AnalyzeSamplePayload,
  CompareChemistryPayload,
  DecideCorrectionPayload,
  AddCorrectionMaterialPayload,
  RetestChemistryPayload,
} from "@/services/steel-heat-approval.service";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p06/shared";

// This module used to render its own full page (ScreenHeader/
// WorkflowIndicator/ContextSummary/sidebar). It's now consumed as the
// "Chemistry" tab of the Heat Review screen (see HeatReview.tsx) — the page
// chrome moved there, and only the A02-A06 form logic and layout stayed
// here so the actual mutation/validation code isn't duplicated.
const CHEMISTRY_ELEMENTS = ["C", "Mn", "Si", "P", "S", "Cr"];

function ChemistryFields({ values, onChange }: { values: Record<string, string>; onChange: (el: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {CHEMISTRY_ELEMENTS.map((el) => (
        <div key={el}>
          <label className="text-xs text-slate-400 block mb-0.5">{el} %</label>
          <Input type="number" step="0.001" value={values[el] ?? ""} onChange={(e) => onChange(el, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function composeChemistry(values: Record<string, string>): Record<string, number> {
  const composition: Record<string, number> = {};
  for (const [el, v] of Object.entries(values)) {
    if (v !== "") composition[el] = Number(v);
  }
  return composition;
}

export function formatChemistry(composition: Record<string, number> | null) {
  if (!composition || Object.keys(composition).length === 0) return null;
  return Object.entries(composition).map(([el, v]) => `${el} ${v}%`).join(", ");
}

const OTHER_MATERIAL = "__other__";

// Correction materials aren't backed by a fixed catalog table — P04-A06
// (charge preparation additives) stores them as free-text history instead.
// Derive the dropdown options from the distinct itemName values used across
// this org's past charge preparations, falling back to free text via "Other".
function useAdditiveCatalog(token: string) {
  const { data } = useQuery({
    queryKey: ["steel-additive-catalog"],
    queryFn: () => ChargePreparationService.getAll(token, { limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const names = new Set<string>();
    for (const prep of data?.data ?? []) {
      for (const additive of prep.additivesPrepared ?? []) {
        if (additive.itemName) names.add(additive.itemName);
      }
    }
    return Array.from(names).sort();
  }, [data]);
}

function AnalyzeSampleForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [labRef, setLabRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: AnalyzeSamplePayload) => HeatApprovalService.analyzeSample(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const composition = composeChemistry(values);
  const hasComposition = Object.keys(composition).length > 0;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ChemistryFields values={values} onChange={(el, v) => setValues((prev) => ({ ...prev, [el]: v }))} />
      <Input placeholder="Lab reference (optional)" value={labRef} onChange={(e) => setLabRef(e.target.value)} />
      {!hasComposition && <p className="text-xs text-amber-600">Record at least one element result before continuing.</p>}
      <Button size="sm" disabled={!hasComposition || mutation.isPending} onClick={() => mutation.mutate({ chemistryComposition: composition, labRef: labRef || undefined })}>
        <SaveButton pending={mutation.isPending} label="Record chemistry analysis" />
      </Button>
    </div>
  );
}

function CompareChemistryForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  // Prefilled from the P01-A04 grade captured on the production plan this
  // heat traces back to (melting -> chargePreparation -> plan.grade), so
  // this doesn't need to be re-typed. Falls back to free entry only when
  // that chain hasn't produced a grade for this record.
  const planGrade = heatApproval.melting?.chargePreparation?.plan?.grade ?? "";
  const [grade, setGrade] = useState(planGrade);
  const [matches, setMatches] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CompareChemistryPayload) => HeatApprovalService.compareChemistry(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Field label="Analyzed chemistry" value={formatChemistry(heatApproval.chemistryComposition)} />
      {planGrade ? (
        <Field label="Required grade (from production plan)" value={planGrade} />
      ) : (
        <Input placeholder="Required grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={matches} onChange={(e) => setMatches(e.target.checked)} />
        Chemistry matches the required grade
      </label>
      <Input placeholder="Deviation notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ requiredGrade: grade || undefined, chemistryMatchesGrade: matches, chemistryDeviationNotes: notes || undefined })}>
        <SaveButton pending={mutation.isPending} label="Save chemistry comparison" />
      </Button>
    </div>
  );
}

function DecideCorrectionForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [required, setRequired] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: DecideCorrectionPayload) => HeatApprovalService.decideCorrection(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Correction is required before this heat can proceed
      </label>
      <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ correctionRequired: required, correctionReason: reason || undefined })}>
        <SaveButton pending={mutation.isPending} label="Save correction decision" />
      </Button>
    </div>
  );
}

function CorrectionMaterialForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const required = !!heatApproval.correctionRequired;
  const catalog = useAdditiveCatalog(token);
  const [material, setMaterial] = useState("");
  const [customMaterial, setCustomMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [notApplicable, setNotApplicable] = useState(!required);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: AddCorrectionMaterialPayload) => HeatApprovalService.addCorrectionMaterial(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const effectiveMaterial = material === OTHER_MATERIAL ? customMaterial : material;
  const hasMaterial = !!effectiveMaterial && !!qty;
  const canSubmit = required ? hasMaterial : true;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {required ? (
        <p className="text-xs text-amber-600">Correction was determined to be required — record the material added.</p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notApplicable} onChange={(e) => setNotApplicable(e.target.checked)} />
          Not applicable — no correction was needed
        </label>
      )}
      {(required || !notApplicable) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className={material === OTHER_MATERIAL ? "space-y-2" : undefined}>
            <select
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              <option value="">Select material…</option>
              {catalog.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value={OTHER_MATERIAL}>Other…</option>
            </select>
            {material === OTHER_MATERIAL && (
              <Input placeholder="Material name" value={customMaterial} onChange={(e) => setCustomMaterial(e.target.value)} />
            )}
          </div>
          <Input type="number" step="0.01" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Input placeholder="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      )}
      <Button
        size="sm"
        disabled={!canSubmit || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            correctionNotApplicable: !required && notApplicable ? true : undefined,
            correctionMaterials: hasMaterial ? [{ material: effectiveMaterial, quantity: Number(qty), unit: unit || undefined }] : undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label={hasMaterial ? "Record correction material" : "Continue"} />
      </Button>
    </div>
  );
}

function RetestChemistryForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const required = !!heatApproval.correctionRequired;
  const [values, setValues] = useState<Record<string, string>>({});
  const [notApplicable, setNotApplicable] = useState(!required);
  const [matchesGrade, setMatchesGrade] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RetestChemistryPayload) => HeatApprovalService.retestChemistry(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const composition = composeChemistry(values);
  const hasComposition = Object.keys(composition).length > 0;
  const canSubmit = required ? hasComposition : true;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {required ? (
        <p className="text-xs text-amber-600">Chemistry must be re-tested because a correction was made.</p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notApplicable} onChange={(e) => setNotApplicable(e.target.checked)} />
          Not applicable — no re-test needed
        </label>
      )}
      {(required || !notApplicable) && <ChemistryFields values={values} onChange={(el, v) => setValues((prev) => ({ ...prev, [el]: v }))} />}
      {required && hasComposition && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={matchesGrade} onChange={(e) => setMatchesGrade(e.target.checked)} />
          Re-tested chemistry matches the required grade
        </label>
      )}
      {required && hasComposition && !matchesGrade && (
        <p className="text-xs text-amber-600">
          Chemistry still doesn&apos;t match — this will loop back to the correction decision step (attempt {heatApproval.correctionAttempts + 1}).
        </p>
      )}
      <Button
        size="sm"
        disabled={!canSubmit || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            retestNotApplicable: !required && notApplicable ? true : undefined,
            retestChemistryComposition: hasComposition ? composition : undefined,
            retestMatchesGrade: required && hasComposition ? matchesGrade : undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Save re-test result" />
      </Button>
    </div>
  );
}

// Real done/active/locked status for each A02-A06 chemistry sub-step —
// exported so HeatReview's Summary tab ("Chemistry Within Specification" /
// "Samples & Tests Attached" checks) can reuse the same real conditions
// instead of re-deriving them.
export function chemistryTabStatuses(heatApproval: SteelHeatApproval) {
  const actions = heatApproval.allowedActions ?? [];
  return {
    analyzeStatus: subStatus(actions.includes("ANALYZE_SAMPLE"), heatApproval.chemistryComposition !== null),
    compareStatus: subStatus(actions.includes("COMPARE_CHEMISTRY"), heatApproval.chemistryMatchesGrade !== null),
    correctionStatus: subStatus(actions.includes("DECIDE_CORRECTION"), heatApproval.correctionRequired !== null),
    materialStatus: subStatus(actions.includes("ADD_CORRECTION_MATERIAL"), heatApproval.correctionMaterials !== null || heatApproval.correctionNotApplicable !== null),
    retestStatus: subStatus(actions.includes("RETEST_CHEMISTRY"), heatApproval.retestChemistryComposition !== null || heatApproval.retestNotApplicable !== null),
  };
}

// Chemistry tab content for the Heat Review screen — the A01-A06 sub-steps
// (sample taken through re-test), without any page-level chrome.
export function ChemistryTab({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const { analyzeStatus, compareStatus, correctionStatus, materialStatus, retestStatus } = chemistryTabStatuses(heatApproval);

  return (
        <div className="space-y-4">
            <SubStep
              code="P06-A01"
              title="Liquid Steel Sample Taken"
              status="done"
              summary={`Sample ${heatApproval.sampleRef ?? "—"}${heatApproval.sampleTakenAt ? ` · ${new Date(heatApproval.sampleTakenAt).toLocaleString()}` : ""}`}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Sample reference" value={heatApproval.sampleRef} />
                <Field label="Sampled at" value={heatApproval.sampleTakenAt ? new Date(heatApproval.sampleTakenAt).toLocaleString() : null} />
              </div>
            </SubStep>

            <SubStep
              code="P06-A02"
              title="Analyze Sample in Lab"
              status={analyzeStatus}
              summary={formatChemistry(heatApproval.chemistryComposition) ?? undefined}
            >
              {analyzeStatus === "active" && <AnalyzeSampleForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P06-A03"
              title="Compare Chemistry with Required Grade"
              status={compareStatus}
              summary={`Grade: ${heatApproval.requiredGrade ?? "—"} · Matches: ${heatApproval.chemistryMatchesGrade ? "Yes" : "No"}`}
            >
              {compareStatus === "active" && <CompareChemistryForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P06-A04"
              title="Decide Correction Requirement"
              status={correctionStatus}
              summary={`Correction required: ${heatApproval.correctionRequired ? "Yes" : "No"}`}
            >
              {correctionStatus === "active" && <DecideCorrectionForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P06-A05"
              title="Add Correction Material"
              status={materialStatus}
              summary={heatApproval.correctionMaterials?.length ? `${heatApproval.correctionMaterials.length} material(s) added` : "None"}
            >
              {materialStatus === "active" && <CorrectionMaterialForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P06-A06"
              title="Re-test Chemistry"
              status={retestStatus}
              summary={formatChemistry(heatApproval.retestChemistryComposition) ?? "Not applicable"}
            >
              {retestStatus === "active" && <RetestChemistryForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
            </SubStep>
        </div>
  );
}
