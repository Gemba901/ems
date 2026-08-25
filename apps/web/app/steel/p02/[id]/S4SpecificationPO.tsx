"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  ConfirmSpecPayload,
  CreatePurchaseOrderPayload,
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
import { AttachmentPanel } from "@/components/steel/p02/AttachmentPanel";
import { Loader2, FileCheck2, ArrowRight, X, Plus } from "lucide-react";

// Same PO authority scope enforced server-side by the sourcing controller's
// PO_ROLES guard — kept identical rather than inventing a new list.
const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// ── Order reference header (always visible, read-only) ──────────────────────

function OrderReferenceHeader({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  return (
    <DocGrid cols={4}>
      <DocField label="Sourcing Order" value={order.sourcingNumber} source="From Production Plan" />
      <DocField label="Production Plan" value={order.plan?.planNumber} source="From Production Plan" />
      <DocField label="Selected Supplier" value={winner?.supplier?.name} source="From Sourcing Decision" />
      <DocField label="Winning Quote" value={winner ? `${winner.price} ${winner.currency}` : null} source="From Sourcing Decision" />
    </DocGrid>
  );
}

// ── A07 — Technical requirements (pulled from Material Master, not retyped) ──

function ConfiguredRequirements({ order, token }: { order: SteelSourcingOrder; token: string }) {
  const materialsQuery = useQuery({
    queryKey: ["steel-config-materials", "active"],
    queryFn: () => SteelConfigService.listMaterials(token),
    enabled: !!token,
  });
  const matched = materialsQuery.data?.find((m) => m.materialType === order.materialType);
  if (!matched || (!matched.specificationReference && matched.requiredDocuments.length === 0)) return null;

  return (
    <SummaryBlock tone="info">
      <span className="font-medium">From Material Configuration ({matched.name}):</span>{" "}
      {matched.specificationReference && <>Specification: {matched.specificationReference}. </>}
      {matched.requiredDocuments.length > 0 && <>Required documents: {matched.requiredDocuments.join(", ")}.</>}
    </SummaryBlock>
  );
}

function SpecificationForm({ id, token, order, onDone }: { id: string; token: string; order: SteelSourcingOrder; onDone: () => void }) {
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
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <ConfiguredRequirements order={order} token={token} />

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Specification / grade / standard notes (optional)
        </label>
        <textarea
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any grade, standard, or specification detail the supplier must meet"
        />
        <p className="text-xs text-muted-foreground mt-1 text-right">{notes.length}/500</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={certificateRequired} onChange={(e) => setCertificateRequired(e.target.checked)} />
        Test certificate required
      </label>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Documents required (optional)</label>
        <div className="flex gap-2">
          <Input
            className="h-8"
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
              <Badge key={d} className="bg-muted text-foreground gap-1.5">
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
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to Purchase Order →"}
        </Button>
      </div>
    </form>
  );
}

// ── A08 — Purchase order (presented as the actual PO document) ──────────────

function DeltaBadge({ label, delta, unit }: { label: string; delta: number; unit?: string }) {
  if (delta === 0 || Number.isNaN(delta)) return null;
  const positive = delta > 0;
  return (
    <span className={"text-xs font-medium px-1.5 py-0.5 rounded " + (positive ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
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
  const total = valid ? qtyNum * priceNum : null;

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
      {error && <ErrorBanner message={error} />}

      {winner && (
        <SummaryBlock tone="neutral">
          <span className="font-medium text-foreground">{winner.supplier?.name}</span> quoted {winner.price} {winner.currency}
          {winner.quantityAvailable != null && ` · ${winner.quantityAvailable} available`}
          {winner.deliveryDate && ` · Delivery ${new Date(winner.deliveryDate).toLocaleDateString()}`}
          {winner.paymentTerms && ` · ${winner.paymentTerms}`}
        </SummaryBlock>
      )}

      <DocGrid>
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
            PO number <span className="text-red-500">*</span>
          </label>
          <Input className="h-8" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-2026-0142" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Item description (optional)</label>
          <Input className="h-8" value={poItem} onChange={(e) => setPoItem(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
            Quantity <span className="text-red-500">*</span>
          </label>
          <Input className="h-8" type="number" step="0.01" min="0.01" value={poQuantity} onChange={(e) => setPoQuantity(e.target.value)} placeholder="e.g. 50" />
          {qtyDelta !== 0 && <div className="mt-1"><DeltaBadge label="Qty" delta={qtyDelta} /></div>}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
            Price <span className="text-red-500">*</span>
          </label>
          <Input className="h-8" type="number" step="0.01" min="0" value={poPrice} onChange={(e) => setPoPrice(e.target.value)} placeholder="e.g. 620" />
          {priceDelta !== 0 && <div className="mt-1"><DeltaBadge label="Price" delta={priceDelta} /></div>}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Currency (optional)</label>
          <Input className="h-8" value={poCurrency} onChange={(e) => setPoCurrency(e.target.value)} placeholder="USD" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Delivery terms (optional)</label>
          <Input className="h-8" value={poDeliveryTerms} onChange={(e) => setPoDeliveryTerms(e.target.value)} placeholder="e.g. FOB, CIF, Ex-works" />
        </div>
      </DocGrid>

      {total !== null && (
        <div className="flex items-center justify-end border-t border-input pt-2">
          <p className="text-sm text-muted-foreground mr-2">Total</p>
          <p className="text-base font-semibold text-foreground">{total.toFixed(2)} {poCurrency || "USD"}</p>
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!valid || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release Purchase Order →"}
        </Button>
      </div>
    </form>
  );
}

function ApprovalLocked() {
  return (
    <SummaryBlock tone="warning">
      <span className="font-medium">Purchase order requires Management approval.</span> Only Management, Admin, or
      Super Admin roles can issue the purchase order for this sourcing order. Ask a Management or Admin user to
      complete this step, or return once your role has been elevated.
    </SummaryBlock>
  );
}

// ── PO document (once issued) ────────────────────────────────────────────────

function IssuedPurchaseOrder({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  const total = order.poQuantity != null && order.poPrice != null ? order.poQuantity * order.poPrice : null;
  const releaseLog = [...order.activityLogs].reverse().find((l) => l.activity === "A08");
  return (
    <div className="rounded-md border border-input bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-input pb-2">
        <div>
          <p className="text-xs text-muted-foreground">Purchase Order</p>
          <p className="text-base font-semibold text-foreground">{order.poNumber}</p>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700">Issued</Badge>
      </div>
      <DocGrid cols={3}>
        <DocField label="Supplier" value={winner?.supplier?.name} />
        <DocField label="Item" value={order.poItem} />
        <DocField label="Quantity" value={order.poQuantity} />
        <DocField label="Price" value={order.poPrice != null ? `${order.poPrice} ${order.poCurrency}` : null} />
        <DocField label="Delivery Terms" value={order.poDeliveryTerms} />
        <DocField label="Issued" value={order.poCreatedAt ? new Date(order.poCreatedAt).toLocaleDateString() : null} />
      </DocGrid>
      {total !== null && (
        <div className="flex items-center justify-end border-t border-input pt-2">
          <p className="text-sm text-muted-foreground mr-2">Total</p>
          <p className="text-base font-semibold text-foreground">{total.toFixed(2)} {order.poCurrency}</p>
        </div>
      )}
      {releaseLog && (
        <p className="text-xs text-muted-foreground">
          Released by {releaseLog.performedBy.firstName} {releaseLog.performedBy.lastName} on {new Date(releaseLog.createdAt).toLocaleString()}
        </p>
      )}
    </div>
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
    const order4: SteelSourcingOrder["stage"][] = ["A06_SUPPLIER_SELECTED", "A07_SPEC_CONFIRMED", "A08_PO_CREATED"];
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

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <ScreenHeader
        icon={FileCheck2}
        title="Purchase Order"
        subtitle="Confirm technical requirements from configuration, then release the purchase order document."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={allDone ? 4 : 3}
        activeIndex={allDone ? null : 3}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />

      <P02Layout
        info={
          <P02InfoCard
            alreadyProvided="Supplier, winning quote, price, and specification defaults, from Sourcing and Material Configuration."
            whatToEnter="Any missing specification notes, required documents, and the final PO number/quantity/price/terms."
            beforeYouContinue={["Quantity and price are correct.", "Required documents are identified."]}
          />
        }
      >
        <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
          <DocSection number="—" title="Purchase Order Reference" first>
            <OrderReferenceHeader order={order} />
          </DocSection>

          <DocSection number="07" title="Technical Requirements" status={a07Status}>
            {a07Status === "done" ? (
              <DocGrid cols={3}>
                <DocField label="Spec notes" value={order.specificationRequirementNotes} />
                <DocField label="Certificate required" value={order.certificateRequired ? "Yes" : "No"} />
                <DocField label="Documents required" value={order.documentsRequired.join(", ")} />
              </DocGrid>
            ) : a07Status === "active" ? (
              <SpecificationForm id={order.id} token={token} order={order} onDone={refresh} />
            ) : (
              <p className="text-sm text-muted-foreground">Confirm the technical requirements above to continue.</p>
            )}
            {a07Status === "done" && (
              <div className="mt-3">
                <AttachmentPanel sourcingId={order.id} stage="A07_SPEC_CONFIRMED" token={token} label="Technical Documents & Certificates" />
              </div>
            )}
          </DocSection>

          <DocSection number="08" title="Purchase Order Document" status={a08Status}>
            {a08Status === "done" ? (
              <IssuedPurchaseOrder order={order} />
            ) : a08Status === "active" ? (
              canIssuePO ? <PurchaseOrderForm id={order.id} token={token} winner={winner} onDone={refresh} /> : <ApprovalLocked />
            ) : (
              <p className="text-sm text-muted-foreground">Confirm the technical requirements above before releasing the PO.</p>
            )}
          </DocSection>

          {allDone && (
            <StickyActions>
              <Button onClick={refresh} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                Continue to Delivery & Handover <ArrowRight className="h-4 w-4" />
              </Button>
            </StickyActions>
          )}
        </div>
      </P02Layout>
    </div>
  );
}
