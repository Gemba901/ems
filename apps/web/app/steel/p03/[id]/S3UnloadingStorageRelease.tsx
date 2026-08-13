"use client";

import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p03/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p03/WorkflowIndicator";
import { SCREEN_TOP_STEPS } from "@/components/steel/p03/screenMap";
import { ScreenSidebar } from "@/components/steel/p03/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p03/ContextSummary";
import { IntakeProgress } from "@/components/steel/p03/IntakeProgress";
import { Field, SubStepCard, SaveButton, LockedNote, SubStepStatus } from "@/components/steel/p03/shared";
import {
  PackageCheck, Info, ListChecks, Lightbulb, ShieldCheck, Lock, Check, ArrowRight, HelpCircle, Loader2,
} from "lucide-react";

// Same authority scope enforced server-side by the material-intake
// controller's RELEASE_ROLES guard on /release — kept identical rather
// than inventing a new list.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

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
            S3 covers P03-A11 (unload the accepted material), P03-A12 (capture tare weight — net weight is
            server-computed), P03-A13 (assign a yard storage location), and P03-A14 (release to stock — the final,
            Management-approved step).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspection Outcome (from S2)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Decision</dt>
              <dd className="text-slate-700 font-medium text-right">{intake.acceptanceDecision ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Gross weight</dt>
              <dd className="text-slate-700 font-medium text-right">{intake.grossWeightTonnes ? `${intake.grossWeightTonnes} t` : "—"}</dd>
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
            Releasing to stock is final — it marks this material intake RELEASED. A P04 charge preparation is created
            separately and attaches this intake as a material lot afterward.
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
            <li>Net weight is calculated by the server as gross weight minus tare weight — never entered directly.</li>
            <li>Only Management, Admin, or Super Admin can release material to stock.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P03-A11 ──

function UnloadingForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RecordUnloadingPayload) => MaterialIntakeService.recordUnloading(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-sm text-slate-600">Confirm the accepted material has been safely unloaded.</p>
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({})}>
        <SaveButton pending={mutation.isPending} label="Confirm unloading" />
      </Button>
    </div>
  );
}

// ── P03-A12 ──

function NetWeightForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
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

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Field label="Gross weight" value={`${grossWeight} t`} />
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-sm font-medium text-slate-700">Tare weight (tonnes)</label>
          <Tooltip>
            <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300" />} />
            <TooltipContent>Net weight is calculated by the server as gross weight minus tare weight.</TooltipContent>
          </Tooltip>
        </div>
        <Input type="number" step="0.001" value={tare} onChange={(e) => setTare(e.target.value)} />
      </div>
      {tare !== "" && tareNum > grossWeight && (
        <p className="text-xs text-red-600">Tare weight cannot exceed gross weight.</p>
      )}
      {preview !== null && (
        <p className="text-xs text-slate-400">
          Net weight preview: {preview.toFixed(3)} t — the server will confirm this on save.
        </p>
      )}
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate({ tareWeightTonnes: Number(tare) })}>
        <SaveButton pending={mutation.isPending} label="Record net weight" />
      </Button>
    </div>
  );
}

// ── P03-A13 ──

function YardLocationForm({
  intake, token, onDone,
}: { intake: SteelMaterialIntake; token: string; onDone: () => void }) {
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: AssignYardLocationPayload) => MaterialIntakeService.assignYardLocation(intake.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Yard location" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Button size="sm" disabled={!location.trim() || mutation.isPending} onClick={() => mutation.mutate({ yardLocation: location })}>
        <SaveButton pending={mutation.isPending} label="Assign yard location" />
      </Button>
    </div>
  );
}

// ── P03-A14 — final authority gate ──

function ReleaseLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required to release stock</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin roles can release this material intake to stock. Ask a Management
            or Admin user to complete this step.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmReleaseModal({
  onConfirm, onCancel, submitting,
}: { onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Release this material to stock?</h2>
        </div>
        <p className="text-sm text-slate-500">
          This is final. The material intake will move to <span className="font-medium text-slate-700">RELEASED</span> and
          cannot be reverted from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
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

function ReleasePanel({
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

  if (!canRelease) return <ReleaseLockedCard />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
        Stock release is recorded against the material intake. Full inventory stock integration will be enabled when
        the inventory module/model is available.
      </div>
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
        <ShieldCheck className="h-4 w-4" />
        Release to Stock
      </Button>
      {confirming && (
        <ConfirmReleaseModal
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

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S3UnloadingStorageRelease({
  intake, token, onRefresh, sourcingOrder,
}: { intake: SteelMaterialIntake; token: string; onRefresh: () => void; sourcingOrder?: SteelSourcingOrder }) {
  const { user } = useAuthStore();
  const canRelease = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = intake.allowedActions ?? [];
  const released = intake.status === "RELEASED";

  const unloadingStatus = subStatus(actions.includes("RECORD_UNLOADING"), intake.unloadedAt !== null);
  const weightStatus = subStatus(actions.includes("RECORD_NET_WEIGHT"), intake.netWeightTonnes !== null);
  const yardStatus = subStatus(actions.includes("ASSIGN_YARD_LOCATION"), intake.yardLocation !== null);
  const releaseStatus = subStatus(actions.includes("RELEASE_TO_STOCK"), released);
  const stepStatuses: SubStepStatus[] = [unloadingStatus, weightStatus, yardStatus, releaseStatus];
  const doneCount = released ? 4 : stepStatuses.filter((s) => s === "done").length;
  const activeIdx = released ? -1 : stepStatuses.findIndex((s) => s === "active");

  if (intake.acceptanceDecision !== "ACCEPT" && !released) {
    return (
      <TooltipProvider>
        <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
          <ScreenHeader
            icon={PackageCheck}
            title="Unloading, Storage & Release"
            subtitle="Unload, weigh net, store, and release the material to stock."
          />
          <WorkflowIndicator steps={SCREEN_TOP_STEPS[2]} doneCount={0} activeIndex={null} />
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
          icon={PackageCheck}
          title="Unloading, Storage & Release"
          subtitle="Unload, weigh net, store, and release the material to stock."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[2]} doneCount={doneCount} activeIndex={activeIdx === -1 ? null : activeIdx} />
        <ContextSummary intake={intake} sourcingOrder={sourcingOrder} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {released ? (
              <ReleasedState intake={intake} />
            ) : (
              <>
                <SubStepCard code="P03-A11" title="Unload Approved Material" status={unloadingStatus}>
                  {unloadingStatus === "done" ? (
                    <Field label="Unloaded at" value={intake.unloadedAt ? new Date(intake.unloadedAt).toLocaleString() : null} />
                  ) : unloadingStatus === "active" ? (
                    <UnloadingForm intake={intake} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P03-A12" title="Tare Weight & Net Weight" status={weightStatus}>
                  {weightStatus === "done" ? (
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Gross weight" value={intake.grossWeightTonnes ? `${intake.grossWeightTonnes} t` : null} />
                      <Field label="Tare weight" value={intake.tareWeightTonnes !== null ? `${intake.tareWeightTonnes} t` : null} />
                      <Field label="Net weight" value={intake.netWeightTonnes !== null ? `${intake.netWeightTonnes} t` : null} />
                    </div>
                  ) : weightStatus === "active" ? (
                    <NetWeightForm intake={intake} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P03-A13" title="Store Material in Yard Location" status={yardStatus}>
                  {yardStatus === "done" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Yard location" value={intake.yardLocation} />
                      <Field label="Stored at" value={intake.storedAt ? new Date(intake.storedAt).toLocaleString() : null} />
                    </div>
                  ) : yardStatus === "active" ? (
                    <YardLocationForm intake={intake} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Final Stock Release / Authority Gate</p>
                  </div>
                  <SubStepCard code="P03-A14" title="Update Stock & Release for Preparation/Use" status={releaseStatus}>
                    {releaseStatus === "active" ? (
                      <ReleasePanel intake={intake} token={token} canRelease={canRelease} onDone={onRefresh} />
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
