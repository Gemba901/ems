"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MaterialIntakeService, MaterialAcceptanceDecision } from "@/services/material-intake.service";
import { SteelMaterialType } from "@/services/steel-sourcing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubStepCard, Field, SelectField, SaveButton, LockedNote, StepProps, SubStepStatus } from "./shared";

const MATERIAL_TYPES: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

function AreaForm({ intake, token, onSaved, onError }: StepProps) {
  const [area, setArea] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.assignUnloadingArea(intake.id, { unloadingArea: area }, token),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
      <Input placeholder="Unloading / inspection area" value={area} onChange={(e) => setArea(e.target.value)} />
      <Button size="sm" disabled={!area.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Assign area" />
      </Button>
    </div>
  );
}

function InspectionForm({ intake, token, onSaved, onError }: StepProps) {
  const [materialType, setMaterialType] = useState<SteelMaterialType | "">(
    intake.sourcingOrder.materialType ?? "",
  );
  const [visualNotes, setVisualNotes] = useState("");
  const [hazardFound, setHazardFound] = useState(false);
  const [hazardNotes, setHazardNotes] = useState("");
  const [radiationRequired, setRadiationRequired] = useState(false);
  const [radiationPassed, setRadiationPassed] = useState(false);
  const [grade, setGrade] = useState("");
  const [heatNumber, setHeatNumber] = useState("");
  const [certificateRef, setCertificateRef] = useState("");

  const isBillet = materialType === "BILLET";
  const mutation = useMutation({
    mutationFn: () =>
      MaterialIntakeService.recordInspection(
        intake.id,
        {
          visualInspectionNotes: visualNotes || undefined,
          hazardOrContaminationFound: hazardFound,
          hazardNotes: hazardNotes || undefined,
          radiationCheckRequired: radiationRequired,
          radiationCheckPassed: radiationRequired ? radiationPassed : undefined,
          materialType: materialType || undefined,
          grade: isBillet ? grade || undefined : undefined,
          heatNumber: isBillet ? heatNumber || undefined : undefined,
          certificateRef: isBillet ? certificateRef || undefined : undefined,
        },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });

  const blockedByRadiation = radiationRequired && !radiationPassed;
  const blockedByBillet = isBillet && (!grade.trim() || !heatNumber.trim() || !certificateRef.trim());

  return (
    <div className="space-y-3">
      <SelectField
        label="Material type"
        value={materialType}
        onChange={(v) => setMaterialType(v as SteelMaterialType)}
        options={MATERIAL_TYPES.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))}
      />
      <Input placeholder="Visual inspection notes" value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hazardFound} onChange={(e) => setHazardFound(e.target.checked)} />
        Hazard or contamination found
      </label>
      {hazardFound && (
        <Input placeholder="Hazard / contamination notes" value={hazardNotes} onChange={(e) => setHazardNotes(e.target.value)} />
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={radiationRequired} onChange={(e) => setRadiationRequired(e.target.checked)} />
        Radiation check required for this material
      </label>
      {radiationRequired && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={radiationPassed} onChange={(e) => setRadiationPassed(e.target.checked)} />
            Radiation check passed
          </label>
          {blockedByRadiation && (
            <p className="text-xs text-amber-600">
              Material cannot proceed until the required radiation check passes.
            </p>
          )}
        </>
      )}

      {isBillet && (
        <div className="grid grid-cols-3 gap-3 pt-1">
          <Input placeholder="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Input placeholder="Heat number" value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} />
          <Input placeholder="Certificate reference" value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)} />
        </div>
      )}

      <Button size="sm" disabled={blockedByRadiation || blockedByBillet || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Save inspection" />
      </Button>
    </div>
  );
}

function DecisionForm({ intake, token, onSaved, onError }: StepProps) {
  const [decision, setDecision] = useState<MaterialAcceptanceDecision | "">("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      MaterialIntakeService.recordAcceptanceDecision(intake.id, { decision: decision as MaterialAcceptanceDecision, decisionNotes: notes || undefined }, token),
    onSuccess: onSaved,
    onError,
  });
  const reasonRequired = decision === "HOLD" || decision === "REJECT";
  const valid = decision && (!reasonRequired || notes.trim());

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["ACCEPT", "HOLD", "REJECT"] as MaterialAcceptanceDecision[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDecision(d)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              decision === d
                ? d === "ACCEPT"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : d === "HOLD"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-red-600 text-white border-red-600"
                : "border-input text-slate-600 hover:bg-slate-50"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <Input
        placeholder={reasonRequired ? "Reason (required)" : "Notes (optional)"}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {reasonRequired && !notes.trim() && (
        <p className="text-xs text-amber-600">A reason is required for {decision === "HOLD" ? "hold" : "rejection"}.</p>
      )}
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Save decision" />
      </Button>
    </div>
  );
}

const DECISION_BADGE: Record<MaterialAcceptanceDecision, string> = {
  ACCEPT: "bg-emerald-50 text-emerald-700",
  HOLD: "bg-amber-50 text-amber-700",
  REJECT: "bg-red-50 text-red-700",
};

export function S10Inspection(props: StepProps) {
  const { intake } = props;
  const actions = intake.allowedActions ?? [];

  const areaStatus = subStatus(actions.includes("ASSIGN_UNLOADING_AREA"), intake.unloadingArea !== null);
  const inspectionStatus = subStatus(
    actions.includes("RECORD_INSPECTION"),
    intake.visualInspectionNotes !== null || intake.materialType !== null || intake.acceptanceDecision !== null,
  );
  const decisionDone = intake.acceptanceDecision !== null && !actions.includes("RECORD_ACCEPTANCE_DECISION");
  const decisionStatus = subStatus(actions.includes("RECORD_ACCEPTANCE_DECISION"), decisionDone);

  return (
    <div className="space-y-4">
      <SubStepCard code="P03-A05" title="Assign Unloading / Inspection Area" status={areaStatus}>
        {areaStatus === "done" ? (
          <Field label="Area" value={intake.unloadingArea} />
        ) : areaStatus === "active" ? (
          <AreaForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A06–A09" title="Visual Inspection, Hazard, Radiation & Certificate Checks" status={inspectionStatus}>
        {inspectionStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material type" value={intake.materialType?.replace(/_/g, " ")} />
            <Field label="Visual inspection" value={intake.visualInspectionNotes} />
            <Field label="Hazard / contamination" value={intake.hazardOrContaminationFound ? "Found" : "None"} />
            <Field label="Radiation check" value={intake.radiationCheckRequired ? (intake.radiationCheckPassed ? "Passed" : "Failed") : "Not required"} />
            <Field label="Grade" value={intake.grade} />
            <Field label="Heat number" value={intake.heatNumber} />
            <Field label="Certificate ref" value={intake.certificateRef} />
          </div>
        ) : inspectionStatus === "active" ? (
          <InspectionForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A10" title="Acceptance Decision" status={decisionStatus}>
        {decisionStatus === "done" ? (
          <div className="space-y-2">
            <Badge className={DECISION_BADGE[intake.acceptanceDecision!]}>{intake.acceptanceDecision}</Badge>
            <Field label="Notes / reason" value={intake.decisionNotes} />
          </div>
        ) : decisionStatus === "active" ? (
          <>
            {intake.status === "ON_HOLD" && (
              <p className="text-xs text-amber-600 mb-2">
                Material is on hold — re-decide below to accept or reject.
              </p>
            )}
            <DecisionForm {...props} />
          </>
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
