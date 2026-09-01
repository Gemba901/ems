"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  MaterialIntakeService,
  SteelMaterialIntake,
  RecordUnloadingPayload,
  RecordNetWeightPayload,
  AssignYardLocationPayload,
  ReleaseToStockPayload,
} from "@/services/material-intake.service";
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
import { Field, SaveButton, IntakeStatusBadge } from "@/components/steel/p03/shared";
import {
  DocSection, DocGrid, DocField, ProcessDocumentLayout, InfoCard,
} from "@/components/steel/shared/document";
import {
  PackageCheck, ShieldCheck, Check, ArrowRight, HelpCircle, Loader2, Hourglass,
} from "lucide-react";

// Same authority scope enforced server-side by the material-intake
// controller's RELEASE_ROLES guard on /release — kept identical rather
// than inventing a new list.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// ── Unloading confirmation ──

function UnloadingGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordUnloadingPayload) => MaterialIntakeService.recordUnloading(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) return <DocGrid cols={2}><DocField label="Unloaded at" value={intake.unloadedAt ? new Date(intake.unloadedAt).toLocaleString() : null} /></DocGrid>;

  return (
    <div className="flex items-center gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-sm text-slate-600">Confirm the accepted material has been safely unloaded.</p>
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({})}>
        <SaveButton pending={mutation.isPending} label="Confirm unloading" />
      </Button>
    </div>
  );
}

// ── Tare weight / net weight preview ──

function NetWeightGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [tare, setTare] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordNetWeightPayload) => MaterialIntakeService.recordNetWeight(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  const grossWeight = intake.grossWeightTonnes ?? 0;
  const tareNum = Number(tare);
  const valid = tare !== "" && tareNum >= 0 && tareNum <= grossWeight;
  const preview = tare !== "" && tareNum <= grossWeight ? grossWeight - tareNum : null;

  if (done) {
    return (
      <DocGrid cols={3}>
        <DocField label="Gross weight" value={`${intake.grossWeightTonnes} t`} kind="inherited" source="S1 weighbridge" />
        <DocField label="Tare weight" value={`${intake.tareWeightTonnes} t`} />
        <DocField label="Net weight" value={`${intake.netWeightTonnes} t`} kind="calculated" source="Gross − Tare" />
      </DocGrid>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DocGrid cols={3}>
        <DocField label="Gross weight" value={`${grossWeight} t`} kind="inherited" source="S1 weighbridge" />
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm font-medium text-slate-700">Tare weight (tonnes)</label>
            <Tooltip>
              <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300" />} />
              <TooltipContent>We work out the net weight for you once you enter the tare weight.</TooltipContent>
            </Tooltip>
          </div>
          <Input type="number" step="0.001" value={tare} onChange={(e) => setTare(e.target.value)} />
        </div>
        {preview !== null && <DocField label="Net weight (preview)" value={`${preview.toFixed(3)} t`} kind="calculated" source="Gross − Tare" />}
      </DocGrid>
      {tare !== "" && tareNum > grossWeight && (
        <p className="text-xs text-red-600">Tare weight cannot exceed gross weight.</p>
      )}
      {preview !== null && (
        <p className="text-xs text-slate-400">Estimated net weight — confirmed server-side when you save.</p>
      )}
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ tareWeightTonnes: Number(tare) })}>
        <SaveButton pending={mutation.isPending} label="Record net weight" />
      </Button>
    </div>
  );
}

// ── Yard location ──

function YardLocationGroup({
  intake, token, onDone, done,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void; done: boolean }) {
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: AssignYardLocationPayload) => MaterialIntakeService.assignYardLocation(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (done) return <DocGrid cols={2}><DocField label="Yard location" value={intake.yardLocation} /></DocGrid>;

  return (
    <div className="flex items-end gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="w-64">
        <Input placeholder="Yard location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <Button size="sm" disabled={!location.trim() || mutation.isPending} onClick={() => mutation.mutate({ yardLocation: location })}>
        <SaveButton pending={mutation.isPending} label="Assign yard location" />
      </Button>
    </div>
  );
}

// ── Final release — role-gated, confirm modal ──

function AwaitingReleaseNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2.5">
      <Hourglass className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Awaiting Management approval to release stock</p>
        <p className="text-xs text-amber-700/90 mt-0.5">
          Only Management or Admin can release this delivery to stock.
        </p>
      </div>
    </div>
  );
}

function ConfirmReleaseModal({
  intake, onConfirm, onCancel, submitting,
}: { intake: SteelMaterialIntake; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
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
        aria-labelledby="release-modal-title"
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-red-600" />
          </div>
          <h2 id="release-modal-title" className="text-base font-bold text-slate-900">Release this material to stock?</h2>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-slate-400 block">Intake</span>{intake.intakeNumber}</div>
          <div><span className="text-slate-400 block">Yard location</span>{intake.yardLocation ?? "—"}</div>
        </div>
        <p className="text-sm text-slate-500">
          This is final. The material intake will move to <span className="font-medium text-slate-700">RELEASED</span> and
          cannot be reverted from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} ref={cancelRef}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-red-600 hover:bg-red-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release to Stock"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReleaseGroup({
  intake, token, canRelease, onDone,
}: { intake: SteelMaterialIntake; token: string; canRelease: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReleaseToStockPayload) => MaterialIntakeService.releaseToStock(intake.id, payload, token),
    onSuccess: () => {
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canRelease) return <AwaitingReleaseNote />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
        Releasing to stock updates this material intake. Full inventory tracking isn&apos;t connected yet, but that&apos;s
        on the way.
      </div>
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
        <ShieldCheck className="h-4 w-4" />
        Release to Stock
      </Button>
      {confirming && (
        <ConfirmReleaseModal
          intake={intake}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ stockReleaseNotes: notes || undefined })}
        />
      )}
    </div>
  );
}

// ── RELEASED terminal state ──

function ReleasedState({ intake }: { intake: SteelMaterialIntake }) {
  return (
    <Card className="border-emerald-200">
      <CardContent className="py-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Material Released to Stock</h2>
          <p className="text-sm text-slate-500 mt-1">{intake.intakeNumber} is now RELEASED.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-xl mx-auto text-left">
          <Field label="Yard Location" value={intake.yardLocation} />
          <Field label="Net Weight" value={intake.netWeightTonnes !== null ? `${intake.netWeightTonnes} t` : null} />
          <Field label="Released At" value={intake.stockReleasedAt ? new Date(intake.stockReleasedAt).toLocaleString() : null} />
          <Field label="Release Notes" value={intake.stockReleaseNotes} />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 max-w-md mx-auto">
          This does not automatically create a P04 charge preparation. Attach this intake as a material lot from
          P04&apos;s own workflow when preparing a charge.
        </div>
        <Link href="/steel/p04">
          <Button className="gap-2">
            Go to Charge Preparation (P04) <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Screen shell ────────────────────────────────────────────────────────

export function S3UnloadingStorageRelease({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const { user } = useAuthStore();
  const canRelease = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = intake.allowedActions ?? [];
  const released = intake.status === "RELEASED";

  const unloadingDone = intake.unloadedAt !== null;
  const weightDone = intake.netWeightTonnes !== null;
  const yardDone = intake.yardLocation !== null;

  if (intake.acceptanceDecision !== "ACCEPT" && !released) {
    return (
      <TooltipProvider>
        <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
          <ScreenHeader
            code="P03"
            icon={PackageCheck}
            title="Weigh, Store & Release"
            subtitle="Unload, weigh net, store, and release the material to stock."
            rightContent={<IntakeStatusBadge intake={intake} />}
          />
          <WorkflowIndicator steps={WORKFLOW_STEPS} doneCount={1} activeIndex={null} />
          <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-slate-500">
                Only accepted material proceeds to unloading. This intake was {intake.acceptanceDecision?.toLowerCase() ?? "not yet decided"}.
              </p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          code="P03"
          icon={PackageCheck}
          title="Weigh, Store & Release"
          subtitle="Unload, weigh net, store, and release the material to stock."
          rightContent={<IntakeStatusBadge intake={intake} />}
        />
        <WorkflowIndicator steps={WORKFLOW_STEPS} doneCount={released ? 3 : 2} activeIndex={released ? null : 2} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <ProcessDocumentLayout
          info={
            <div className="space-y-4">
              <InfoCard
                whatToDo="Confirm unloading, capture the tare weight (we calculate net weight for you), assign a yard location, and release the material to stock."
                whatToEnter="Tare weight and yard location. Release is final and Management/Admin-only."
                beforeYouContinue={[
                  "We work out the net weight for you from the gross and tare weights — you don't enter it directly.",
                  "Only Management, Admin, or Super Admin can release material to stock.",
                ]}
              />
              <IntakeProgress intake={intake} />
            </div>
          }
        >
          {released ? (
            <ReleasedState intake={intake} />
          ) : (
            <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
              <DocSection number="01" title="Unload Approved Material" status={unloadingDone ? "done" : actions.includes("RECORD_UNLOADING") ? "active" : "locked"} first>
                <UnloadingGroup intake={intake} token={token} onDone={onRefresh} done={unloadingDone} />
              </DocSection>

              <DocSection number="02" title="Tare Weight & Net Weight" status={weightDone ? "done" : actions.includes("RECORD_NET_WEIGHT") ? "active" : "locked"}>
                <NetWeightGroup intake={intake} token={token} onDone={onRefresh} done={weightDone} />
              </DocSection>

              <DocSection number="03" title="Store Material in Yard Location" status={yardDone ? "done" : actions.includes("ASSIGN_YARD_LOCATION") ? "active" : "locked"}>
                <YardLocationGroup intake={intake} token={token} onDone={onRefresh} done={yardDone} />
              </DocSection>

              <DocSection
                number="04"
                title="Release to Stock"
                status={released ? "done" : actions.includes("RELEASE_TO_STOCK") ? "active" : "locked"}
                action={<ShieldCheck className="h-3.5 w-3.5 text-red-500" />}
              >
                {actions.includes("RELEASE_TO_STOCK") ? (
                  <ReleaseGroup intake={intake} token={token} canRelease={canRelease} onDone={onRefresh} />
                ) : (
                  <p className="text-sm text-slate-400">Complete the steps above first.</p>
                )}
              </DocSection>
            </div>
          )}
        </ProcessDocumentLayout>
      </div>
    </TooltipProvider>
  );
}
