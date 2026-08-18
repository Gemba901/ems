"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  HeatApprovalService,
  SteelHeatApproval,
  AnalyzeSamplePayload,
  CompareChemistryPayload,
  DecideCorrectionPayload,
  AddCorrectionMaterialPayload,
  RetestChemistryPayload,
} from "@/services/steel-heat-approval.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p06/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p06/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p06/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p06/ContextSummary";
import { HeatApprovalProgress } from "@/components/steel/p06/HeatApprovalProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p06/screenMap";
import { Field, SubStepCard, SaveButton, LockedNote, subStatus } from "@/components/steel/p06/shared";
import { FlaskConical, Info, ListChecks, Lightbulb } from "lucide-react";

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

function formatChemistry(composition: Record<string, number> | null) {
  if (!composition || Object.keys(composition).length === 0) return null;
  return Object.entries(composition).map(([el, v]) => `${el} ${v}%`).join(", ");
}

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
            Take a liquid steel sample, analyze it against the required grade, and correct and re-test chemistry if
            it doesn&apos;t match.
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
            Once chemistry is confirmed, the record moves on to temperature and ladle readiness checks.
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
            <li>If a correction was needed, chemistry must be re-tested before moving on.</li>
            <li>Leave an element blank if it wasn&apos;t measured.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
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
  const [grade, setGrade] = useState("");
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
      <Input placeholder="Required grade (optional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
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
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [notApplicable, setNotApplicable] = useState(!required);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: AddCorrectionMaterialPayload) => HeatApprovalService.addCorrectionMaterial(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const hasMaterial = !!material && !!qty;
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
          <Input placeholder="Material (e.g. FeSi, lime)" value={material} onChange={(e) => setMaterial(e.target.value)} />
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
            correctionMaterials: hasMaterial ? [{ material, quantity: Number(qty), unit: unit || undefined }] : undefined,
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
      <Button
        size="sm"
        disabled={!canSubmit || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            retestNotApplicable: !required && notApplicable ? true : undefined,
            retestChemistryComposition: hasComposition ? composition : undefined,
          })
        }
      >
        <SaveButton pending={mutation.isPending} label="Save re-test result" />
      </Button>
    </div>
  );
}

export function S1ChemistrySampling({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const actions = heatApproval.allowedActions ?? [];
  const analyzeStatus = subStatus(actions.includes("ANALYZE_SAMPLE"), heatApproval.chemistryComposition !== null);
  const compareStatus = subStatus(actions.includes("COMPARE_CHEMISTRY"), heatApproval.chemistryMatchesGrade !== null);
  const correctionStatus = subStatus(actions.includes("DECIDE_CORRECTION"), heatApproval.correctionRequired !== null);
  const materialStatus = subStatus(actions.includes("ADD_CORRECTION_MATERIAL"), heatApproval.correctionMaterials !== null || heatApproval.correctionNotApplicable !== null);
  const retestStatus = subStatus(actions.includes("RETEST_CHEMISTRY"), heatApproval.retestChemistryComposition !== null || heatApproval.retestNotApplicable !== null);

  const statuses = [analyzeStatus, compareStatus, correctionStatus, materialStatus, retestStatus];
  const doneCount = 1 + statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");
  const activeIdx = activeRel === -1 ? null : activeRel + 1;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={FlaskConical}
          title="Chemistry Sampling & Correction"
          subtitle="Sample, analyze, compare, and correct the heat's chemistry against the required grade."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[0]} doneCount={doneCount} activeIndex={activeIdx} />
        <ContextSummary heatApproval={heatApproval} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStepCard code="P06-A01" title="Liquid Steel Sample Taken" status="done">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Sample reference" value={heatApproval.sampleRef} />
                <Field label="Sampled at" value={heatApproval.sampleTakenAt ? new Date(heatApproval.sampleTakenAt).toLocaleString() : null} />
              </div>
            </SubStepCard>

            <SubStepCard code="P06-A02" title="Analyze Sample in Lab" status={analyzeStatus}>
              {analyzeStatus === "done" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Composition" value={formatChemistry(heatApproval.chemistryComposition)} />
                  <Field label="Lab reference" value={heatApproval.labRef} />
                </div>
              ) : analyzeStatus === "active" ? (
                <AnalyzeSampleForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
              ) : (
                <LockedNote />
              )}
            </SubStepCard>

            <SubStepCard code="P06-A03" title="Compare Chemistry with Required Grade" status={compareStatus}>
              {compareStatus === "done" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Required grade" value={heatApproval.requiredGrade} />
                  <Field label="Matches grade" value={heatApproval.chemistryMatchesGrade ? "Yes" : "No"} />
                  <Field label="Deviation notes" value={heatApproval.chemistryDeviationNotes} />
                </div>
              ) : compareStatus === "active" ? (
                <CompareChemistryForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
              ) : (
                <LockedNote />
              )}
            </SubStepCard>

            <SubStepCard code="P06-A04" title="Decide Correction Requirement" status={correctionStatus}>
              {correctionStatus === "done" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Correction required" value={heatApproval.correctionRequired ? "Yes" : "No"} />
                  <Field label="Reason" value={heatApproval.correctionReason} />
                </div>
              ) : correctionStatus === "active" ? (
                <DecideCorrectionForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
              ) : (
                <LockedNote />
              )}
            </SubStepCard>

            <SubStepCard code="P06-A05" title="Add Correction Material" status={materialStatus}>
              {materialStatus === "done" ? (
                <Field label="Materials" value={heatApproval.correctionMaterials?.length ? `${heatApproval.correctionMaterials.length} item(s)` : "None"} />
              ) : materialStatus === "active" ? (
                <CorrectionMaterialForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
              ) : (
                <LockedNote />
              )}
            </SubStepCard>

            <SubStepCard code="P06-A06" title="Re-test Chemistry" status={retestStatus}>
              {retestStatus === "done" ? (
                <Field label="Re-test result" value={formatChemistry(heatApproval.retestChemistryComposition) ?? "Not applicable"} />
              ) : retestStatus === "active" ? (
                <RetestChemistryForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
              ) : (
                <LockedNote />
              )}
            </SubStepCard>
          </div>
          <ScreenSidebar>
            <HeatApprovalProgress heatApproval={heatApproval} />
            <Sidebar />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
