"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  HeatApprovalService,
  SteelHeatApproval,
  ApproveChemistryTemperaturePayload,
  ConfirmHeatNumberPayload,
  TappingApprovalPayload,
  TapToLadlePayload,
  ReleaseToCastingPayload,
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
import { ShieldCheck, Info, ListChecks, Lightbulb, Lock, Send, CheckCircle2, Loader2 } from "lucide-react";

// Same authority scope enforced server-side by the heat-approval
// controller's RELEASE_ROLES guard on /approve-chemistry-temperature,
// /tapping-approval, /release-to-casting, and /status.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

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
            Approve the chemistry and temperature, confirm the heat number, approve and perform tapping, then
            release the heat to casting.
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
            Release to casting completes this heat approval record. There is no further step after that in this
            module.
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
            <li>Only Management, Admin, or Super Admin can approve chemistry/temperature, approve tapping, or release to casting.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

function AuthorityLockedCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ApproveChemistryTemperatureForm({ heatApproval, token, canAct, onDone }: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onDone: () => void }) {
  const [approved, setApproved] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ApproveChemistryTemperaturePayload) => HeatApprovalService.approveChemistryTemperature(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (!canAct) return <AuthorityLockedCard message="Ask a Management, Admin, or Super Admin user to approve chemistry and temperature." />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Matches grade" value={heatApproval.chemistryMatchesGrade ? "Yes" : "No"} />
        <Field label="Temperature" value={heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : null} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        Approve chemistry and temperature
      </label>
      {!approved && <p className="text-xs text-amber-600">Approval is required before the heat number can be created.</p>}
      <Input placeholder="Approval notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!approved || mutation.isPending} onClick={() => mutation.mutate({ chemistryTemperatureApproved: approved, approvalNotes: notes || undefined })}>
        <SaveButton pending={mutation.isPending} label="Approve chemistry & temperature" />
      </Button>
    </div>
  );
}

function ConfirmHeatNumberForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [heatNumber, setHeatNumber] = useState(heatApproval.melting?.heatInProcessNumber ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmHeatNumberPayload) => HeatApprovalService.confirmHeatNumber(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">Confirm the default heat number, or enter a different one.</p>
      <Input placeholder="Heat number" value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ heatNumber: heatNumber || undefined })}>
        <SaveButton pending={mutation.isPending} label="Confirm heat number" />
      </Button>
    </div>
  );
}

function TappingApprovalForm({ heatApproval, token, canAct, onDone }: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onDone: () => void }) {
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: TappingApprovalPayload) => HeatApprovalService.tappingApproval(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  if (!canAct) return <AuthorityLockedCard message="Ask a Management, Admin, or Super Admin user to give tapping approval." />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        Approve tapping of this heat
      </label>
      <Button size="sm" disabled={!approved || mutation.isPending} onClick={() => mutation.mutate({ tappingApproved: approved })}>
        <SaveButton pending={mutation.isPending} label="Give tapping approval" />
      </Button>
    </div>
  );
}

function TapToLadleForm({ heatApproval, token, onDone }: { heatApproval: SteelHeatApproval; token: string; onDone: () => void }) {
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: TapToLadlePayload) => HeatApprovalService.tapToLadle(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Operator (optional)" value={operator} onChange={(e) => setOperator(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ tapOperator: operator || undefined })}>
        <SaveButton pending={mutation.isPending} label="Tap liquid steel into ladle" />
      </Button>
    </div>
  );
}

function ConfirmReleaseModal({
  heatApproval, onConfirm, onCancel, submitting,
}: { heatApproval: SteelHeatApproval; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
            <Send className="h-5 w-5 text-indigo-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Release heat to casting?</h2>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
          <Field label="Heat number" value={heatApproval.heatNumber} />
          <Field label="Approval No." value={heatApproval.approvalNumber} />
        </div>
        <p className="text-sm text-slate-500">
          This closes the heat approval record and releases it to casting. It cannot be undone from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release to Casting"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReleasePanel({
  heatApproval, token, canAct, onDone,
}: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReleaseToCastingPayload) => HeatApprovalService.releaseToCasting(heatApproval.id, payload, token),
    onSuccess: () => {
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canAct) return <AuthorityLockedCard message="Ask a Management, Admin, or Super Admin user to release this heat to casting." />;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Input placeholder="Release notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" onClick={() => setConfirming(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
        <Send className="h-4 w-4" />
        Release to Casting
      </Button>
      {confirming && (
        <ConfirmReleaseModal
          heatApproval={heatApproval}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ notes: notes || undefined })}
        />
      )}
    </div>
  );
}

function ClosedState({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  return (
    <Card className="border-emerald-200">
      <CardContent className="py-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Released to Casting</h2>
          <p className="text-sm text-slate-500 mt-1">{heatApproval.approvalNumber} is now closed.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-xl mx-auto text-left">
          <Field label="Heat number" value={heatApproval.heatNumber} />
          <Field label="Temperature" value={heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : null} />
          <Field label="Released at" value={heatApproval.releasedToCastingAt ? new Date(heatApproval.releasedToCastingAt).toLocaleString() : null} />
        </div>
      </CardContent>
    </Card>
  );
}

export function S3ApprovalTappingRelease({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const canAct = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = heatApproval.allowedActions ?? [];
  const closed = heatApproval.status === "CLOSED";

  const approveStatus = subStatus(actions.includes("APPROVE_CHEMISTRY_TEMPERATURE"), heatApproval.chemistryTemperatureApproved !== null);
  const heatNumberStatus = subStatus(actions.includes("CONFIRM_HEAT_NUMBER"), heatApproval.heatNumber !== null);
  const tappingStatus = subStatus(actions.includes("TAPPING_APPROVAL"), heatApproval.tappingApproved !== null);
  const tapStatus = subStatus(actions.includes("TAP_TO_LADLE"), heatApproval.tapStartTime !== null);
  const releaseStatus = subStatus(actions.includes("RELEASE_TO_CASTING"), closed);

  const statuses = [approveStatus, heatNumberStatus, tappingStatus, tapStatus, releaseStatus];
  const doneCount = closed ? 5 : statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={ShieldCheck}
          title="Approval, Tapping & Release"
          subtitle="Approve chemistry and temperature, confirm the heat number, approve and perform tapping, then release to casting."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[2]} doneCount={doneCount} activeIndex={closed ? null : activeRel === -1 ? null : activeRel} />
        <ContextSummary heatApproval={heatApproval} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {closed ? (
              <ClosedState heatApproval={heatApproval} />
            ) : (
              <>
                <SubStepCard code="P06-A09" title="Approve Chemistry & Temperature" status={approveStatus}>
                  {approveStatus === "done" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Approved" value={heatApproval.chemistryTemperatureApproved ? "Yes" : "No"} />
                      <Field label="Notes" value={heatApproval.approvalNotes} />
                    </div>
                  ) : approveStatus === "active" ? (
                    <ApproveChemistryTemperatureForm heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P06-A10" title="Create or Confirm Heat Number" status={heatNumberStatus}>
                  {heatNumberStatus === "done" ? (
                    <Field label="Heat number" value={heatApproval.heatNumber} />
                  ) : heatNumberStatus === "active" ? (
                    <ConfirmHeatNumberForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P06-A11" title="Give Tapping Approval" status={tappingStatus}>
                  {tappingStatus === "done" ? (
                    <Field label="Tapping approved" value={heatApproval.tappingApproved ? "Yes" : "No"} />
                  ) : tappingStatus === "active" ? (
                    <TappingApprovalForm heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <SubStepCard code="P06-A12" title="Tap Liquid Steel into Ladle" status={tapStatus}>
                  {tapStatus === "done" ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Field label="Tapped at" value={heatApproval.tapStartTime ? new Date(heatApproval.tapStartTime).toLocaleString() : null} />
                      <Field label="Operator" value={heatApproval.tapOperator} />
                    </div>
                  ) : tapStatus === "active" ? (
                    <TapToLadleForm heatApproval={heatApproval} token={token} onDone={onRefresh} />
                  ) : (
                    <LockedNote />
                  )}
                </SubStepCard>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <Send className="h-3.5 w-3.5 text-indigo-500" />
                    <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide">Final Release / Authority Gate</p>
                  </div>
                  <SubStepCard code="P06-A13" title="Release Approved Heat to Casting" status={releaseStatus}>
                    {releaseStatus === "active" ? (
                      <ReleasePanel heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />
                    ) : (
                      <LockedNote />
                    )}
                  </SubStepCard>
                </div>
              </>
            )}
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
