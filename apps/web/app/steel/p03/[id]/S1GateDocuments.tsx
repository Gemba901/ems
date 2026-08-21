"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MaterialIntakeService,
  SteelMaterialIntake,
  VerifyDocumentsPayload,
  RecordGrossWeightPayload,
  RecordSafetyCheckPayload,
} from "@/services/material-intake.service";
import type { SteelSourcingOrder } from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p03/WorkflowIndicator";
import { SCREEN_TOP_STEPS } from "@/components/steel/p03/screenMap";
import { ScreenSidebar } from "@/components/steel/p03/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p03/ContextSummary";
import { IntakeProgress } from "@/components/steel/p03/IntakeProgress";
import { Field, SubStep, SaveButton, SubStepStatus } from "@/components/steel/p03/shared";
import { LogIn, Info, ListChecks, Lightbulb, HelpCircle } from "lucide-react";

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
            S1 covers P03-A02 (verify purchase order and delivery documents), P03-A03 (weighbridge gross weight), and
            P03-A04 (safety and access check). A01 — gate arrival — was already recorded when this intake was
            created.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gate Arrival</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Vehicle / container</dt>
              <dd className="text-slate-700 font-medium text-right">{intake.vehicleNumber}</dd>
            </div>
            {intake.driverName && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Driver</dt>
                <dd className="text-slate-700 font-medium text-right">{intake.driverName}</dd>
              </div>
            )}
            {intake.arrivalDateTime && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Arrival</dt>
                <dd className="text-slate-700 font-medium text-right">{new Date(intake.arrivalDateTime).toLocaleString()}</dd>
              </div>
            )}
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
            Once documents, gross weight, and the safety check are all recorded, this intake moves to S2 — Inspection
            &amp; Acceptance.
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
            <li>Documents and the safety check are hard gates — the intake cannot proceed if either fails.</li>
            <li>Delivery document reference and notes are optional but help downstream audits.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P03-A02 ──

function DocumentsForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [verified, setVerified] = useState(true);
  const [docRef, setDocRef] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: VerifyDocumentsPayload) => MaterialIntakeService.verifyDocuments(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        Purchase order and delivery documents verified
      </label>
      <Input placeholder="Delivery document reference (optional)" value={docRef} onChange={(e) => setDocRef(e.target.value)} />
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!verified && (
        <p className="text-xs text-amber-600">
          Documents must be verified before the intake can proceed past the gate.
        </p>
      )}
      <Button
        size="sm"
        disabled={!verified || mutation.isPending}
        onClick={() => mutation.mutate({ purchaseOrderVerified: verified, deliveryDocumentRef: docRef || undefined, documentVerificationNotes: notes || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Verify documents" />
      </Button>
    </div>
  );
}

// ── P03-A03 ──

function GrossWeightForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordGrossWeightPayload) => MaterialIntakeService.recordGrossWeight(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = Number(weight) > 0;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input type="number" step="0.001" placeholder="Gross weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ grossWeightTonnes: Number(weight) })}>
        <SaveButton pending={mutation.isPending} label="Record gross weight" />
      </Button>
    </div>
  );
}

// ── P03-A04 ──

function SafetyCheckForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordSafetyCheckPayload) => MaterialIntakeService.recordSafetyCheck(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} />
        Safety and access check passed
      </label>
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!passed && (
        <p className="text-xs text-amber-600">
          The vehicle cannot proceed past the gate until the safety check passes.
        </p>
      )}
      <Button
        size="sm"
        disabled={!passed || mutation.isPending}
        onClick={() => mutation.mutate({ safetyCheckPassed: passed, safetyCheckNotes: notes || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Record safety check" />
      </Button>
    </div>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S1GateDocuments({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const actions = intake.allowedActions ?? [];

  const docsStatus = subStatus(actions.includes("VERIFY_DOCUMENTS"), intake.purchaseOrderVerified !== null);
  const weightStatus = subStatus(actions.includes("RECORD_GROSS_WEIGHT"), intake.grossWeightTonnes !== null);
  const safetyStatus = subStatus(actions.includes("RECORD_SAFETY_CHECK"), intake.safetyCheckPassed !== null);
  const stepStatuses: SubStepStatus[] = ["done", docsStatus, weightStatus, safetyStatus];
  const doneCount = stepStatuses.filter((s) => s === "done").length;
  const activeIdx = stepStatuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
        code="P03"
          icon={LogIn}
          title="Gate & Documents"
          subtitle="Verify paperwork, capture gross weight, and clear the vehicle for safety."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[0]} doneCount={doneCount} activeIndex={activeIdx === -1 ? null : activeIdx} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStep
              code="P03-A01"
              title="Gate Arrival"
              status="done"
              summary={`Vehicle ${intake.vehicleNumber ?? "—"}${intake.arrivalDateTime ? ` · arrived ${new Date(intake.arrivalDateTime).toLocaleString()}` : ""}`}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vehicle / container number" value={intake.vehicleNumber} />
                <Field label="Driver" value={intake.driverName} />
                <Field label="Transporter" value={intake.transporterName} />
                <Field label="Arrival" value={intake.arrivalDateTime ? new Date(intake.arrivalDateTime).toLocaleString() : null} />
                <div className="flex items-center gap-1">
                  <Field label="Gate entry reference" value={intake.gateEntryRef} />
                  {intake.gateEntryRef && (
                    <Tooltip>
                      <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300 mt-3" />} />
                      <TooltipContent>An internal gate log reference, if your site tracks one.</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </SubStep>

            <SubStep
              code="P03-A02"
              title="Verify Purchase Order & Delivery Documents"
              status={docsStatus}
              summary={`Documents ${intake.purchaseOrderVerified ? "verified" : "not verified"}${intake.deliveryDocumentRef ? ` · ${intake.deliveryDocumentRef}` : ""}`}
            >
              {docsStatus === "active" && <DocumentsForm intake={intake} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P03-A03"
              title="Weighbridge — Gross Weight"
              status={weightStatus}
              summary={intake.grossWeightTonnes ? `Gross weight ${intake.grossWeightTonnes} t` : undefined}
            >
              {weightStatus === "active" && <GrossWeightForm intake={intake} token={token} onDone={onRefresh} />}
            </SubStep>

            <SubStep
              code="P03-A04"
              title="Safety & Access Check"
              status={safetyStatus}
              summary={`Safety check ${intake.safetyCheckPassed ? "passed" : "failed"}`}
            >
              {safetyStatus === "active" && <SafetyCheckForm intake={intake} token={token} onDone={onRefresh} />}
            </SubStep>
          </div>
          <Sidebar intake={intake} />
        </div>
      </div>
    </TooltipProvider>
  );
}
