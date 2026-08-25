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
import { WORKFLOW_STEPS } from "@/components/steel/p03/screenMap";
import { ContextSummary } from "@/components/steel/p03/ContextSummary";
import { IntakeProgress } from "@/components/steel/p03/IntakeProgress";
import { SaveButton, IntakeStatusBadge } from "@/components/steel/p03/shared";
import {
  DocSection, DocGrid, DocField, ProcessDocumentLayout, InfoCard,
} from "@/components/steel/shared/document";
import { LogIn, Info, HelpCircle } from "lucide-react";

// Combines what were previously 4 separate activities (gate arrival —
// already recorded on intake creation; verify PO/delivery documents;
// capture gross weight; safety/access check) into one operational form.
// Documents and safety are hard gates — the intake cannot proceed past the
// gate until both are recorded and pass, exactly as before.

function DocumentsGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [verified, setVerified] = useState(true);
  const [docRef, setDocRef] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: VerifyDocumentsPayload) => MaterialIntakeService.verifyDocuments(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) {
    return (
      <DocGrid cols={3}>
        <DocField label="Purchase order verified" value={intake.purchaseOrderVerified ? "Yes" : "No"} />
        <DocField label="Delivery document reference" value={intake.deliveryDocumentRef} />
        <DocField label="Notes" value={intake.documentVerificationNotes} />
      </DocGrid>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        Purchase order and delivery documents verified
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Delivery document reference (optional)" value={docRef} onChange={(e) => setDocRef(e.target.value)} />
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {!verified && (
        <p className="text-xs text-amber-600">Documents must be verified before the intake can proceed past the gate.</p>
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

function GrossWeightGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordGrossWeightPayload) => MaterialIntakeService.recordGrossWeight(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = Number(weight) > 0;

  if (done) {
    return (
      <DocGrid cols={2}>
        <DocField label="Gross weight" value={`${intake.grossWeightTonnes} t`} />
        <DocField label="Weighed at" value={intake.grossWeighedAt ? new Date(intake.grossWeighedAt).toLocaleString() : null} />
      </DocGrid>
    );
  }

  return (
    <div className="flex items-end gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="w-56">
        <Input type="number" step="0.001" placeholder="Gross weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ grossWeightTonnes: Number(weight) })}>
        <SaveButton pending={mutation.isPending} label="Record gross weight" />
      </Button>
    </div>
  );
}

function SafetyCheckGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: RecordSafetyCheckPayload) => MaterialIntakeService.recordSafetyCheck(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) {
    return (
      <DocGrid cols={2}>
        <DocField label="Safety check" value={intake.safetyCheckPassed ? "Passed" : "Failed"} />
        <DocField label="Notes" value={intake.safetyCheckNotes} />
      </DocGrid>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} />
        Safety and access check passed
      </label>
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!passed && (
        <p className="text-xs text-amber-600">The vehicle cannot proceed past the gate until the safety check passes.</p>
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

export function S1GateDocuments({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const actions = intake.allowedActions ?? [];

  const docsDone = intake.purchaseOrderVerified !== null;
  const weightDone = intake.grossWeightTonnes !== null;
  const safetyDone = intake.safetyCheckPassed !== null;
  const screenComplete = docsDone && weightDone && safetyDone && !actions.some((a) => ["VERIFY_DOCUMENTS", "RECORD_GROSS_WEIGHT", "RECORD_SAFETY_CHECK"].includes(a));

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          code="P03"
          icon={LogIn}
          title="Arrival & Verification"
          subtitle="Verify paperwork, capture gross weight, and clear the vehicle for safety."
          rightContent={<IntakeStatusBadge intake={intake} />}
        />
        <WorkflowIndicator steps={WORKFLOW_STEPS} doneCount={screenComplete ? 1 : 0} activeIndex={0} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <ProcessDocumentLayout
          info={
            <div className="space-y-4">
              <InfoCard
                whatToDo="Verify the delivery paperwork, weigh the vehicle in, and clear it for safety before it proceeds inside."
                whatToEnter="Document verification result, gross weight, and the safety/access check outcome."
                beforeYouContinue={[
                  "Documents and the safety check are hard gates — the intake cannot proceed if either fails.",
                  "Delivery document reference and notes are optional but help downstream audits.",
                ]}
              />
              <IntakeProgress intake={intake} />
            </div>
          }
        >
          <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
            <DocSection number="01" title="Gate Arrival" first>
              <DocGrid cols={4}>
                <DocField label="Vehicle / container number" value={intake.vehicleNumber} kind="inherited" source="Gate log" />
                <DocField label="Driver" value={intake.driverName} kind="inherited" source="Gate log" />
                <DocField label="Transporter" value={intake.transporterName} kind="inherited" source="Gate log" />
                <DocField label="Arrival" value={intake.arrivalDateTime ? new Date(intake.arrivalDateTime).toLocaleString() : null} kind="inherited" source="Gate log" />
                <div className="flex items-center gap-1">
                  <DocField label="Gate entry reference" value={intake.gateEntryRef} kind="inherited" source="Gate log" />
                  {intake.gateEntryRef && (
                    <Tooltip>
                      <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300 mt-3" />} />
                      <TooltipContent>An internal gate log reference, if your site tracks one.</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </DocGrid>
            </DocSection>

            <DocSection number="02" title="Purchase Order & Delivery Documents" status={docsDone ? "done" : actions.includes("VERIFY_DOCUMENTS") ? "active" : "locked"}>
              <DocumentsGroup intake={intake} token={token} onDone={onRefresh} done={docsDone} />
            </DocSection>

            <DocSection number="03" title="Weighbridge — Gross Weight" status={weightDone ? "done" : actions.includes("RECORD_GROSS_WEIGHT") ? "active" : "locked"}>
              <GrossWeightGroup intake={intake} token={token} onDone={onRefresh} done={weightDone} />
            </DocSection>

            <DocSection number="04" title="Safety & Access Check" status={safetyDone ? "done" : actions.includes("RECORD_SAFETY_CHECK") ? "active" : "locked"}>
              <SafetyCheckGroup intake={intake} token={token} onDone={onRefresh} done={safetyDone} />
            </DocSection>
          </div>
        </ProcessDocumentLayout>
      </div>
    </TooltipProvider>
  );
}
