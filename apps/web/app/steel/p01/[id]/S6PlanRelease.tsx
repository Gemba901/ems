"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { SteelService, SteelProductionPlan, ReleasePlanPayload } from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator as SharedWorkflowIndicator } from "@/components/steel/p01/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/p01/ScreenHeader";
import { ScreenSidebar } from "@/components/steel/p01/ScreenSidebar";
import {
  Loader2,
  ShieldCheck,
  Check,
  Circle,
  Info,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Lock,
  Rocket,
} from "lucide-react";

const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

function PlanSummary({ plan }: { plan: SteelProductionPlan }) {
  const qty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Product</p>
            <p className="font-medium text-slate-800">{plan.productType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Grade</p>
            <p className="font-medium text-slate-800">{plan.grade ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Quantity</p>
            <p className="font-medium text-slate-800">{qty} t</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Customer / Order Ref</p>
            <p className="font-medium text-slate-800">
              {plan.customerName || plan.dealerName || plan.salesOrderNumber || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Priority</p>
            <p className="font-medium text-slate-800">{plan.priority?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Plant Route</p>
            <p className="font-medium text-slate-800">{plan.plantRoute?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Planned Start</p>
            <p className="font-medium text-slate-800">
              {plan.plannedStartDate ? new Date(plan.plannedStartDate).toLocaleDateString() : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Planned End</p>
            <p className="font-medium text-slate-800">
              {plan.plannedEndDate ? new Date(plan.plannedEndDate).toLocaleDateString() : "—"}
            </p>
          </div>
        </div>

        {plan.productionSequence && plan.productionSequence.length > 0 && (
          <div className="mt-4 border border-slate-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-400">
                  <th className="px-3 py-1.5">Batch</th>
                  <th className="px-3 py-1.5">Description</th>
                  <th className="px-3 py-1.5">Qty (t)</th>
                  <th className="px-3 py-1.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {plan.productionSequence.map((item, i) => (
                  <tr key={i} className="border-t border-slate-50">
                    <td className="px-3 py-1.5">{item.batch}</td>
                    <td className="px-3 py-1.5">{item.description || "—"}</td>
                    <td className="px-3 py-1.5">{item.quantityTonnes ?? "—"}</td>
                    <td className="px-3 py-1.5">{item.sequenceDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReadinessSummary({ plan }: { plan: SteelProductionPlan }) {
  const items = [
    { label: "Stock / Fulfilment Decision", value: plan.stockDecision?.replace(/_/g, " ") ?? "—" },
    { label: "Material Availability", value: plan.materialAvailability?.replace(/_/g, " ") ?? "—" },
    { label: "Equipment Availability", value: plan.equipmentAvailability?.replace(/_/g, " ") ?? "—" },
    { label: "Manpower Availability", value: plan.manpowerAvailability?.replace(/_/g, " ") ?? "—" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feasibility & Readiness</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <p className="text-xs text-slate-400">{it.label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{it.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentAcknowledgement({ plan }: { plan: SteelProductionPlan }) {
  const total = plan.departmentAcks.length;
  const ackedCount = plan.departmentAcks.filter((a) => a.acknowledged).length;
  const allAcked = total > 0 && ackedCount === total;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Department Acknowledgement</CardTitle>
        <p className={"text-sm font-medium " + (allAcked ? "text-emerald-600" : "text-amber-600")}>
          {ackedCount} of {total} departments acknowledged
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {plan.departmentAcks.map((ack) => (
            <div key={ack.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{ack.department.charAt(0) + ack.department.slice(1).toLowerCase()}</p>
                {ack.acknowledged && ack.acknowledgedAt && (
                  <p className="text-xs text-slate-400">{new Date(ack.acknowledgedAt).toLocaleString()}</p>
                )}
              </div>
              {ack.acknowledged ? (
                <Badge className="bg-emerald-50 text-emerald-700 gap-1">
                  <Check className="h-3 w-3" />
                  Acknowledged
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-700 gap-1">
                  <Circle className="h-3 w-3" />
                  Pending
                </Badge>
              )}
            </div>
          ))}
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
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Rocket className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Release this production plan?</h2>
        </div>
        <p className="text-sm text-slate-500">
          This is the final approval. The plan will move to <span className="font-medium text-slate-700">RELEASED</span> and
          cannot be reverted from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release Production Plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReleaseApproval({
  plan, token, canRelease, onDone,
}: { plan: SteelProductionPlan; token: string; canRelease: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = plan.departmentAcks.length;
  const ackedCount = plan.departmentAcks.filter((a) => a.acknowledged).length;
  const allAcked = total > 0 && ackedCount === total;

  const mutation = useMutation({
    mutationFn: (payload: ReleasePlanPayload) => SteelService.releasePlan(plan.id, payload, token),
    onSuccess: () => {
      toast("Production plan released.", "success");
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  const blocked = !allAcked || !canRelease;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Release Approval</CardTitle>
        <p className="text-sm text-slate-500">Releasing makes this production plan official and available to Production Sourcing (P02).</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!allAcked && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2 flex items-start gap-2">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Release is locked until all {total} department{total === 1 ? "" : "s"} acknowledge the plan ({ackedCount}/{total} so far).</span>
          </div>
        )}

        {allAcked && !canRelease && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2 flex items-start gap-2">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Only Management, Admin, or Super Admin can release this plan.</span>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Release notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring disabled:opacity-50"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context for this release"
            disabled={blocked}
          />
        </div>

        <div className="flex items-center justify-end">
          <Button type="button" disabled={blocked} onClick={() => setConfirming(true)} className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Release Production Plan
          </Button>
        </div>
      </CardContent>

      {confirming && (
        <ConfirmReleaseModal
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ releaseNotes: notes || undefined })}
        />
      )}
    </Card>
  );
}

function ReleasedState({ plan }: { plan: SteelProductionPlan }) {
  return (
    <Card>
      <CardContent className="py-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Production Plan Released</h2>
          <p className="text-sm text-slate-500 mt-1">{plan.planNumber} is now RELEASED.</p>
        </div>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-400">Approved by</p>
            <p className="font-medium text-slate-800">
              {plan.approvedBy ? `${plan.approvedBy.firstName} ${plan.approvedBy.lastName}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Released at</p>
            <p className="font-medium text-slate-800">{plan.approvedAt ? new Date(plan.approvedAt).toLocaleString() : "—"}</p>
          </div>
        </div>
        {plan.releaseNotes && (
          <p className="text-sm text-slate-500 max-w-md mx-auto">&quot;{plan.releaseNotes}&quot;</p>
        )}
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 max-w-sm mx-auto">
          Next step: <span className="font-medium text-slate-800">Production Sourcing</span>
        </div>
        <Link href="/steel/p02">
          <Button className="gap-2">
            Continue to P02 Sourcing <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function Sidebar({ plan, released }: { plan: SteelProductionPlan; released: boolean }) {
  const total = plan.departmentAcks.length;
  const ackedCount = plan.departmentAcks.filter((a) => a.acknowledged).length;

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
            S6 covers P01-A12 — the final approval. Releasing moves the plan to RELEASED and makes it available for
            Production Sourcing (P02).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Plan ID</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.planNumber}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Status</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.status}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Acknowledged</dt>
              <dd className="text-slate-700 font-medium text-right">{ackedCount}/{total}</dd>
            </div>
          </dl>
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
            {released ? (
              <li>This plan is now visible in Production Sourcing (P02).</li>
            ) : (
              <>
                <li>Release cannot be undone from this screen.</li>
                <li>All department acknowledgements are required before release.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S6PlanRelease({ plan, token, onRefresh }: { plan: SteelProductionPlan; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canRelease = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));
  const released = plan.stage === "A12_PLAN_RELEASED";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={ShieldCheck}
        title="Release Production Plan"
        subtitle={`${plan.planNumber} — final approval before this plan becomes official.`}
        rightContent={<Badge>{plan.status}</Badge>}
      />
      <SharedWorkflowIndicator doneCount={released ? 6 : 5} activeIndex={released ? null : 5} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <PlanSummary plan={plan} />
          <ReadinessSummary plan={plan} />
          <DepartmentAcknowledgement plan={plan} />
          {released ? <ReleasedState plan={plan} /> : <ReleaseApproval plan={plan} token={token} canRelease={canRelease} onDone={refresh} />}
        </div>
        <Sidebar plan={plan} released={released} />
      </div>
    </div>
  );
}
