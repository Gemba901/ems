"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { SteelService, SteelProductionPlan } from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { Loader2, FileText, AlertTriangle, Check } from "lucide-react";

const STATUS_BADGE_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_BADGE_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {status.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase())}
    </Badge>
  );
}

function humanize(v: string | null | undefined) {
  return v ? v.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase()) : "—";
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-input bg-background p-4 space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

function ConfirmReleaseDialog({
  planNumber, onConfirm, onCancel, submitting,
}: { planNumber: string; onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-background shadow-xl border border-input p-5 space-y-4">
        <h2 className="text-sm font-semibold">Release this planning document?</h2>
        <p className="text-sm text-muted-foreground">
          {planNumber} will move to RELEASED and become available to Production Sourcing (P02). This cannot be undone from this screen.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PlanningDocument({ plan, token, onRefresh }: { plan: SteelProductionPlan; token: string; onRefresh: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const released = plan.stage === "A12_PLAN_RELEASED";
  // Departments are read-only information derived from the selected
  // Production Route (populated at A11 from the route's steps) — not an
  // approval/acknowledgement gate on release.
  const departments = plan.departmentAcks.map((a) => a.department);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  const releaseMutation = useMutation({
    mutationFn: () => SteelService.releasePlan(plan.id, {}, token),
    onSuccess: () => {
      toast("Planning document released.", "success");
      setConfirming(false);
      refresh();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  const requiredQty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  const certifiedQty = plan.certifiedStockAvailableQty;
  const shortfall = certifiedQty !== null ? requiredQty - certifiedQty : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader
        icon={FileText}
        title="Production Planning Document"
        subtitle={`${plan.planNumber} — created ${new Date(plan.createdAt).toLocaleDateString()}`}
        rightContent={<StatusBadge status={plan.status} />}
        code="P01"
      />

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <DocSection title="Demand">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Field label="Demand Source" value={humanize(plan.demandSource)} />
          <Field label="Customer / Dealer" value={plan.customerName || plan.dealerName} />
          <Field label="Reference" value={plan.salesOrderNumber || plan.projectReference || plan.forecastReference || plan.stockRequirementReference} />
          <Field label="Required Date" value={plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : null} />
          <Field label="Priority" value={humanize(plan.priority)} />
        </div>
      </DocSection>

      <DocSection title="Product">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Field label="Product" value={humanize(plan.productType)} />
          <Field label="Standard" value={plan.productStandard} />
          <Field label="Grade" value={plan.grade} />
          <Field label="Size" value={plan.size} />
          <Field label="Length" value={plan.length} />
          <Field label="Requested Quantity" value={`${requiredQty} t`} />
        </div>
      </DocSection>

      <DocSection title="Fulfilment">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Field label="Requested" value={`${requiredQty} t`} />
          <Field label="Stock Available" value={certifiedQty !== null ? `${certifiedQty} t` : null} />
          <Field label={shortfall !== null && shortfall > 0 ? "Shortfall" : "Surplus"} value={shortfall !== null ? `${Math.abs(shortfall)} t` : null} />
          <Field label="Fulfilment Decision" value={humanize(plan.stockDecision)} />
        </div>
      </DocSection>

      <DocSection title="Production">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Field label="Route" value={humanize(plan.plantRoute)} />
          <Field label="Material Readiness" value={humanize(plan.materialAvailability)} />
          <Field label="Equipment Readiness" value={humanize(plan.equipmentAvailability)} />
          <Field label="Manpower Readiness" value={humanize(plan.manpowerAvailability)} />
        </div>
        {departments.length > 0 && (
          <div className="border-t border-input pt-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Departments</p>
            <p className="text-sm">{departments.map(humanize).join(", ")}</p>
          </div>
        )}
      </DocSection>

      {plan.productionSequence && plan.productionSequence.length > 0 && (
        <DocSection title="Production Sequence">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-input">
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Description</th>
                  <th className="py-1 pr-3">Quantity</th>
                  <th className="py-1 pr-3">Planned Date</th>
                </tr>
              </thead>
              <tbody>
                {plan.productionSequence.map((item, i) => (
                  <tr key={i} className="border-b border-input/50 last:border-0">
                    <td className="py-1 pr-3">{item.batch}</td>
                    <td className="py-1 pr-3">{item.description || "—"}</td>
                    <td className="py-1 pr-3">{item.quantityTonnes ?? "—"} t</td>
                    <td className="py-1 pr-3">{item.sequenceDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DocSection>
      )}

      {released && (
        <DocSection title="Release">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            Released {plan.approvedAt ? `on ${new Date(plan.approvedAt).toLocaleString()}` : ""}
            {plan.approvedBy && ` by ${plan.approvedBy.firstName} ${plan.approvedBy.lastName}`}
          </div>
          <Link href="/steel/p02">
            <Button size="sm" variant="outline" className="mt-1">Continue to P02 Sourcing</Button>
          </Link>
        </DocSection>
      )}

      {!released && (
        <div className="flex items-center justify-end gap-2">
          <Link href={`/steel/p01/new?plan=${plan.id}`}>
            <Button variant="outline">Edit Plan</Button>
          </Link>
          <Button onClick={() => setConfirming(true)}>
            Release Planning Document
          </Button>
        </div>
      )}

      {confirming && (
        <ConfirmReleaseDialog
          planNumber={plan.planNumber}
          submitting={releaseMutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => releaseMutation.mutate()}
        />
      )}
    </div>
  );
}
