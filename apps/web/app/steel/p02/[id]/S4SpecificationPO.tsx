"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  ConfirmSpecPayload,
  CreatePurchaseOrderPayload,
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
  FileCheck2,
  ShieldCheck,
  Check,
  CheckCircle2,
  Circle,
  Lock,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  X,
  Plus,
  Gavel,
} from "lucide-react";

// Same PO authority scope enforced server-side by the sourcing controller's
// PO_ROLES guard — kept identical rather than inventing a new list.
const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

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
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Order Context</CardTitle>
        <p className="text-sm text-slate-500">From S1–S3 — read only.</p>
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
            <p className="text-xs text-slate-400">Selected Supplier</p>
            <p className="font-medium text-slate-800">{winner?.supplier?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Winning Quote</p>
            <p className="font-medium text-slate-800">{winner ? `${winner.price} ${winner.currency}` : "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ order, subStep }: { order: SteelSourcingOrder; subStep: "A07" | "A08" | "done" }) {
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
            S4 covers P02-A07 (confirm the technical specification and document requirements) and P02-A08 (issue the
            purchase order). A07 is sourcing preparation; A08 is a Management approval and financial commitment.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specification</CardTitle>
        </CardHeader>
        <CardContent>
          {order.specificationRequirementNotes || order.certificateRequired !== null || order.documentsRequired.length > 0 ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Certificate Required</dt>
                <dd className="text-slate-700 font-medium text-right">{order.certificateRequired ? "Yes" : "No"}</dd>
              </div>
              {order.documentsRequired.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Documents</dt>
                  <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">{order.documentsRequired.join(", ")}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Specification details will appear here once confirmed.</p>
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
            {subStep === "A07"
              ? "Once the specification is confirmed, the purchase order can be issued by a Management/Admin role in this same screen."
              : subStep === "A08"
                ? "Once the purchase order is issued, this order moves to S5 — Delivery, Logistics & Handover."
                : "Continue to S5 — Delivery, Logistics & Handover."}
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
            {subStep === "A07" ? (
              <>
                <li>Certificate and document requirements are optional but should reflect the customer/plan spec.</li>
                <li>These requirements carry forward to the purchase order and intake steps.</li>
              </>
            ) : (
              <>
                <li>PO price and quantity don&apos;t have to exactly match the winning quotation — differences are shown, not blocked.</li>
                <li>Only Management, Admin, or Super Admin can issue the purchase order.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A07 — Specification ──────────────────────────────────────────────────────

function StepSection({
  code, icon: Icon, title, status, children,
}: { code: string; icon: typeof FileCheck2; title: string; status: "done" | "active" | "locked"; children: React.ReactNode }) {
  return (
    <Card className={status === "locked" ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 " +
                (status === "done"
                  ? "bg-emerald-100 text-emerald-600"
                  : status === "active"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-slate-100 text-slate-400")
              }
            >
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm">
              <span className="text-slate-400 font-mono text-xs mr-1.5">{code}</span>
              {title}
            </CardTitle>
          </div>
          {status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {status === "active" && <Circle className="h-4 w-4 text-blue-500 fill-blue-100 shrink-0" />}
          {status === "locked" && <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SpecificationForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [certificateRequired, setCertificateRequired] = useState(true);
  const [docInput, setDocInput] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmSpecPayload) => SteelSourcingService.confirmSpecification(id, payload, token),
    onSuccess: () => {
      toast("Specification confirmed — the purchase order can now be issued.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const addDoc = () => {
    const trimmed = docInput.trim();
    if (trimmed && !docs.includes(trimmed)) setDocs((prev) => [...prev, trimmed]);
    setDocInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      specificationRequirementNotes: notes || undefined,
      certificateRequired,
      documentsRequired: docs.length > 0 ? docs : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Specification / grade / standard notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any grade, standard, or specification detail the supplier must meet"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">{notes.length}/500</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={certificateRequired} onChange={(e) => setCertificateRequired(e.target.checked)} />
        Test certificate required
      </label>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Documents required <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <div className="flex gap-2">
          <Input
            value={docInput}
            onChange={(e) => setDocInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDoc(); } }}
            placeholder="e.g. Mill Test Certificate — press Enter to add"
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={addDoc}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {docs.map((d) => (
              <Badge key={d} className="bg-slate-100 text-slate-700 gap-1.5">
                {d}
                <button type="button" onClick={() => setDocs((prev) => prev.filter((x) => x !== d))} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Specification →"}
        </Button>
      </div>
    </form>
  );
}

// ── A08 — Purchase order ─────────────────────────────────────────────────────

function DeltaBadge({ label, delta, unit }: { label: string; delta: number; unit?: string }) {
  if (delta === 0 || Number.isNaN(delta)) return null;
  const positive = delta > 0;
  return (
    <span
      className={
        "text-xs font-medium px-1.5 py-0.5 rounded " +
        (positive ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")
      }
    >
      {label} {positive ? "+" : ""}{delta}{unit ?? ""} vs. quote
    </span>
  );
}

function PurchaseOrderForm({
  id, token, winner, onDone,
}: { id: string; token: string; winner: SteelSourcingOrder["quotations"][number] | undefined; onDone: () => void }) {
  const { toast } = useToast();
  const [poNumber, setPoNumber] = useState("");
  const [poItem, setPoItem] = useState("");
  const [poQuantity, setPoQuantity] = useState("");
  const [poPrice, setPoPrice] = useState(winner ? String(winner.price) : "");
  const [poCurrency, setPoCurrency] = useState(winner?.currency ?? "USD");
  const [poDeliveryTerms, setPoDeliveryTerms] = useState(winner?.paymentTerms ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CreatePurchaseOrderPayload) => SteelSourcingService.createPurchaseOrder(id, payload, token),
    onSuccess: () => {
      toast("Purchase order issued.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const qtyNum = Number(poQuantity);
  const priceNum = Number(poPrice);
  const valid = poNumber.trim() && qtyNum > 0 && priceNum >= 0;

  const priceDelta = winner && poPrice !== "" ? Math.round((priceNum - winner.price) * 100) / 100 : 0;
  const qtyDelta =
    winner?.quantityAvailable != null && poQuantity !== "" ? Math.round((qtyNum - winner.quantityAvailable) * 100) / 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setError("PO number, a valid quantity, and a valid price are required.");
      return;
    }
    mutation.mutate({
      poNumber: poNumber.trim(),
      poItem: poItem || undefined,
      poQuantity: qtyNum,
      poPrice: priceNum,
      poCurrency: poCurrency || undefined,
      poDeliveryTerms: poDeliveryTerms || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {winner && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <p className="text-xs text-slate-400 mb-1">Winning quotation, for comparison</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-medium text-slate-800">{winner.supplier?.name}</span>
            <span className="text-slate-600">{winner.price} {winner.currency}</span>
            {winner.quantityAvailable != null && <span className="text-slate-600">{winner.quantityAvailable} available</span>}
            {winner.deliveryDate && <span className="text-slate-600">Delivery {new Date(winner.deliveryDate).toLocaleDateString()}</span>}
            {winner.paymentTerms && <span className="text-slate-600">{winner.paymentTerms}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
            PO number <span className="text-red-500">*</span>
          </label>
          <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-2026-0142" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Item description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={poItem} onChange={(e) => setPoItem(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
            Quantity <span className="text-red-500">*</span>
          </label>
          <Input type="number" step="0.01" min="0.01" value={poQuantity} onChange={(e) => setPoQuantity(e.target.value)} placeholder="e.g. 50" />
          {qtyDelta !== 0 && <div className="mt-1"><DeltaBadge label="Qty" delta={qtyDelta} /></div>}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
            Price <span className="text-red-500">*</span>
          </label>
          <Input type="number" step="0.01" min="0" value={poPrice} onChange={(e) => setPoPrice(e.target.value)} placeholder="e.g. 620" />
          {priceDelta !== 0 && <div className="mt-1"><DeltaBadge label="Price" delta={priceDelta} /></div>}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Currency <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={poCurrency} onChange={(e) => setPoCurrency(e.target.value)} placeholder="USD" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Delivery terms <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={poDeliveryTerms} onChange={(e) => setPoDeliveryTerms(e.target.value)} placeholder="e.g. FOB, CIF, Ex-works" />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!valid || mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue Purchase Order →"}
        </Button>
      </div>
    </form>
  );
}

function ApprovalLockedCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Purchase order requires Management approval</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin roles can issue the purchase order for this sourcing order. Ask a
            Management or Admin user to complete this step, or return once your role has been elevated.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── S4 completion ─────────────────────────────────────────────────────────────

function S4CompleteCard({ order, onContinue }: { order: SteelSourcingOrder; onContinue: () => void }) {
  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700">
          <Check className="h-4 w-4" />
          Purchase Order Issued
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="PO Number" value={order.poNumber} />
          <Field label="Quantity" value={order.poQuantity} />
          <Field label="Price" value={order.poPrice != null ? `${order.poPrice} ${order.poCurrency}` : null} />
          <Field label="Delivery Terms" value={order.poDeliveryTerms} />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
          Next: <span className="font-medium text-slate-700">S5 — Delivery, Logistics &amp; Handover</span>
        </div>
        <Button onClick={onContinue} className="gap-2">
          Continue to S5 — Delivery &amp; Handover <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S4SpecificationPO({
  order, token, onRefresh,
}: { order: SteelSourcingOrder; token: string; onRefresh: () => void }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canIssuePO = !!(user?.roleLevel && PO_ROLES.includes(user.roleLevel as Role));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    onRefresh();
  };

  const statusFor = (stage: SteelSourcingOrder["stage"]): "done" | "active" | "locked" => {
    const order4: SteelSourcingOrder["stage"][] = [
      "A06_SUPPLIER_SELECTED",
      "A07_SPEC_CONFIRMED",
      "A08_PO_CREATED",
    ];
    const currentIdx = order4.indexOf(order.stage);
    const targetIdx = order4.indexOf(stage);
    if (currentIdx >= targetIdx) return "done";
    if (currentIdx === targetIdx - 1) return "active";
    return "locked";
  };

  const a07Status = statusFor("A07_SPEC_CONFIRMED");
  const a08Status = statusFor("A08_PO_CREATED");
  const allDone = order.stage === "A08_PO_CREATED";
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);

  const subStep: "A07" | "A08" | "done" = allDone ? "done" : a07Status === "active" ? "A07" : "A08";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={FileCheck2}
        title="Specification & Purchase Order"
        subtitle="Confirm the technical specification, then issue the purchase order."
      />
      <WorkflowIndicator doneCount={allDone ? 4 : 3} activeIndex={allDone ? null : 3} />
      <ContextSummary order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <StepSection code="P02-A07" icon={FileCheck2} title="Confirm Technical Specification & Documents Required" status={a07Status}>
            {a07Status === "done" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Spec notes" value={order.specificationRequirementNotes} />
                <Field label="Certificate required" value={order.certificateRequired ? "Yes" : "No"} />
                <Field label="Documents required" value={order.documentsRequired.join(", ")} />
              </div>
            ) : a07Status === "active" ? (
              <SpecificationForm id={order.id} token={token} onDone={refresh} />
            ) : (
              <p className="text-sm text-slate-400">Complete the previous step first.</p>
            )}
          </StepSection>

          <div className="relative">
            <div className="flex items-center gap-2 mb-1 px-1">
              <Gavel className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Management Approval &amp; Purchase Commitment</p>
            </div>
            <StepSection code="P02-A08" icon={ShieldCheck} title="Create Purchase Order" status={a08Status}>
              {a08Status === "done" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="PO number" value={order.poNumber} />
                  <Field label="Quantity" value={order.poQuantity} />
                  <Field label="Price" value={order.poPrice != null ? `${order.poPrice} ${order.poCurrency}` : null} />
                  <Field label="Delivery terms" value={order.poDeliveryTerms} />
                </div>
              ) : a08Status === "active" ? (
                canIssuePO ? (
                  <PurchaseOrderForm id={order.id} token={token} winner={winner} onDone={refresh} />
                ) : (
                  <ApprovalLockedCard />
                )
              ) : (
                <p className="text-sm text-slate-400">Complete the specification step first.</p>
              )}
            </StepSection>
          </div>

          {allDone && <S4CompleteCard order={order} onContinue={refresh} />}
        </div>
        <Sidebar order={order} subStep={subStep} />
      </div>
    </div>
  );
}
