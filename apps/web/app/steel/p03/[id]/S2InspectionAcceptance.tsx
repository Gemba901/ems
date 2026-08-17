"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  MaterialIntakeService,
  SteelMaterialIntake,
  MaterialAcceptanceDecision,
  AssignUnloadingAreaPayload,
  RecordInspectionPayload,
  RecordAcceptanceDecisionPayload,
} from "@/services/material-intake.service";
import { SteelMaterialType } from "@/services/steel-sourcing.service";
import type { SteelSourcingOrder } from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p03/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p03/WorkflowIndicator";
import { SCREEN_TOP_STEPS } from "@/components/steel/p03/screenMap";
import { ScreenSidebar } from "@/components/steel/p03/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p03/ContextSummary";
import { IntakeProgress } from "@/components/steel/p03/IntakeProgress";
import { Field, SelectField, SubStepCard, SaveButton, LockedNote, SubStepStatus } from "@/components/steel/p03/shared";
import {
  ClipboardCheck, Info, ListChecks, Lightbulb, Gavel, Lock, XCircle, AlertTriangle, HelpCircle,
  ThumbsUp, PauseCircle,
} from "lucide-react";

// Same authority scope enforced server-side by the material-intake
// controller's RELEASE_ROLES guard on /decision — kept identical rather
// than inventing a new list.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

const MATERIAL_TYPES: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ intake }: { intake: SteelMaterialIntake }) {
  return (
    <ScreenSidebar>
      <IntakeProgress intake={intake} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            S2 covers P03-A05 (assign an unloading/inspection area), P03-A06–A09 (visual, hazard, radiation, and
            certificate checks — recorded together), and P03-A10 (the Management acceptance decision).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gate &amp; Weighing (from S1)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Gross weight</dt>
              <dd className="text-slate-700 font-medium text-right">{intake.grossWeightTonnes ? `${intake.grossWeightTonnes} t` : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Safety check</dt>
              <dd className="text-slate-700 font-medium text-right">{intake.safetyCheckPassed ? "Passed" : "—"}</dd>
            </div>
          </dl>
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
            An ACCEPT decision moves this intake to S3 — Unloading, Storage &amp; Release. HOLD pauses it for
            re-decision; REJECT closes it.
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
            <li>Radiation fields only apply when the check is flagged as required.</li>
            <li>Grade, heat number, and certificate reference are required only for Billet material.</li>
            <li>Hazard/contamination is recorded for the record — it doesn&apos;t block progress on its own.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P03-A05 ──

function AreaForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: AssignUnloadingAreaPayload) => MaterialIntakeService.assignUnloadingArea(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Unloading / inspection area" value={area} onChange={(e) => setArea(e.target.value)} />
      <Button size="sm" disabled={!area.trim() || mutation.isPending} onClick={() => mutation.mutate({ unloadingArea: area })}>
        <SaveButton pending={mutation.isPending} label="Assign area" />
      </Button>
    </div>
  );
}

// ── P03-A06–A09 (combined) ──

function InspectionForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [materialType, setMaterialType] = useState<SteelMaterialType | "">(intake.sourcingOrder.materialType ?? "");
  const [visualNotes, setVisualNotes] = useState("");
  const [hazardFound, setHazardFound] = useState(false);
  const [hazardNotes, setHazardNotes] = useState("");
  const [radiationRequired, setRadiationRequired] = useState(false);
  const [radiationPassed, setRadiationPassed] = useState(false);
  const [grade, setGrade] = useState("");
  const [heatNumber, setHeatNumber] = useState("");
  const [certificateRef, setCertificateRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isBillet = materialType === "BILLET";
  const mutation = useMutation({
    mutationFn: (payload: RecordInspectionPayload) => MaterialIntakeService.recordInspection(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const blockedByRadiation = radiationRequired && !radiationPassed;
  const blockedByBillet = isBillet && (!grade.trim() || !heatNumber.trim() || !certificateRef.trim());

  const handleSave = () => {
    setError(null);
    mutation.mutate({
      visualInspectionNotes: visualNotes || undefined,
      hazardOrContaminationFound: hazardFound,
      hazardNotes: hazardNotes || undefined,
      radiationCheckRequired: radiationRequired,
      radiationCheckPassed: radiationRequired ? radiationPassed : undefined,
      materialType: materialType || undefined,
      grade: isBillet ? grade || undefined : undefined,
      heatNumber: isBillet ? heatNumber || undefined : undefined,
      certificateRef: isBillet ? certificateRef || undefined : undefined,
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
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

      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={radiationRequired} onChange={(e) => setRadiationRequired(e.target.checked)} />
          Radiation check required for this material
        </label>
        <Tooltip>
          <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300" />} />
          <TooltipContent>Only flag this if your site&apos;s procedure requires a radiation check for this material type.</TooltipContent>
        </Tooltip>
      </div>
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
          <Input placeholder="Grade (required)" value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Input placeholder="Heat number (required)" value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} />
          <Input placeholder="Certificate reference (required)" value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)} />
        </div>
      )}

      <Button size="sm" disabled={blockedByRadiation || blockedByBillet || mutation.isPending} onClick={handleSave}>
        <SaveButton pending={mutation.isPending} label="Save inspection" />
      </Button>
    </div>
  );
}

// ── P03-A10 — authority gate ──

function AcceptanceLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management decision required</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management or Admin can accept, hold, or reject this delivery. Ask a Management or Admin user to
            make the call before it can move forward.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmRejectModal({
  onConfirm, onCancel, submitting,
}: { onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reject-modal-title"
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <XCircle className="h-5 w-5 text-red-600" />
          </div>
          <h2 id="reject-modal-title" className="text-base font-bold text-slate-900">Reject this delivery?</h2>
        </div>
        <p className="text-sm text-slate-500">
          This delivery will be marked as <span className="font-medium text-slate-700">REJECTED</span> and will not
          proceed to Charge Preparation. This cannot be undone from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} ref={cancelRef}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={submitting} className="gap-2">
            <SaveButton pending={submitting} label="Reject Delivery" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DecisionForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [decision, setDecision] = useState<MaterialAcceptanceDecision | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: RecordAcceptanceDecisionPayload) => MaterialIntakeService.recordAcceptanceDecision(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => {
      setError(err.message);
      setConfirmingReject(false);
    },
  });
  const reasonRequired = decision === "HOLD" || decision === "REJECT";
  const valid = decision && (!reasonRequired || notes.trim());
  const submitDecision = () =>
    mutation.mutate({ decision: decision as MaterialAcceptanceDecision, decisionNotes: notes || undefined });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {intake.status === "ON_HOLD" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          This intake is on hold — re-decide below to accept or reject.
        </div>
      )}
      <div role="radiogroup" aria-label="Acceptance decision" className="grid grid-cols-3 gap-2">
        {(
          [
            { d: "ACCEPT" as const, Icon: ThumbsUp, hint: "Proceed to unloading & storage", active: "bg-emerald-600 text-white border-emerald-600" },
            { d: "HOLD" as const, Icon: PauseCircle, hint: "Pause for re-decision", active: "bg-amber-500 text-white border-amber-500" },
            { d: "REJECT" as const, Icon: XCircle, hint: "Close the intake — cannot proceed", active: "bg-red-600 text-white border-red-600" },
          ]
        ).map(({ d, Icon, hint, active }) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decision === d}
            onClick={() => setDecision(d)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              decision === d ? active : "border-input text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {d}
            <span className={`text-[10px] font-normal leading-tight text-center ${decision === d ? "text-white/85" : "text-slate-400"}`}>
              {hint}
            </span>
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
      <Button
        size="sm"
        disabled={!valid || mutation.isPending}
        onClick={() => (decision === "REJECT" ? setConfirmingReject(true) : submitDecision())}
      >
        <SaveButton pending={mutation.isPending} label="Save decision" />
      </Button>

      {confirmingReject && (
        <ConfirmRejectModal
          submitting={mutation.isPending}
          onCancel={() => setConfirmingReject(false)}
          onConfirm={submitDecision}
        />
      )}
    </div>
  );
}

// ── REJECTED terminal state ──

function RejectedState({ intake }: { intake: SteelMaterialIntake }) {
  return (
    <Card className="border-red-200">
      <CardContent className="py-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Material Intake Rejected</h2>
          <p className="text-sm text-slate-500 mt-1">{intake.intakeNumber} was rejected and cannot proceed further.</p>
        </div>
        {intake.decisionNotes && (
          <p className="text-sm text-slate-600 max-w-md mx-auto">&quot;{intake.decisionNotes}&quot;</p>
        )}
      </CardContent>
    </Card>
  );
}

const DECISION_BADGE: Record<MaterialAcceptanceDecision, string> = {
  ACCEPT: "bg-emerald-50 text-emerald-700",
  HOLD: "bg-amber-50 text-amber-700",
  REJECT: "bg-red-50 text-red-700",
};

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S2InspectionAcceptance({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const { user } = useAuthStore();
  const canDecide = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = intake.allowedActions ?? [];

  const areaStatus = subStatus(actions.includes("ASSIGN_UNLOADING_AREA"), intake.unloadingArea !== null);
  const inspectionStatus = subStatus(
    actions.includes("RECORD_INSPECTION"),
    intake.visualInspectionNotes !== null || intake.materialType !== null || intake.acceptanceDecision !== null,
  );
  const decisionDone = intake.acceptanceDecision !== null && !actions.includes("RECORD_ACCEPTANCE_DECISION");
  const decisionStatus = subStatus(actions.includes("RECORD_ACCEPTANCE_DECISION"), decisionDone);
  const stepStatuses: SubStepStatus[] = [areaStatus, inspectionStatus, decisionStatus];
  const doneCount = stepStatuses.filter((s) => s === "done").length;
  const activeIdx = intake.status === "REJECTED" ? -1 : stepStatuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={ClipboardCheck}
          title="Inspection & Acceptance"
          subtitle="Inspect the material and record the Management accept/hold/reject decision."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[1]} doneCount={doneCount} activeIndex={activeIdx === -1 ? null : activeIdx} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {intake.status === "REJECTED" ? (
              <RejectedState intake={intake} />
            ) : (
              <>
                <SubStepCard code="P03-A05" title="Assign Unloading / Inspection Area" status={areaStatus}>
                  {areaStatus === "done" ? (
                    <Field label="Area" value={intake.unloadingArea} />
                  ) : areaStatus === "active" ? (
                    <AreaForm intake={intake} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P03-A06–A09" title="Visual, Hazard, Radiation & Certificate Checks" status={inspectionStatus}>
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
                    <InspectionForm intake={intake} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <Gavel className="h-3.5 w-3.5 text-slate-400" />
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Management Acceptance Decision</p>
                  </div>
                  <SubStepCard code="P03-A10" title="Acceptance Decision" status={decisionStatus}>
                    {decisionStatus === "done" ? (
                      <div className="space-y-2">
                        <Badge className={DECISION_BADGE[intake.acceptanceDecision!]}>{intake.acceptanceDecision}</Badge>
                        <Field label="Notes / reason" value={intake.decisionNotes} />
                      </div>
                    ) : decisionStatus === "active" ? (
                      canDecide ? (
                        <DecisionForm intake={intake} token={token} onDone={onRefresh} />
                      ) : (
                        <AcceptanceLockedCard />
                      )
                    ) : (
                      <LockedNote />
                    )}
                  </SubStepCard>
                </div>
              </>
            )}
          </div>
          <Sidebar intake={intake} />
        </div>
      </div>
    </TooltipProvider>
  );
}
