"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { SteelService, SteelProductionPlan } from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import {
  DocSection, DocGrid, DocField, ProcessDocumentLayout, InfoCard, DocumentActions, AuditMeta,
} from "@/components/steel/shared/document";
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
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
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

      <ProcessDocumentLayout
        info={
          <InfoCard
            whatToDo="Review the production plan generated from the demand, product, and fulfilment details you entered, then release it to make it available to Production Sourcing (P02)."
            alreadyProvided="Demand, product, fulfilment decision, and production readiness, from the plan you created."
            beforeYouContinue={["Requested quantity and dates are correct.", "Fulfilment decision (stock vs. production) is appropriate.", "Production route and readiness look right."]}
          />
        }
      >
        <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
          <DocSection number="01" title="Demand" status="done" first>
            <DocGrid cols={4}>
              <DocField label="Demand Source" value={humanize(plan.demandSource)} />
              <DocField label="Customer / Dealer" value={plan.customerName || plan.dealerName} />
              <DocField label="Reference" value={plan.salesOrderNumber || plan.projectReference || plan.forecastReference || plan.stockRequirementReference} />
              <DocField label="Required Date" value={plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : null} />
              <DocField label="Priority" value={humanize(plan.priority)} />
            </DocGrid>
          </DocSection>

          <DocSection number="02" title="Product" status="done">
            <DocGrid cols={4}>
              <DocField label="Product" value={humanize(plan.productType)} />
              <DocField label="Standard" value={plan.productStandard} />
              <DocField label="Grade" value={plan.grade} />
              <DocField label="Size" value={plan.size} />
              <DocField label="Length" value={plan.length} />
              <DocField label="Requested Quantity" value={`${requiredQty} t`} />
            </DocGrid>
          </DocSection>

          <DocSection number="03" title="Fulfilment" status="done">
            <DocGrid cols={4}>
              <DocField label="Requested" value={`${requiredQty} t`} />
              <DocField label="Stock Available" value={certifiedQty !== null ? `${certifiedQty} t` : null} kind="calculated" source="Certified Stock" />
              <DocField
                label={shortfall !== null && shortfall > 0 ? "Shortfall" : "Surplus"}
                value={shortfall !== null ? `${Math.abs(shortfall)} t` : null}
                kind="calculated"
                source="Requested − Available"
              />
              <DocField label="Fulfilment Decision" value={humanize(plan.stockDecision)} />
            </DocGrid>
          </DocSection>

          <DocSection number="04" title="Production" status="done">
            <DocGrid cols={4}>
              <DocField label="Route" value={humanize(plan.plantRoute)} />
              <DocField label="Material Readiness" value={humanize(plan.materialAvailability)} />
              <DocField label="Equipment Readiness" value={humanize(plan.equipmentAvailability)} />
              <DocField label="Manpower Readiness" value={humanize(plan.manpowerAvailability)} />
            </DocGrid>
            {departments.length > 0 && (
              <div className="border-t border-input pt-2 mt-3">
                <DocField label="Departments" value={departments.map(humanize).join(", ")} kind="calculated" source="Selected Production Route" />
              </div>
            )}
          </DocSection>

          {plan.productionSequence && plan.productionSequence.length > 0 && (
            <DocSection number="05" title="Production Sequence" status="done">
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
            <DocSection number="06" title="Release" status="done">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Check className="h-4 w-4" />
                Released {plan.approvedAt ? `on ${new Date(plan.approvedAt).toLocaleString()}` : ""}
                {plan.approvedBy && ` by ${plan.approvedBy.firstName} ${plan.approvedBy.lastName}`}
              </div>
              <Link href="/steel/p02">
                <Button size="sm" variant="outline" className="mt-1">Continue to P02 Sourcing</Button>
              </Link>
              <AuditMeta
                createdLabel="Created"
                createdAt={plan.createdAt}
                updatedLabel="Released"
                updatedBy={plan.approvedBy ? `${plan.approvedBy.firstName} ${plan.approvedBy.lastName}` : undefined}
                updatedAt={plan.approvedAt}
              />
            </DocSection>
          )}

          {!released && (
            <DocumentActions>
              <Link href={`/steel/p01/new?plan=${plan.id}`}>
                <Button variant="outline">Edit Plan</Button>
              </Link>
              <Button onClick={() => setConfirming(true)}>
                Release Planning Document
              </Button>
            </DocumentActions>
          )}
        </div>
      </ProcessDocumentLayout>

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
