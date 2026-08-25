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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p03/WorkflowIndicator";
import { WORKFLOW_STEPS } from "@/components/steel/p03/screenMap";
import { ContextSummary } from "@/components/steel/p03/ContextSummary";
import { IntakeProgress } from "@/components/steel/p03/IntakeProgress";
import { SelectField, SaveButton, IntakeStatusBadge } from "@/components/steel/p03/shared";
import {
  DocSection, DocGrid, DocField, ProcessDocumentLayout, InfoCard,
} from "@/components/steel/shared/document";
import {
  ClipboardCheck, Gavel, XCircle, AlertTriangle, HelpCircle, ThumbsUp, PauseCircle, Hourglass,
} from "lucide-react";

// Same authority scope enforced server-side by the material-intake
// controller's RELEASE_ROLES guard on /decision — kept identical rather
// than inventing a new list.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

const MATERIAL_TYPES: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];

// ── Unloading / inspection area ──

function AreaGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: AssignUnloadingAreaPayload) => MaterialIntakeService.assignUnloadingArea(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) return <DocGrid cols={2}><DocField label="Unloading / inspection area" value={intake.unloadingArea} /></DocGrid>;

  return (
    <div className="flex items-end gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="w-64">
        <Input placeholder="Unloading / inspection area" value={area} onChange={(e) => setArea(e.target.value)} />
      </div>
      <Button size="sm" disabled={!area.trim() || mutation.isPending} onClick={() => mutation.mutate({ unloadingArea: area })}>
        <SaveButton pending={mutation.isPending} label="Assign area" />
      </Button>
    </div>
  );
}

// ── Visual / hazard / radiation / certificate — combined inspection ──

function InspectionGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
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

  if (done) {
    return (
      <DocGrid cols={3}>
        <DocField label="Material type" value={intake.materialType?.replace(/_/g, " ")} />
        <DocField label="Visual inspection notes" value={intake.visualInspectionNotes} />
        <DocField label="Hazard / contamination" value={intake.hazardOrContaminationFound ? `Yes${intake.hazardNotes ? ` — ${intake.hazardNotes}` : ""}` : "None found"} />
        {intake.radiationCheckRequired && (
          <DocField label="Radiation check" value={intake.radiationCheckPassed ? "Passed" : "Failed"} />
        )}
        {intake.materialType === "BILLET" && (
          <>
            <DocField label="Grade" value={intake.grade} />
            <DocField label="Heat number" value={intake.heatNumber} />
            <DocField label="Certificate reference" value={intake.certificateRef} />
          </>
        )}
      </DocGrid>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Material type"
          value={materialType}
          onChange={(v) => setMaterialType(v as SteelMaterialType)}
          options={MATERIAL_TYPES.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))}
        />
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Visual inspection notes</label>
          <Input placeholder="Notes (optional)" value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} />
        </div>
      </div>

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
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={radiationPassed} onChange={(e) => setRadiationPassed(e.target.checked)} />
            Radiation check passed
          </label>
          {blockedByRadiation && (
            <p className="text-xs text-amber-600">Material cannot proceed until the required radiation check passes.</p>
          )}
        </div>
      )}

      {isBillet && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-500 mb-2">Billet — grade, heat number, and certificate reference required</p>
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="Grade (required)" value={grade} onChange={(e) => setGrade(e.target.value)} />
            <Input placeholder="Heat number (required)" value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} />
            <Input placeholder="Certificate reference (required)" value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)} />
          </div>
        </div>
      )}

      <Button size="sm" disabled={blockedByRadiation || blockedByBillet || mutation.isPending} onClick={handleSave}>
        <SaveButton pending={mutation.isPending} label="Save inspection" />
      </Button>
    </div>
  );
}

// ── Acceptance decision — role-gated ──

function AwaitingDecisionNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2.5">
      <Hourglass className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Awaiting Management decision</p>
        <p className="text-xs text-amber-700/90 mt-0.5">
          Only Management or Admin can accept, hold, or reject this delivery. It will move forward once one of them
          decides.
        </p>
      </div>
    </div>
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

function DecisionGroup({
  intake, token, onDone, canDecide,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; canDecide: boolean }) {
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

  if (!canDecide) return <AwaitingDecisionNote />;

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

// ── Screen shell ──────────────────────────────────────────────────────────

export function S2InspectionAcceptance({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const { user } = useAuthStore();
  const canDecide = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = intake.allowedActions ?? [];

  const areaDone = intake.unloadingArea !== null;
  const inspectionDone = intake.visualInspectionNotes !== null || intake.materialType !== null || intake.acceptanceDecision !== null;
  const decisionDone = intake.acceptanceDecision !== null && !actions.includes("RECORD_ACCEPTANCE_DECISION");
  const screenComplete = decisionDone;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          code="P03"
          icon={ClipboardCheck}
          title="Material Inspection"
          subtitle="Inspect the material and record the Management accept/hold/reject decision."
          rightContent={<IntakeStatusBadge intake={intake} />}
        />
        <WorkflowIndicator steps={WORKFLOW_STEPS} doneCount={screenComplete ? 2 : 1} activeIndex={intake.status === "REJECTED" ? null : 1} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <ProcessDocumentLayout
          info={
            <div className="space-y-4">
              <InfoCard
                whatToDo="Assign an unloading/inspection area, record the visual, hazard, radiation, and certificate checks, then let Management decide whether to accept, hold, or reject the delivery."
                whatToEnter="The inspection findings, and — if you have decision authority — the accept/hold/reject outcome."
                beforeYouContinue={[
                  "Radiation fields only apply when the check is flagged as required.",
                  "Grade, heat number, and certificate reference are required only for Billet material.",
                  "Hold and reject both require a reason.",
                ]}
              />
              <IntakeProgress intake={intake} />
            </div>
          }
        >
          {intake.status === "REJECTED" ? (
            <RejectedState intake={intake} />
          ) : (
            <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
              <DocSection number="01" title="Unloading / Inspection Area" status={areaDone ? "done" : actions.includes("ASSIGN_UNLOADING_AREA") ? "active" : "locked"} first>
                <AreaGroup intake={intake} token={token} onDone={onRefresh} done={areaDone} />
              </DocSection>

              <DocSection
                number="02"
                title="Visual, Hazard, Radiation & Certificate Checks"
                status={inspectionDone ? "done" : actions.includes("RECORD_INSPECTION") ? "active" : "locked"}
              >
                <InspectionGroup intake={intake} token={token} onDone={onRefresh} done={inspectionDone} />
              </DocSection>

              <DocSection
                number="03"
                title="Management Acceptance Decision"
                status={decisionDone ? "done" : actions.includes("RECORD_ACCEPTANCE_DECISION") ? "active" : "locked"}
                action={<Gavel className="h-3.5 w-3.5 text-slate-400" />}
              >
                {decisionDone ? (
                  <DocGrid cols={2}>
                    <DocField label="Decision" value={intake.acceptanceDecision} />
                    <DocField label="Notes" value={intake.decisionNotes} />
                  </DocGrid>
                ) : actions.includes("RECORD_ACCEPTANCE_DECISION") ? (
                  <DecisionGroup intake={intake} token={token} onDone={onRefresh} canDecide={canDecide} />
                ) : (
                  <p className="text-sm text-slate-400">Complete the checks above first.</p>
                )}
              </DocSection>
            </div>
          )}
        </ProcessDocumentLayout>
      </div>
    </TooltipProvider>
  );
}
