"use client";

import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/p02/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/p02/ScreenHeader";
import { ScreenSidebar } from "@/components/steel/p02/ScreenSidebar";
import {
  Loader2,
  Scale,
  Trophy,
  Plus,
  Trash2,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Users,
  Pencil,
} from "lucide-react";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

// ── Persistent context (top of screen) ───────────────────────────────────────

function ContextSummary({ order }: { order: SteelSourcingOrder }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Order Context</CardTitle>
        <p className="text-sm text-slate-500">From S1/S2 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Sourcing Order</p>
            <p className="font-medium text-slate-800">{order.sourcingNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Production Plan</p>
            <p className="font-medium text-slate-800">{order.plan?.planNumber ?? "—"}</p>
          </div>
          {order.plan?.customerName && (
            <div>
              <p className="text-xs text-slate-400">Customer</p>
              <p className="font-medium text-slate-800">{order.plan.customerName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Material Type</p>
            <p className="font-medium text-slate-800">{order.materialType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Checked Supplier</p>
            <p className="font-medium text-slate-800">{order.supplier?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Supplier Risk</p>
            <p className="font-medium text-slate-800">{order.supplierRiskLevel ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ order, subStep }: { order: SteelSourcingOrder; subStep: "A05" | "A06" | "done" }) {
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
            S3 covers P02-A05 (collect quotations from candidate suppliers) and P02-A06 (select the winning supplier
            directly from the comparison). This is the pivotal sourcing decision for the order.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quotations</CardTitle>
        </CardHeader>
        <CardContent>
          {order.quotations.length > 0 ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Collected</dt>
                <dd className="text-slate-700 font-medium text-right">{order.quotations.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Lowest Price</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {order.quotations[0].price} {order.quotations[0].currency}
                </dd>
              </div>
              {order.selectedSupplierId && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Selected</dt>
                  <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">
                    {order.quotations.find((q) => q.supplierId === order.selectedSupplierId)?.supplier?.name ?? "—"}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Quotations will appear here once collected.</p>
          )}
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
            {subStep === "A05"
              ? "Once at least one quotation is saved, you'll select the winning supplier directly from the comparison in this same screen."
              : subStep === "A06"
                ? "Once a supplier is selected, this order moves to S4 — Specification & Purchase Order."
                : "Continue to S4 — Specification & Purchase Order."}
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
            {subStep === "A05" ? (
              <>
                <li>Saving quotations replaces the entire quotation set — include every supplier you want to compare.</li>
                <li>Quantity, delivery date, payment terms, and quality/risk notes are optional but help comparison.</li>
              </>
            ) : (
              <>
                <li>Only suppliers with a saved quotation can be selected.</li>
                <li>QCD comparison notes are optional context for why this supplier was chosen.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
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
    <Card>
      <CardHeader>
        <CardTitle>{hasExisting ? "Revise Quotations" : "Collect Quotations"}</CardTitle>
        <p className="text-sm text-slate-500">
          Add a row per supplier quote. <span className="font-medium text-slate-600">Saving replaces the entire quotation set</span> — include every supplier you want to compare.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
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
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 px-2">
                    <select
                      className="h-8 w-full min-w-[160px] rounded-lg border border-input bg-transparent px-2 text-sm"
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
                      type="number" step="0.01" min="0" className="w-24"
                      value={row.price || ""} onChange={(e) => update(i, { price: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      className="w-20" placeholder="USD"
                      value={row.currency ?? ""} onChange={(e) => update(i, { currency: e.target.value || undefined })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      type="number" step="0.01" className="w-24"
                      value={row.quantityAvailable ?? ""} onChange={(e) => update(i, { quantityAvailable: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      type="date" className="w-36"
                      value={row.deliveryDate ?? ""} onChange={(e) => update(i, { deliveryDate: e.target.value || undefined })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      className="w-32" placeholder="Optional"
                      value={row.paymentTerms ?? ""} onChange={(e) => update(i, { paymentTerms: e.target.value || undefined })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      className="w-36" placeholder="Optional"
                      value={row.qualityRiskNotes ?? ""} onChange={(e) => update(i, { qualityRiskNotes: e.target.value || undefined })}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={rows.length === 1}
                      className="text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
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
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" disabled={mutation.isPending} onClick={handleSave} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${rows.filter((r) => r.supplierId && r.price > 0).length || ""} Quotation${rows.filter((r) => r.supplierId && r.price > 0).length === 1 ? "" : "s"} →`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── A06 — Comparison & selection ─────────────────────────────────────────────

function QuotationComparison({
  order, token, onDone, onRevise, canRevise,
}: { order: SteelSourcingOrder; token: string; onDone: () => void; onRevise: () => void; canRevise: boolean }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState(order.selectedSupplierId ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decided = order.stage === "A06_SUPPLIER_SELECTED";

  const mutation = useMutation({
    mutationFn: (payload: SelectSupplierPayload) => SteelSourcingService.selectSupplier(order.id, payload, token),
    onSuccess: () => {
      toast("Supplier selected.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleConfirm = () => {
    setError(null);
    if (!selected) {
      setError("Select a supplier from the comparison before confirming.");
      return;
    }
    mutation.mutate({ selectedSupplierId: selected, qcdComparisonNotes: notes || undefined });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-600" />
              Quote Comparison
            </CardTitle>
            <p className="text-sm text-slate-500">
              {order.quotations.length} quotation{order.quotations.length === 1 ? "" : "s"} collected.
              {!decided && " Select the winning supplier below."}
            </p>
          </div>
          {canRevise && !decided && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRevise}>
              <Pencil className="h-3.5 w-3.5" /> Revise quotations
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                {!decided && <th className="py-2 px-2 font-medium w-10" />}
                <th className="py-2 px-2 font-medium">Supplier</th>
                <th className="py-2 px-2 font-medium">Price</th>
                <th className="py-2 px-2 font-medium">Qty Available</th>
                <th className="py-2 px-2 font-medium">Delivery Date</th>
                <th className="py-2 px-2 font-medium">Payment Terms</th>
                <th className="py-2 px-2 font-medium">Quality/Risk Notes</th>
                {decided && <th className="py-2 px-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {order.quotations.map((q) => {
                const isWinner = q.supplierId === order.selectedSupplierId;
                const isChosenPreConfirm = !decided && q.supplierId === selected;
                return (
                  <tr
                    key={q.id}
                    onClick={() => !decided && setSelected(q.supplierId)}
                    className={
                      "border-b border-slate-100 last:border-0 " +
                      (!decided ? "cursor-pointer hover:bg-slate-50 " : "") +
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
                    <td className="py-2.5 px-2 font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        {q.supplier?.name ?? "—"}
                        {isWinner && (
                          <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                            <Trophy className="h-3 w-3" /> Selected
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-slate-800">{q.price} {q.currency}</td>
                    <td className="py-2.5 px-2 text-slate-600">{q.quantityAvailable ?? "—"}</td>
                    <td className="py-2.5 px-2 text-slate-600">{q.deliveryDate ? new Date(q.deliveryDate).toLocaleDateString() : "—"}</td>
                    <td className="py-2.5 px-2 text-slate-600">{q.paymentTerms ?? "—"}</td>
                    <td className="py-2.5 px-2 text-slate-600">{q.qualityRiskNotes ?? "—"}</td>
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
              <label className="text-sm font-medium text-slate-700 block mb-1">
                QCD comparison notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this supplier was chosen — quality, cost, delivery reasoning" />
            </div>
            <div className="flex items-center justify-end">
              <Button type="button" disabled={!selected || mutation.isPending} onClick={handleConfirm} className="gap-2">
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Supplier Selection →"}
              </Button>
            </div>
          </div>
        )}

        {decided && order.qcdComparisonNotes && (
          <div>
            <p className="text-xs text-slate-400">QCD comparison notes</p>
            <p className="text-sm text-slate-700">{order.qcdComparisonNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── S3 completion ─────────────────────────────────────────────────────────────

function S3CompleteCard({ order, onContinue }: { order: SteelSourcingOrder; onContinue: () => void }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700">
          <Trophy className="h-4 w-4" />
          Supplier Selected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Selected Supplier" value={winner?.supplier?.name} />
          <Field label="Quoted Price" value={winner ? `${winner.price} ${winner.currency}` : null} />
          <Field label="QCD Notes" value={order.qcdComparisonNotes} />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
          Next: <span className="font-medium text-slate-700">S4 — Specification &amp; Purchase Order</span>
        </div>
        <Button onClick={onContinue} className="gap-2">
          Continue to S4 — Specification &amp; Purchase Order <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
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

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => SteelSourcingService.getSuppliers(token),
    enabled: !!token,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    setRevising(false);
    onRefresh();
  };

  const allDone = order.stage === "A06_SUPPLIER_SELECTED";
  const hasQuotations = order.quotations.length > 0;
  const subStep: "A05" | "A06" | "done" = allDone ? "done" : hasQuotations && !revising ? "A06" : "A05";

  let body: React.ReactNode;

  if (suppliersQuery.isLoading) {
    body = (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  } else if (suppliersQuery.isError) {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-slate-600">Suppliers could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={() => suppliersQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if ((suppliersQuery.data ?? []).length === 0 && !hasQuotations) {
    body = (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Users className="h-5 w-5 text-slate-300" />
          <p className="text-sm text-slate-600">No suppliers found yet.</p>
          <p className="text-xs text-slate-400">Add a supplier to the master list before collecting quotations.</p>
        </CardContent>
      </Card>
    );
  } else if (allDone) {
    body = (
      <div className="space-y-4">
        <QuotationComparison order={order} token={token} onDone={refresh} onRevise={() => setRevising(true)} canRevise={false} />
        <S3CompleteCard order={order} onContinue={refresh} />
      </div>
    );
  } else if (hasQuotations && !revising) {
    body = (
      <QuotationComparison
        order={order} token={token} onDone={refresh}
        onRevise={() => setRevising(true)} canRevise
      />
    );
  } else {
    body = (
      <QuotationEntryForm
        order={order} token={token} suppliers={suppliersQuery.data ?? []}
        onDone={refresh}
        onCancel={hasQuotations ? () => setRevising(false) : undefined}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={Scale}
        title="Quote Comparison & Selection"
        subtitle="Collect competing quotations and select the winning supplier."
      />
      <WorkflowIndicator doneCount={allDone ? 3 : 2} activeIndex={allDone ? null : 2} />
      <ContextSummary order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">{body}</div>
        <Sidebar order={order} subStep={subStep} />
      </div>
    </div>
  );
}
