"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  ChargePreparationService,
  SteelChargePreparation,
  VerifyChargeMaterialPayload,
  ReleaseChargePayload,
  CloseFurnaceHandoverPayload,
} from "@/services/steel-charge-preparation.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p04/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p04/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p04/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p04/ContextSummary";
import { ChargeProgress } from "@/components/steel/p04/ChargeProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p04/screenMap";
import { Field, SubStepCard, SaveButton, LockedNote, SubStepStatus } from "@/components/steel/p04/shared";
import {
  ShieldCheck, Info, ListChecks, Lightbulb, Lock, Flame, CheckCircle2, HelpCircle, Loader2,
} from "lucide-react";

// Same authority scope enforced server-side by the charge-preparation
// controller's RELEASE_ROLES guard on /release-charge and /furnace-handover.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

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
            Check the staged material against the planned recipe, then release the official Charge ID and confirm
            the furnace is ready to receive it.
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
            Closing the furnace handover completes this charge preparation. There is no further step after that.
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
            <li>If the actual weight matches the recipe exactly, no approval is needed to continue.</li>
            <li>Only Management, Admin, or Super Admin can release the Charge ID or close the handover.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P04-A10 — Verification ──

function VerificationForm({
  prep, token, onDone,
}: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [actualWeight, setActualWeight] = useState("");
  const [actualGrade, setActualGrade] = useState("");
  const [varianceApproved, setVarianceApproved] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recipeTotal =
    (prep.recipeScrapWeightTonnes ?? 0) +
    (prep.recipeDriWeightTonnes ?? 0) +
    (prep.recipeAlloyWeightTonnes ?? 0) +
    (prep.recipeAdditiveWeightTonnes ?? 0);
  const previewVariance = actualWeight !== "" ? Number(actualWeight) - recipeTotal : null;

  const mutation = useMutation({
    mutationFn: (payload: VerifyChargeMaterialPayload) => ChargePreparationService.verifyChargeMaterial(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const valid = Number(actualWeight) > 0;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Field label="Recipe total" value={`${recipeTotal} t`} />
      <Input type="number" step="0.001" placeholder="Actual weight (tonnes)" value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} />
      {previewVariance !== null && (
        <p className={`text-xs ${previewVariance === 0 ? "text-emerald-600" : "text-amber-600"}`}>
          {previewVariance === 0
            ? "Actual weight matches the recipe."
            : `Actual weight differs from the planned recipe by ${previewVariance > 0 ? "+" : ""}${previewVariance.toFixed(3)} t.`}
        </p>
      )}
      <Input placeholder="Actual grade (optional)" value={actualGrade} onChange={(e) => setActualGrade(e.target.value)} />
      {previewVariance !== null && previewVariance !== 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={varianceApproved} onChange={(e) => setVarianceApproved(e.target.checked)} />
          Approve this difference — the Charge ID cannot be released until it&apos;s approved
        </label>
      )}
      <Input placeholder="Verification notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button
        size="sm"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate({ actualWeightTonnes: Number(actualWeight), actualGrade: actualGrade || undefined, varianceApproved, verificationNotes: notes || undefined })}
      >
        <SaveButton pending={mutation.isPending} label="Verify material" />
      </Button>
    </div>
  );
}

// ── P04-A11 — authority gate ──

function ReleaseLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin can release the Charge ID for this preparation. Ask a Management
            or Admin user to complete this step.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmReleaseModal({
  prep, onConfirm, onCancel, submitting,
}: { prep: SteelChargePreparation; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Release this Charge ID?</h2>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
          <Field label="Preparation" value={prep.prepNumber} />
          <Field label="Verified weight" value={prep.actualWeightTonnes !== null ? `${prep.actualWeightTonnes} t` : null} />
        </div>
        <p className="text-sm text-slate-500">
          This creates the official Charge ID for this prepared material and cannot be undone from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release Charge ID"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReleasePanel({
  prep, token, canRelease, onDone,
}: { prep: SteelChargePreparation; token: string; canRelease: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const varianceBlocked = prep.weightVarianceTonnes !== null && prep.weightVarianceTonnes !== 0 && !prep.varianceApproved;

  const mutation = useMutation({
    mutationFn: (payload: ReleaseChargePayload) => ChargePreparationService.releaseCharge(prep.id, payload, token),
    onSuccess: () => {
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canRelease) return <ReleaseLockedCard />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {varianceBlocked && (
        <p className="text-xs text-amber-600">
          The weight difference from verification must be approved before the Charge ID can be released.
        </p>
      )}
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={varianceBlocked} onClick={() => setConfirming(true)} className="gap-2">
        <ShieldCheck className="h-4 w-4" />
        Release Charge ID
      </Button>
      {confirming && (
        <ConfirmReleaseModal
          prep={prep}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ releaseNotes: notes || undefined })}
        />
      )}
    </div>
  );
}

// ── P04-A12 — final authority/terminal gate ──

function HandoverLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required to close handover</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin can close the furnace handover for this preparation. Ask a
            Management or Admin user to complete this step.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmHandoverModal({
  prep, heatRef, onConfirm, onCancel, submitting,
}: { prep: SteelChargePreparation; heatRef: string; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Confirm furnace handover?</h2>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
          <Field label="Charge ID" value={prep.chargeNumber} />
          <Field label="Planned heat reference" value={heatRef || null} />
        </div>
        <p className="text-sm text-slate-500">
          This will complete the charge preparation workflow and close this record. It cannot be reopened from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-red-600 hover:bg-red-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close Handover"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HandoverPanel({
  prep, token, canClose, onDone,
}: { prep: SteelChargePreparation; token: string; canClose: boolean; onDone: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [heatRef, setHeatRef] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CloseFurnaceHandoverPayload) => ChargePreparationService.closeFurnaceHandover(prep.id, payload, token),
    onSuccess: () => {
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canClose) return <HandoverLockedCard />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Furnace readiness confirmed
      </label>
      <div className="flex items-center gap-1.5">
        <Input placeholder="Planned heat reference (optional)" value={heatRef} onChange={(e) => setHeatRef(e.target.value)} />
        <Tooltip>
          <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3.5 w-3.5 text-slate-300 shrink-0" />} />
          <TooltipContent>Links this charge to the furnace heat it will be used in, if your site tracks one.</TooltipContent>
        </Tooltip>
      </div>
      <Input placeholder="Handover notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!confirmed && (
        <p className="text-xs text-amber-600">Confirm the furnace is ready before closing the handover.</p>
      )}
      <Button size="sm" disabled={!confirmed} onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
        <Flame className="h-4 w-4" />
        Close Furnace Handover
      </Button>
      {confirming && (
        <ConfirmHandoverModal
          prep={prep}
          heatRef={heatRef}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ furnaceReadinessConfirmed: confirmed, plannedHeatReference: heatRef || undefined, handoverNotes: notes || undefined })}
        />
      )}
    </div>
  );
}

// ── CLOSED terminal state ──

function ClosedState({ prep }: { prep: SteelChargePreparation }) {
  return (
    <Card className="border-emerald-200">
      <CardContent className="py-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Furnace Handover Complete</h2>
          <p className="text-sm text-slate-500 mt-1">{prep.prepNumber} is now closed — Charge ID {prep.chargeNumber}.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-xl mx-auto text-left">
          <Field label="Charge ID" value={prep.chargeNumber} />
          <Field label="Planned Heat Reference" value={prep.plannedHeatReference} />
          <Field label="Closed At" value={prep.handoverClosedAt ? new Date(prep.handoverClosedAt).toLocaleString() : null} />
          <Field label="Handover Notes" value={prep.handoverNotes} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S3VerificationRelease({
  prep, token, onRefresh,
}: { prep: SteelChargePreparation; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const canAct = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = prep.allowedActions ?? [];
  const closed = prep.status === "CLOSED";

  const verificationStatus = subStatus(actions.includes("VERIFY_MATERIAL"), prep.actualWeightTonnes !== null);
  const releaseStatus = subStatus(actions.includes("RELEASE_CHARGE"), !!prep.chargeNumber);
  const handoverStatus = subStatus(actions.includes("CLOSE_HANDOVER"), closed);

  const statuses = [verificationStatus, releaseStatus, handoverStatus];
  const doneCount = closed ? 3 : statuses.filter((s) => s === "done").length;
  const activeIdx = closed ? null : statuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={ShieldCheck}
          title="Verification & Release"
          subtitle="Verify the material, release the Charge ID, and confirm the furnace handover."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[2]} doneCount={doneCount} activeIndex={activeIdx === -1 ? null : activeIdx} />
        <ContextSummary prep={prep} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {closed ? (
              <ClosedState prep={prep} />
            ) : (
              <>
                <SubStepCard code="P04-A10" title="Verify Actual Material vs Recipe" status={verificationStatus}>
                  {verificationStatus === "done" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Actual weight" value={prep.actualWeightTonnes !== null ? `${prep.actualWeightTonnes} t` : null} />
                      <Field label="Actual grade" value={prep.actualGrade} />
                      <Field label="Difference from recipe" value={prep.weightVarianceTonnes !== null ? `${prep.weightVarianceTonnes > 0 ? "+" : ""}${prep.weightVarianceTonnes} t` : null} />
                      <Field label="Difference approved" value={prep.varianceApproved === null ? null : prep.varianceApproved ? "Yes" : "No"} />
                      <Field label="Verification notes" value={prep.verificationNotes} />
                    </div>
                  ) : verificationStatus === "active" ? (
                    <VerificationForm prep={prep} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Charge Release</p>
                  </div>
                  <SubStepCard code="P04-A11" title="Release Charge ID" status={releaseStatus}>
                    {releaseStatus === "done" ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          Charge released — Charge ID <span className="font-mono font-semibold">{prep.chargeNumber}</span>
                        </div>
                        <Field label="Released at" value={prep.chargeReleasedAt ? new Date(prep.chargeReleasedAt).toLocaleString() : null} />
                      </div>
                    ) : releaseStatus === "active" ? (
                      <ReleasePanel prep={prep} token={token} canRelease={canAct} onDone={onRefresh} />
                    ) : (
                      <LockedNote />
                    )}
                  </SubStepCard>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <Flame className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Final Furnace Handover / Authority Gate</p>
                  </div>
                  <SubStepCard code="P04-A12" title="Close Furnace Handover" status={handoverStatus}>
                    {handoverStatus === "active" ? (
                      <HandoverPanel prep={prep} token={token} canClose={canAct} onDone={onRefresh} />
                    ) : (
                      <LockedNote />
                    )}
                  </SubStepCard>
                </div>
              </>
            )}
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
