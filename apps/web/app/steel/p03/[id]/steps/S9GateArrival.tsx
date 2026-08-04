"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubStepCard, Field, SaveButton, LockedNote, StepProps, SubStepStatus } from "./shared";

// P03-A01 is already recorded at creation time (vehicle/driver/arrival details
// captured on the "New Material Intake" form) — this screen covers A02-A04.

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

function DocumentsForm({ intake, token, onSaved, onError }: StepProps) {
  const [verified, setVerified] = useState(true);
  const [docRef, setDocRef] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      MaterialIntakeService.verifyDocuments(
        intake.id,
        { purchaseOrderVerified: verified, deliveryDocumentRef: docRef || undefined, documentVerificationNotes: notes || undefined },
        token,
      ),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
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
      <Button size="sm" disabled={!verified || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Verify documents" />
      </Button>
    </div>
  );
}

function GrossWeightForm({ intake, token, onSaved, onError }: StepProps) {
  const [weight, setWeight] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.recordGrossWeight(intake.id, { grossWeightTonnes: Number(weight) }, token),
    onSuccess: onSaved,
    onError,
  });
  const valid = Number(weight) > 0;
  return (
    <div className="space-y-3">
      <Input type="number" step="0.001" placeholder="Gross weight (tonnes)" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record gross weight" />
      </Button>
    </div>
  );
}

function SafetyCheckForm({ intake, token, onSaved, onError }: StepProps) {
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => MaterialIntakeService.recordSafetyCheck(intake.id, { safetyCheckPassed: passed, safetyCheckNotes: notes || undefined }, token),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="space-y-3">
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
      <Button size="sm" disabled={!passed || mutation.isPending} onClick={() => mutation.mutate()}>
        <SaveButton pending={mutation.isPending} label="Record safety check" />
      </Button>
    </div>
  );
}

export function S9GateArrival(props: StepProps) {
  const { intake } = props;
  const actions = intake.allowedActions ?? [];

  const docsStatus = subStatus(actions.includes("VERIFY_DOCUMENTS"), intake.purchaseOrderVerified !== null);
  const weightStatus = subStatus(actions.includes("RECORD_GROSS_WEIGHT"), intake.grossWeightTonnes !== null);
  const safetyStatus = subStatus(actions.includes("RECORD_SAFETY_CHECK"), intake.safetyCheckPassed !== null);

  return (
    <div className="space-y-4">
      <SubStepCard code="P03-A01" title="Gate Arrival" status="done">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle / container number" value={intake.vehicleNumber} />
          <Field label="Driver" value={intake.driverName} />
          <Field label="Transporter" value={intake.transporterName} />
          <Field label="Arrival" value={intake.arrivalDateTime ? new Date(intake.arrivalDateTime).toLocaleString() : null} />
          <Field label="Gate entry reference" value={intake.gateEntryRef} />
        </div>
      </SubStepCard>

      <SubStepCard code="P03-A02" title="Verify Purchase Order & Delivery Documents" status={docsStatus}>
        {docsStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Verified" value={intake.purchaseOrderVerified ? "Yes" : "No"} />
            <Field label="Document reference" value={intake.deliveryDocumentRef} />
            <Field label="Notes" value={intake.documentVerificationNotes} />
          </div>
        ) : docsStatus === "active" ? (
          <DocumentsForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A03" title="Weighbridge — Gross Weight" status={weightStatus}>
        {weightStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross weight" value={intake.grossWeightTonnes ? `${intake.grossWeightTonnes} t` : null} />
            <Field label="Weighed at" value={intake.grossWeighedAt ? new Date(intake.grossWeighedAt).toLocaleString() : null} />
          </div>
        ) : weightStatus === "active" ? (
          <GrossWeightForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>

      <SubStepCard code="P03-A04" title="Safety & Access Check" status={safetyStatus}>
        {safetyStatus === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Passed" value={intake.safetyCheckPassed ? "Yes" : "No"} />
            <Field label="Notes" value={intake.safetyCheckNotes} />
          </div>
        ) : safetyStatus === "active" ? (
          <SafetyCheckForm {...props} />
        ) : (
          <LockedNote />
        )}
      </SubStepCard>
    </div>
  );
}
