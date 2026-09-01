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
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { ScreenSidebar } from "@/components/steel/p06/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p06/ContextSummary";
import { HeatApprovalProgress } from "@/components/steel/p06/HeatApprovalProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p06/screenMap";
import { Field, SubStep, SaveButton, subStatus } from "@/components/steel/p06/shared";
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
  const defaultHeatNumber = heatApproval.melting?.heatInProcessNumber ?? "";
  const [heatNumber, setHeatNumber] = useState(defaultHeatNumber);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmHeatNumberPayload) => HeatApprovalService.confirmHeatNumber(heatApproval.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const isOverride = heatNumber.trim() !== "" && heatNumber.trim() !== defaultHeatNumber;
  const canSubmit = !isOverride || overrideReason.trim().length > 0;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">Confirm the default heat number, or enter a different one.</p>
      <Input placeholder="Heat number" value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} />
      {isOverride && (
        <>
          <p className="text-xs text-amber-600">
            This differs from the system-generated heat number ({defaultHeatNumber || "none"}) — a justification is required.
          </p>
          <Input
            placeholder="Reason for overriding the heat number (required)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
        </>
      )}
      <Button
        size="sm"
        disabled={!canSubmit || mutation.isPending}
        onClick={() => mutation.mutate({ heatNumber: heatNumber || undefined, heatNumberOverrideReason: isOverride ? overrideReason : undefined })}
      >
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

// "Approval Summary" checklist card — mirrors the mockup's 5 rows
// (Chemistry Compliance / Heat Cycle Review / Temperature Verification /
// Samples & Tests / Overall Decision), each an APPROVED/PENDING pill driven
// by the real field it represents. Nothing here is a separate stored
// status — every row reads an existing SteelHeatApproval field.
function ApprovalSummaryCard({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  const rows: { label: string; approved: boolean }[] = [
    { label: "Chemistry Compliance", approved: heatApproval.chemistryMatchesGrade === true },
    { label: "Heat Cycle Review", approved: heatApproval.liquidTemperatureCelsius !== null && heatApproval.ladleReady === true },
    { label: "Temperature Verification", approved: heatApproval.liquidTemperatureCelsius !== null },
    { label: "Samples & Tests", approved: heatApproval.chemistryComposition !== null },
    { label: "Overall Decision", approved: heatApproval.chemistryTemperatureApproved === true },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Approval Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span
              className={
                "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border " +
                (row.approved
                  ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                  : "text-slate-400 bg-slate-50 border-slate-200")
              }
            >
              {row.approved ? "APPROVED" : "PENDING"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// "Approval Details" card — Approved By / On come from the real A09
// activity log entry (the only place that event is recorded), not a
// separate approvedBy/approvedAt field on the record itself.
function ApprovalDetailsCard({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  const approvalLog = heatApproval.activityLogs.find((l) => l.activity === "A09");
  const actions = heatApproval.allowedActions ?? [];
  const closed = heatApproval.status === "CLOSED";
  const nextStep = closed
    ? "Released to casting — complete"
    : actions.includes("CONFIRM_HEAT_NUMBER")
      ? "Confirm heat number"
      : actions.includes("TAPPING_APPROVAL")
        ? "Tapping authorization"
        : actions.includes("TAP_TO_LADLE")
          ? "Tap into ladle"
          : actions.includes("RELEASE_TO_CASTING")
            ? "Release to casting"
            : "Chemistry & temperature approval";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Approval Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Field label="Approved By" value={approvalLog ? `${approvalLog.performedBy.firstName} ${approvalLog.performedBy.lastName}` : "Not yet approved"} />
        <Field label="Approved On" value={approvalLog ? new Date(approvalLog.createdAt).toLocaleString() : null} />
        <Field label="Approval Reference" value={heatApproval.approvalNumber} />
        <Field label="Next Step" value={nextStep} />
      </CardContent>
    </Card>
  );
}

// "Tap Authorization" card — gated on the real business rule: tapping can
// only be authorized once chemistry & temperature approval (A09) has
// actually happened. Before that, allowedActions never contains
// TAPPING_APPROVAL and this section stays locked rather than showing the
// happy-path "authorized" state from the mockup unconditionally.
function TapAuthorizationCard({ heatApproval, token, canAct, onRefresh }: { heatApproval: SteelHeatApproval; token: string; canAct: boolean; onRefresh: () => void }) {
  const approved = heatApproval.chemistryTemperatureApproved === true;
  const actions = heatApproval.allowedActions ?? [];
  const canAuthorizeNow = actions.includes("TAPPING_APPROVAL");
  const decided = heatApproval.tappingApproved !== null;

  return (
    <Card className={!approved ? "opacity-70" : ""}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {!approved && <Lock className="h-3.5 w-3.5 text-slate-400" />}
          Tap Authorization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!approved ? (
          <p className="text-xs text-slate-400">
            Becomes available once chemistry & temperature approval (P06-A09) is complete.
          </p>
        ) : decided ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tap Authorized" value={heatApproval.tappingApproved ? "Yes" : "No"} />
            <Field label="Recorded Temperature" value={heatApproval.liquidTemperatureCelsius !== null ? `${heatApproval.liquidTemperatureCelsius} °C` : null} />
            <div className="col-span-2">
              <Field label="Remarks / Approval Notes" value={heatApproval.approvalNotes} />
            </div>
          </div>
        ) : canAuthorizeNow ? (
          <TappingApprovalForm heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />
        ) : (
          <p className="text-xs text-slate-400">Waiting on the heat number to be confirmed (P06-A10) before tapping can be authorized.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ApprovalTapAuthorization({
  heatApproval, token, onRefresh,
}: { heatApproval: SteelHeatApproval; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const canAct = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const actions = heatApproval.allowedActions ?? [];
  const closed = heatApproval.status === "CLOSED";

  const approveStatus = subStatus(actions.includes("APPROVE_CHEMISTRY_TEMPERATURE"), heatApproval.chemistryTemperatureApproved !== null);
  const heatNumberStatus = subStatus(actions.includes("CONFIRM_HEAT_NUMBER"), heatApproval.heatNumber !== null);
  const tapStatus = subStatus(actions.includes("TAP_TO_LADLE"), heatApproval.tapStartTime !== null);
  const releaseStatus = subStatus(actions.includes("RELEASE_TO_CASTING"), closed);

  const statuses = [approveStatus, heatNumberStatus, tapStatus, releaseStatus];
  const doneCount = closed ? 4 : statuses.filter((s) => s === "done").length;
  const activeRel = statuses.findIndex((s) => s === "active");

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          code="P06"
          icon={ShieldCheck}
          title="Approval & Tap Authorization"
          subtitle="Approve heat and authorize tapping / downstream handover."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[1]} doneCount={doneCount} activeIndex={closed ? null : activeRel === -1 ? null : activeRel} activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P06")?.color.bar} />
        <ContextSummary heatApproval={heatApproval} />

        {heatApproval.chemistryTemperatureApproved === true && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700">Heat Approved Successfully</p>
              <p className="text-xs text-emerald-600">
                {closed
                  ? "This heat was approved, tapped, and released to casting."
                  : "This heat has been approved and tapping can now be authorized."}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            {closed ? (
              <ClosedState heatApproval={heatApproval} />
            ) : (
              <>
                <SubStep
                  code="P06-A09"
                  title="Approve Chemistry & Temperature"
                  status={approveStatus}
                  summary={`Approved: ${heatApproval.chemistryTemperatureApproved ? "Yes" : "No"}`}
                >
                  {approveStatus === "active" && <ApproveChemistryTemperatureForm heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />}
                </SubStep>

                <ApprovalDetailsCard heatApproval={heatApproval} />
                <ApprovalSummaryCard heatApproval={heatApproval} />

                <SubStep
                  code="P06-A10"
                  title="Create or Confirm Heat Number"
                  status={heatNumberStatus}
                  summary={heatApproval.heatNumber ? `Heat number ${heatApproval.heatNumber}` : undefined}
                >
                  {heatNumberStatus === "active" && <ConfirmHeatNumberForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
                </SubStep>

                <TapAuthorizationCard heatApproval={heatApproval} token={token} canAct={canAct} onRefresh={onRefresh} />

                <SubStep
                  code="P06-A12"
                  title="Tap Liquid Steel into Ladle"
                  status={tapStatus}
                  summary={heatApproval.tapStartTime ? `Tapped ${new Date(heatApproval.tapStartTime).toLocaleString()}` : undefined}
                >
                  {tapStatus === "active" && <TapToLadleForm heatApproval={heatApproval} token={token} onDone={onRefresh} />}
                </SubStep>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <Send className="h-3.5 w-3.5 text-indigo-500" />
                    <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide">Final Release / Authority Gate</p>
                  </div>
                  <SubStep code="P06-A13" title="Release Approved Heat to Casting" status={releaseStatus}>
                    {releaseStatus === "active" && <ReleasePanel heatApproval={heatApproval} token={token} canAct={canAct} onDone={onRefresh} />}
                  </SubStep>
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
