"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  SteelSourcingMaterialSource,
  SupplierRiskLevel,
  Supplier,
  SelectMaterialSourcePayload,
  ReviewSupplierRiskPayload,
} from "@/services/steel-sourcing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { DocSection, DocGrid, DocField, PillSelect, SummaryBlock, StickyActions, ErrorBanner, P02Layout, P02InfoCard } from "@/components/steel/p02/document";
import { APPROVAL_STYLES, SupplierComparisonTable, SupplierQualityPanel } from "@/components/steel/p02/supplierTable";
import { useEligibleSuppliers } from "@/components/steel/p02/useEligibleSuppliers";
import { AttachmentPanel } from "@/components/steel/p02/AttachmentPanel";
import { Loader2, AlertTriangle, ShieldCheck, ShieldAlert, Gauge, ArrowRight, Users } from "lucide-react";

const RISK_LEVELS: { value: SupplierRiskLevel; label: string; description: string }[] = [
  { value: "LOW", label: "Low", description: "Consistent quality, minimal rejections or complaints." },
  { value: "MEDIUM", label: "Medium", description: "Occasional issues — monitor delivery and quality." },
  { value: "HIGH", label: "High", description: "History of rejections or complaints — proceed with caution." },
];

// ── Order reference header (always visible, read-only) ──────────────────────

function OrderReferenceHeader({ order }: { order: SteelSourcingOrder }) {
  return (
    <DocGrid cols={4}>
      <DocField label="Sourcing Order" value={order.sourcingNumber} />
      <DocField label="Production Plan" value={order.plan?.planNumber} />
      <DocField label="Material Type" value={order.materialType?.replace(/_/g, " ")} />
      <DocField label="Required By" value={order.requiredByDate ? new Date(order.requiredByDate).toLocaleDateString() : "—"} />
    </DocGrid>
  );
}

// ── A03 — Select material source ─────────────────────────────────────────────

function ExistingStockForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: SelectMaterialSourcePayload) => SteelSourcingService.selectMaterialSource(id, payload, token),
    onSuccess: () => {
      toast("Fulfilling from existing stock — supplier and purchasing steps are skipped.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <SummaryBlock tone="info">
        Supplier assessment, quote comparison, supplier selection, and purchase order creation will be skipped — this
        requirement moves straight to delivery/logistics scheduling and handover.
      </SummaryBlock>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the stock fulfillment" />
      </div>
      <div className="flex items-center justify-end">
        <Button
          onClick={() => mutation.mutate({ source: "EXISTING_STOCK", stockFulfillmentNotes: notes || undefined })}
          disabled={mutation.isPending}
          className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Existing Stock →"}
        </Button>
      </div>
    </div>
  );
}

function SupplierCheckForm({ id, order, token, onDone }: { id: string; order: SteelSourcingOrder; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const { isLoading, isError, usedEligibility, eligibleSuppliers, refetch } = useEligibleSuppliers(order, token);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suppliers = eligibleSuppliers;
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const isApproved = selectedSupplier?.approvalStatus === "APPROVED";

  const handleSelect = (sid: string) => {
    setSupplierId(sid);
  };

  const mutation = useMutation({
    mutationFn: (payload: SelectMaterialSourcePayload) => SteelSourcingService.selectMaterialSource(id, payload, token),
    onSuccess: () => {
      toast("Supplier checked — continue to the risk review.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError("Please select a supplier.");
      return;
    }
    mutation.mutate({
      source: "EXTERNAL_SUPPLIER",
      supplierId,
      supplierApprovalConfirmed: isApproved,
      supplierCheckNotes: notes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-muted-foreground">Suppliers could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={refetch}>Retry</Button>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Users className="h-5 w-5 text-muted-foreground/40" />
        {usedEligibility ? (
          <>
            <p className="text-sm font-medium text-foreground">No approved suppliers configured for this material.</p>
            <p className="text-xs text-muted-foreground">
              Add or approve a supplier for this material in{" "}
              <Link href="/steel/config/supplier-eligibility" className="underline font-medium">Configuration</Link> before continuing.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No suppliers found yet.</p>
            <p className="text-xs text-muted-foreground">Add a supplier in Steel Configuration before checking one here.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}

      <SupplierComparisonTable suppliers={suppliers} selectedId={supplierId} onSelect={handleSelect} />

      {selectedSupplier && (
        <div className="rounded-md border border-input p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Supplier Quality — {selectedSupplier.name}</p>
          <SupplierQualityPanel supplier={selectedSupplier} />
        </div>
      )}

      {selectedSupplier && !isApproved && (
        <SummaryBlock tone="warning">
          {selectedSupplier.name} is not on the approved list (status: {selectedSupplier.approvalStatus}). You can
          still proceed with this supplier, but approval cannot be confirmed until its status is APPROVED.
        </SummaryBlock>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the supplier check" />
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!supplierId || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with This Supplier →"}
        </Button>
      </div>
    </form>
  );
}

function MaterialSourceForm({ id, order, token, onDone }: { id: string; order: SteelSourcingOrder; token: string; onDone: () => void }) {
  const [chosen, setChosen] = useState<SteelSourcingMaterialSource>("EXTERNAL_SUPPLIER");

  return (
    <div className="space-y-3">
      <PillSelect
        options={[
          { value: "EXISTING_STOCK" as SteelSourcingMaterialSource, label: "Existing Stock" },
          { value: "EXTERNAL_SUPPLIER" as SteelSourcingMaterialSource, label: "External Supplier" },
        ]}
        value={chosen}
        onChange={setChosen}
      />
      {chosen === "EXISTING_STOCK" ? (
        <ExistingStockForm id={id} token={token} onDone={onDone} />
      ) : (
        <SupplierCheckForm id={id} order={order} token={token} onDone={onDone} />
      )}
    </div>
  );
}

// ── A04 — Supplier quality / risk review ─────────────────────────────────────

function SupplierRiskForm({ id, token, supplier, onDone }: { id: string; token: string; supplier: Supplier | null; onDone: () => void }) {
  const { toast } = useToast();
  const [risk, setRisk] = useState<SupplierRiskLevel | "">("");
  const [rejectionRateNotes, setRejectionRateNotes] = useState("");
  const [complaintHistoryNotes, setComplaintHistoryNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReviewSupplierRiskPayload) => SteelSourcingService.reviewSupplierRisk(id, payload, token),
    onSuccess: () => {
      toast("Supplier risk reviewed.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!risk) {
      setError("Please select a risk level.");
      return;
    }
    mutation.mutate({
      supplierRiskLevel: risk,
      rejectionRateNotes: rejectionRateNotes || undefined,
      complaintHistoryNotes: complaintHistoryNotes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}

      {supplier && <SupplierQualityPanel supplier={supplier} />}

      <div className="flex flex-wrap gap-2">
        {RISK_LEVELS.map((r) => {
          const selected = r.value === risk;
          const isHigh = r.value === "HIGH";
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRisk(r.value)}
              aria-pressed={selected}
              title={r.description}
              className={
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                (selected
                  ? isHigh
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-input text-muted-foreground hover:text-foreground")
              }
            >
              {isHigh ? <ShieldAlert className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />}
              {r.label}
            </button>
          );
        })}
      </div>

      {risk === "HIGH" && (
        <SummaryBlock tone="warning">
          This supplier is being marked as HIGH risk. This does not block progress, but review it carefully before
          proceeding to quote collection.
        </SummaryBlock>
      )}

      <DocGrid>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Rejection rate notes (optional)</label>
          <Input className="h-8" value={rejectionRateNotes} onChange={(e) => setRejectionRateNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Complaint history notes (optional)</label>
          <Input className="h-8" value={complaintHistoryNotes} onChange={(e) => setComplaintHistoryNotes(e.target.value)} placeholder="Optional" />
        </div>
      </DocGrid>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!risk || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to Sourcing Decision →"}
        </Button>
      </div>
    </form>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S2SupplierAssessment({
  order, token, onRefresh,
}: { order: SteelSourcingOrder; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => SteelSourcingService.getSuppliers(token),
    enabled: !!token && order.stage === "A04_SUPPLIER_RISK_REVIEWED",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    onRefresh();
  };

  const isStock = order.materialSource === "EXISTING_STOCK";

  const order2: SteelSourcingOrder["stage"][] = ["A02_MATERIAL_TYPE_IDENTIFIED", "A03_SUPPLIER_CHECKED", "A04_SUPPLIER_RISK_REVIEWED"];
  const rawIdx = order2.indexOf(order.stage);
  const effectiveIdx = rawIdx === -1 ? order2.length : rawIdx;

  const statusFor = (stage: SteelSourcingOrder["stage"]): "done" | "active" | "locked" => {
    const targetIdx = order2.indexOf(stage);
    if (effectiveIdx >= targetIdx) return "done";
    if (effectiveIdx === targetIdx - 1) return "active";
    return "locked";
  };

  const a03Status = statusFor("A03_SUPPLIER_CHECKED");
  const a04Status = statusFor("A04_SUPPLIER_RISK_REVIEWED");
  const allDone = isStock ? a03Status === "done" : order.stage === "A04_SUPPLIER_RISK_REVIEWED";
  const selectedSupplier = suppliersQuery.data?.find((s) => s.id === order.supplier?.id) ?? order.supplier ?? null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <ScreenHeader
        icon={ShieldCheck}
        title="Supplier Assessment"
        subtitle="Check the material source against the approved supplier list, and review supplier quality."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={1}
        activeIndex={allDone ? null : 1}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />

      <P02Layout
        info={
          <P02InfoCard
            alreadyProvided="Eligible suppliers, approval status, and quality history, from the Supplier Master."
            whatToEnter="Which source to use (existing stock or an external supplier) and, for a supplier, its risk level."
            beforeYouContinue={["Supplier is approved.", "Quality information has been reviewed."]}
          />
        }
      >
        <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
          <DocSection number="—" title="Procurement Request" first>
            <OrderReferenceHeader order={order} />
          </DocSection>

          <DocSection number="03" title="Approved Suppliers" status={a03Status}>
            {a03Status === "done" ? (
              isStock ? (
                <DocGrid>
                  <DocField label="Source" value="Existing Stock" />
                  <DocField label="Notes" value={order.stockFulfillmentNotes} />
                </DocGrid>
              ) : (
                <DocGrid cols={2}>
                  <DocField label="Source" value="External Supplier" />
                  <DocField label="Supplier" value={order.supplier?.name} source="Supplier Master" />
                  <DocField
                    label="Approval status"
                    value={order.supplier ? <Badge className={APPROVAL_STYLES[order.supplier.approvalStatus]}>{order.supplier.approvalStatus}</Badge> : null}
                    source="Supplier Master"
                  />
                  <DocField label="Notes" value={order.supplierCheckNotes} />
                </DocGrid>
              )
            ) : a03Status === "active" ? (
              <MaterialSourceForm id={order.id} order={order} token={token} onDone={refresh} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a material source above to continue.</p>
            )}
          </DocSection>

          {!isStock && (
            <DocSection number="04" title="Supplier Quality" status={a04Status}>
              {a04Status === "done" ? (
                <DocGrid cols={3}>
                  <DocField label="Risk level" value={order.supplierRiskLevel} />
                  <DocField label="Rejection notes" value={order.rejectionRateNotes} />
                  <DocField label="Complaint history" value={order.complaintHistoryNotes} />
                </DocGrid>
              ) : a04Status === "active" ? (
                <SupplierRiskForm id={order.id} token={token} supplier={selectedSupplier} onDone={refresh} />
              ) : (
                <p className="text-sm text-muted-foreground">Confirm the supplier above to review risk.</p>
              )}
              {a03Status === "done" && (
                <div className="mt-3">
                  <AttachmentPanel sourcingId={order.id} stage="A04_SUPPLIER_RISK_REVIEWED" token={token} label="Supplier Certificates & Qualification Documents" />
                </div>
              )}
            </DocSection>
          )}

          {allDone && (
            <StickyActions>
              <Button onClick={refresh} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                {isStock ? "Continue" : "Continue to Sourcing Decision"} <ArrowRight className="h-4 w-4" />
              </Button>
            </StickyActions>
          )}
        </div>
      </P02Layout>
    </div>
  );
}
