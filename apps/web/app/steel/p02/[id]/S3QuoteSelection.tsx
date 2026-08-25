"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  Supplier,
  QuotationItemPayload,
  CollectQuotationsPayload,
  SelectSupplierPayload,
} from "@/services/steel-sourcing.service";
import { SteelConfigService } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { DocSection, DocGrid, DocField, SummaryBlock, StickyActions, ErrorBanner, P02Layout, P02InfoCard } from "@/components/steel/p02/document";
import { SupplierComparisonTable } from "@/components/steel/p02/supplierTable";
import { useEligibleSuppliers } from "@/components/steel/p02/useEligibleSuppliers";
import { AttachmentPanel } from "@/components/steel/p02/AttachmentPanel";
import { Loader2, Scale, Trophy, Plus, Trash2, AlertTriangle, ArrowRight, Users, Pencil } from "lucide-react";

// ── Order reference header (always visible, read-only) ──────────────────────

function OrderReferenceHeader({ order }: { order: SteelSourcingOrder }) {
  return (
    <DocGrid cols={4}>
      <DocField label="Sourcing Order" value={order.sourcingNumber} />
      <DocField label="Production Plan" value={order.plan?.planNumber} />
      <DocField label="Material Type" value={order.materialType?.replace(/_/g, " ")} />
      <DocField label="Checked Supplier" value={order.supplier?.name} />
    </DocGrid>
  );
}

// ── A05 — Quotation entry ────────────────────────────────────────────────────

function emptyRow(): QuotationItemPayload {
  return { supplierId: "", price: 0, currency: "USD" };
}

function rowsFromExisting(order: SteelSourcingOrder): QuotationItemPayload[] {
  if (order.quotations.length === 0) return [emptyRow()];
  return order.quotations.map((q) => ({
    supplierId: q.supplierId,
    price: q.price,
    currency: q.currency,
    quantityAvailable: q.quantityAvailable ?? undefined,
    deliveryDate: q.deliveryDate ?? undefined,
    paymentTerms: q.paymentTerms ?? undefined,
    qualityRiskNotes: q.qualityRiskNotes ?? undefined,
  }));
}

function QuotationEntryForm({
  order, token, suppliers, onDone, onCancel,
}: { order: SteelSourcingOrder; token: string; suppliers: Supplier[]; onDone: () => void; onCancel?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<QuotationItemPayload[]>(rowsFromExisting(order));
  const [error, setError] = useState<string | null>(null);
  const hasExisting = order.quotations.length > 0;

  const update = (i: number, patch: Partial<QuotationItemPayload>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const mutation = useMutation({
    mutationFn: (payload: CollectQuotationsPayload) => SteelSourcingService.collectQuotations(order.id, payload, token),
    onSuccess: () => {
      toast("Quotations saved — select the winning supplier next.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSave = () => {
    setError(null);
    const valid = rows.filter((r) => r.supplierId && r.price > 0);
    if (valid.length === 0) {
      setError("Add at least one quotation with a supplier and a price greater than zero.");
      return;
    }
    mutation.mutate({ quotations: valid });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add a row per supplier quote. <span className="font-medium text-foreground">Saving replaces the entire quotation set</span> — include every supplier you want to compare.
      </p>
      {error && <ErrorBanner message={error} />}

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm border-collapse min-w-[820px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input">
              <th className="py-2 px-2 font-medium">Supplier</th>
              <th className="py-2 px-2 font-medium">Price</th>
              <th className="py-2 px-2 font-medium">Currency</th>
              <th className="py-2 px-2 font-medium">Qty Available</th>
              <th className="py-2 px-2 font-medium">Delivery Date</th>
              <th className="py-2 px-2 font-medium">Payment Terms</th>
              <th className="py-2 px-2 font-medium">Quality/Risk Notes</th>
              <th className="py-2 px-2 font-medium w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-2">
                  <select
                    className="h-8 w-full min-w-[160px] rounded-md border border-input bg-transparent px-2 text-sm"
                    value={row.supplierId}
                    onChange={(e) => update(i, { supplierId: e.target.value })}
                  >
                    <option value="">Supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number" step="0.01" min="0" className="h-8 w-24"
                    value={row.price || ""} onChange={(e) => update(i, { price: Number(e.target.value) })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    className="h-8 w-20" placeholder="USD"
                    value={row.currency ?? ""} onChange={(e) => update(i, { currency: e.target.value || undefined })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number" step="0.01" className="h-8 w-24"
                    value={row.quantityAvailable ?? ""} onChange={(e) => update(i, { quantityAvailable: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="date" className="h-8 w-36"
                    value={row.deliveryDate ?? ""} onChange={(e) => update(i, { deliveryDate: e.target.value || undefined })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    className="h-8 w-32" placeholder="Optional"
                    value={row.paymentTerms ?? ""} onChange={(e) => update(i, { paymentTerms: e.target.value || undefined })}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    className="h-8 w-36" placeholder="Optional"
                    value={row.qualityRiskNotes ?? ""} onChange={(e) => update(i, { qualityRiskNotes: e.target.value || undefined })}
                  />
                </td>
                <td className="py-2 px-2">
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={rows.length === 1}
                    className="text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
        <Plus className="h-3.5 w-3.5" /> Add quotation row
      </Button>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
            Cancel
          </Button>
        )}
        <Button type="button" disabled={mutation.isPending} onClick={handleSave} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${rows.filter((r) => r.supplierId && r.price > 0).length || ""} Quotation${rows.filter((r) => r.supplierId && r.price > 0).length === 1 ? "" : "s"} →`}
        </Button>
      </div>
    </div>
  );
}

// ── A06 — Comparison & selection ─────────────────────────────────────────────

function ConfirmSupplierSelectionModal({
  sourcingNumber, quotation, onConfirm, onCancel, submitting,
}: {
  sourcingNumber: string;
  quotation: SteelSourcingOrder["quotations"][number] | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const supplierName = quotation?.supplier?.name ?? "this supplier";
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-background shadow-xl border border-input p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Confirm supplier selection?</h2>
            <p className="text-xs text-muted-foreground">Sourcing order {sourcingNumber}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          This will select <span className="font-medium text-foreground">{supplierName}</span> for this sourcing order and
          continue the procurement process. Once confirmed, this decision cannot be changed from here.
        </p>
        {quotation && (
          <DocGrid>
            <DocField label="Quoted Price" value={`${quotation.price} ${quotation.currency}`} />
            <DocField label="Qty Available" value={quotation.quantityAvailable} />
            <DocField label="Delivery Date" value={quotation.deliveryDate ? new Date(quotation.deliveryDate).toLocaleDateString() : null} />
            <DocField label="Payment Terms" value={quotation.paymentTerms} />
          </DocGrid>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Supplier Selection"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Weighted Quality/Cost/Delivery score per quotation, using the org's configured
// QCD criteria (SteelQcdCriteria) — never a hard-coded formula. Quality/Delivery
// come from the supplier's existing scores; Cost is derived from the quoted price
// (lowest price among the collected quotations scores highest). Returns null
// scores wherever the underlying data isn't available, rather than inventing one.
function useQcdScores(order: SteelSourcingOrder, token: string) {
  const qcdQuery = useQuery({
    queryKey: ["steel-config-qcd-criteria"],
    queryFn: () => SteelConfigService.listQcdCriteria(token),
    enabled: !!token,
  });
  const criteria = (qcdQuery.data ?? []).find((c) => c.isActive) ?? null;

  const prices = order.quotations.map((q) => q.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const scores = new Map<string, { quality: number | null; cost: number | null; delivery: number | null; overall: number | null }>();
  for (const q of order.quotations) {
    const quality = q.supplier?.qualityScore ?? null;
    const delivery = q.supplier?.deliveryScore ?? null;
    const cost = maxPrice === minPrice ? 100 : Math.round(((maxPrice - q.price) / (maxPrice - minPrice)) * 100);
    let overall: number | null = null;
    if (criteria) {
      const parts: { value: number; weight: number }[] = [{ value: cost, weight: criteria.costWeight }];
      if (quality != null) parts.push({ value: quality, weight: criteria.qualityWeight });
      if (delivery != null) parts.push({ value: delivery, weight: criteria.deliveryWeight });
      const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
      overall = totalWeight > 0 ? Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight) : null;
    }
    scores.set(q.supplierId, { quality, cost, delivery, overall });
  }

  const recommended = criteria
    ? [...scores.entries()].reduce<{ supplierId: string; overall: number } | null>((best, [supplierId, s]) => {
        if (s.overall == null) return best;
        if (!best || s.overall > best.overall) return { supplierId, overall: s.overall };
        return best;
      }, null)
    : null;

  return { criteria, scores, recommended, isLoading: qcdQuery.isLoading };
}

function QuotationComparison({
  order, token, onDone, onRevise, canRevise,
}: { order: SteelSourcingOrder; token: string; onDone: () => void; onRevise: () => void; canRevise: boolean }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState(order.selectedSupplierId ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const decided = order.stage === "A06_SUPPLIER_SELECTED";
  const { criteria, scores, recommended } = useQcdScores(order, token);
  const recommendedSupplier = recommended ? order.quotations.find((q) => q.supplierId === recommended.supplierId)?.supplier : null;

  const mutation = useMutation({
    mutationFn: (payload: SelectSupplierPayload) => SteelSourcingService.selectSupplier(order.id, payload, token),
    onSuccess: () => {
      toast("Supplier selected.", "success");
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  const handleConfirm = () => {
    setError(null);
    if (!selected) {
      setError("Select a supplier from the comparison before confirming.");
      return;
    }
    setConfirming(true);
  };

  const selectedQuotation = order.quotations.find((q) => q.supplierId === selected);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {order.quotations.length} quotation{order.quotations.length === 1 ? "" : "s"} collected.
          {!decided && " Select the winning supplier below."}
        </p>
        {canRevise && !decided && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRevise}>
            <Pencil className="h-3.5 w-3.5" /> Revise quotations
          </Button>
        )}
      </div>
      {error && <ErrorBanner message={error} />}

      {!criteria && (
        <SummaryBlock tone="neutral">
          No QCD evaluation criteria configured yet — showing price-based comparison only. Configure Quality/Cost/Delivery
          weights in Steel Configuration to see a weighted overall score.
        </SummaryBlock>
      )}

      {criteria && recommendedSupplier && !decided && (
        <SummaryBlock tone="info">
          <span className="font-medium">Recommended Supplier:</span> {recommendedSupplier.name} — highest overall QCD score
          using the configured weights (Quality {criteria.qualityWeight}, Cost {criteria.costWeight}, Delivery {criteria.deliveryWeight}).
        </SummaryBlock>
      )}

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input">
              {!decided && <th className="py-2 px-2 font-medium w-10" />}
              <th className="py-2 px-2 font-medium">Supplier</th>
              <th className="py-2 px-2 font-medium">Price</th>
              <th className="py-2 px-2 font-medium">Qty Available</th>
              <th className="py-2 px-2 font-medium">Delivery Date</th>
              {criteria && <th className="py-2 px-2 font-medium text-right">Quality</th>}
              {criteria && <th className="py-2 px-2 font-medium text-right">Cost</th>}
              {criteria && <th className="py-2 px-2 font-medium text-right">Delivery</th>}
              {criteria && <th className="py-2 px-2 font-medium text-right">Overall</th>}
              {decided && <th className="py-2 px-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {order.quotations.map((q) => {
              const isWinner = q.supplierId === order.selectedSupplierId;
              const isChosenPreConfirm = !decided && q.supplierId === selected;
              const score = scores.get(q.supplierId);
              return (
                <tr
                  key={q.id}
                  onClick={() => !decided && setSelected(q.supplierId)}
                  className={
                    "border-b border-input/50 last:border-0 " +
                    (!decided ? "cursor-pointer hover:bg-muted/40 " : "") +
                    (isWinner ? "bg-emerald-50" : isChosenPreConfirm ? "bg-blue-50" : "") +
                    (decided && !isWinner ? " opacity-50" : "")
                  }
                >
                  {!decided && (
                    <td className="py-2.5 px-2">
                      <input
                        type="radio"
                        name="selected-supplier"
                        checked={selected === q.supplierId}
                        onChange={() => setSelected(q.supplierId)}
                      />
                    </td>
                  )}
                  <td className="py-2.5 px-2 font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      {q.supplier?.name ?? "—"}
                      {isWinner && (
                        <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                          <Trophy className="h-3 w-3" /> Selected
                        </Badge>
                      )}
                      {!decided && recommended?.supplierId === q.supplierId && (
                        <Badge className="bg-blue-100 text-blue-700">Recommended</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-foreground">{q.price} {q.currency}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">{q.quantityAvailable ?? "—"}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">{q.deliveryDate ? new Date(q.deliveryDate).toLocaleDateString() : "—"}</td>
                  {criteria && <td className="py-2.5 px-2 text-right text-muted-foreground">{score?.quality ?? "—"}</td>}
                  {criteria && <td className="py-2.5 px-2 text-right text-muted-foreground">{score?.cost ?? "—"}</td>}
                  {criteria && <td className="py-2.5 px-2 text-right text-muted-foreground">{score?.delivery ?? "—"}</td>}
                  {criteria && <td className="py-2.5 px-2 text-right font-semibold text-foreground">{score?.overall ?? "—"}</td>}
                  {decided && <td className="py-2.5 px-2" />}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!decided && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Selection Justification (optional)</label>
            <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this supplier was chosen — quality, cost, delivery reasoning" />
          </div>
          <div className="flex items-center justify-end">
            <Button type="button" disabled={!selected || mutation.isPending} onClick={handleConfirm} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Select Supplier →"}
            </Button>
          </div>
        </div>
      )}

      {decided && order.qcdComparisonNotes && <DocField label="Selection justification" value={order.qcdComparisonNotes} />}

      {confirming && (
        <ConfirmSupplierSelectionModal
          sourcingNumber={order.sourcingNumber}
          quotation={selectedQuotation}
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ selectedSupplierId: selected, qcdComparisonNotes: notes || undefined })}
        />
      )}
    </div>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S3QuoteSelection({
  order, token, onRefresh,
}: { order: SteelSourcingOrder; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  // Explicit "revise quotations" toggle for the pre-selection compare view —
  // does not change server stage, purely local view state.
  const [revising, setRevising] = useState(false);

  const { isLoading: suppliersLoading, isError: suppliersErrored, usedEligibility, eligibleSuppliers, refetch: refetchSuppliers } = useEligibleSuppliers(order, token);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    setRevising(false);
    onRefresh();
  };

  const allDone = order.stage === "A06_SUPPLIER_SELECTED";
  const hasQuotations = order.quotations.length > 0;

  const showingEntryForm = !hasQuotations || revising;

  let eligibleSectionBody: React.ReactNode;
  let priceSectionBody: React.ReactNode;
  let comparisonSectionBody: React.ReactNode;

  if (suppliersLoading) {
    eligibleSectionBody = (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
    priceSectionBody = null;
    comparisonSectionBody = null;
  } else if (suppliersErrored) {
    eligibleSectionBody = (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-muted-foreground">Suppliers could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={refetchSuppliers}>Retry</Button>
      </div>
    );
    priceSectionBody = null;
    comparisonSectionBody = null;
  } else if (eligibleSuppliers.length === 0) {
    eligibleSectionBody = (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
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
            <p className="text-xs text-muted-foreground">Add a supplier in Steel Configuration before collecting quotations.</p>
          </>
        )}
      </div>
    );
    priceSectionBody = null;
    comparisonSectionBody = null;
  } else {
    eligibleSectionBody = <SupplierComparisonTable suppliers={eligibleSuppliers} selectedId="" onSelect={() => undefined} />;
    if (showingEntryForm) {
      priceSectionBody = (
        <QuotationEntryForm
          order={order} token={token} suppliers={eligibleSuppliers}
          onDone={refresh}
          onCancel={hasQuotations ? () => setRevising(false) : undefined}
        />
      );
      comparisonSectionBody = <p className="text-sm text-muted-foreground">Save at least one quotation to see the comparison.</p>;
    } else {
      priceSectionBody = (
        <p className="text-xs text-muted-foreground">
          {order.quotations.length} quotation{order.quotations.length === 1 ? "" : "s"} on file — see the comparison below.
        </p>
      );
      comparisonSectionBody = allDone ? (
        <QuotationComparison order={order} token={token} onDone={refresh} onRevise={() => setRevising(true)} canRevise={false} />
      ) : (
        <QuotationComparison order={order} token={token} onDone={refresh} onRevise={() => setRevising(true)} canRevise />
      );
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <ScreenHeader
        icon={Scale}
        title="Sourcing Decision"
        subtitle="Collect competing quotations, compare on Quality/Cost/Delivery, and select the winning supplier."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={allDone ? 3 : 2}
        activeIndex={allDone ? null : 2}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />

      <P02Layout
        info={
          <P02InfoCard
            alreadyProvided="Eligible suppliers and the QCD scoring weights, from Configuration."
            whatToEnter="Current price, availability, delivery commitment, and quotation reference per supplier, plus your selection justification."
            beforeYouContinue={["Quotation information is current and accurate.", "Selected supplier is the best justified option."]}
          />
        }
      >
        <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
          <DocSection number="—" title="Procurement Request" first>
            <OrderReferenceHeader order={order} />
          </DocSection>

          <DocSection number="—" title="Eligible Suppliers">
            {eligibleSectionBody}
          </DocSection>

          <DocSection number="05" title="Price & Availability" status={hasQuotations && !revising ? "done" : "active"}>
            {priceSectionBody}
            <div className="mt-3">
              <AttachmentPanel sourcingId={order.id} stage="A05_QUOTATIONS_COLLECTED" token={token} label="Quotations & Price Offers" />
            </div>
          </DocSection>

          <DocSection number="06" title="QCD Comparison & Selection" status={allDone ? "done" : hasQuotations && !revising ? "active" : "locked"}>
            {comparisonSectionBody}
            {allDone && (() => {
              const log = [...order.activityLogs].reverse().find((l) => l.activity === "A06");
              return log ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Selected by {log.performedBy.firstName} {log.performedBy.lastName} on {new Date(log.createdAt).toLocaleString()}
                </p>
              ) : null;
            })()}
          </DocSection>

          {allDone && (
            <StickyActions>
              <Button onClick={refresh} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                Continue to Purchase Order <ArrowRight className="h-4 w-4" />
              </Button>
            </StickyActions>
          )}
        </div>
      </P02Layout>
    </div>
  );
}
