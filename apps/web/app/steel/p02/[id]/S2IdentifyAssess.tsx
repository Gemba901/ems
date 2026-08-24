"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  SteelMaterialType,
  SteelSourcingMaterialSource,
  SupplierRiskLevel,
  Supplier,
  SupplierApprovalStatus,
  IdentifyMaterialTypePayload,
  SelectMaterialSourcePayload,
  ReviewSupplierRiskPayload,
} from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { ScreenSidebar } from "@/components/steel/p02/ScreenSidebar";
import { SubStepCard, Field } from "@/components/steel/p02/shared";
import {
  Loader2,
  Recycle,
  Layers,
  Box,
  FlaskConical,
  Flame,
  ShieldCheck,
  PackageOpen,
  MoreHorizontal,
  Check,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  Gauge,
  ArrowRight,
  Users,
  Warehouse,
  Truck,
} from "lucide-react";

const MATERIAL_TYPES: { value: SteelMaterialType; label: string; icon: typeof Box }[] = [
  { value: "SCRAP", label: "Scrap", icon: Recycle },
  { value: "DRI", label: "DRI", icon: Layers },
  { value: "BILLET", label: "Billet", icon: Box },
  { value: "ALLOY", label: "Alloy", icon: FlaskConical },
  { value: "ADDITIVE", label: "Additive", icon: FlaskConical },
  { value: "FUEL", label: "Fuel", icon: Flame },
  { value: "REFRACTORY", label: "Refractory", icon: ShieldCheck },
  { value: "PACKING_MATERIAL", label: "Packing Material", icon: PackageOpen },
  { value: "OTHER", label: "Other", icon: MoreHorizontal },
];

const RISK_LEVELS: { value: SupplierRiskLevel; label: string; description: string }[] = [
  { value: "LOW", label: "Low", description: "Consistent quality, minimal rejections or complaints." },
  { value: "MEDIUM", label: "Medium", description: "Occasional issues — monitor delivery and quality." },
  { value: "HIGH", label: "High", description: "History of rejections or complaints — proceed with caution." },
];

const APPROVAL_STYLES: Record<SupplierApprovalStatus, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-orange-50 text-orange-700",
  BLACKLISTED: "bg-red-50 text-red-700",
};

// ── Persistent context (top of screen) ───────────────────────────────────────

function ContextSummary({ order }: { order: SteelSourcingOrder }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Order Context</CardTitle>
        <p className="text-sm text-slate-500">From S1 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 text-sm">
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
            <p className="text-xs text-slate-400">Required By</p>
            <p className="font-medium text-slate-800">
              {order.requiredByDate ? new Date(order.requiredByDate).toLocaleDateString() : "—"}
            </p>
          </div>
          {order.materialRequirementNotes && (
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-slate-400">Requirement Notes</p>
              <p className="font-medium text-slate-800 truncate">{order.materialRequirementNotes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ order, subStep }: { order: SteelSourcingOrder; subStep: "A02" | "A03" | "A04" | "done" }) {
  const isStock = order.materialSource === "EXISTING_STOCK";
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
            S2 covers P02-A02 (classify the material type), P02-A03 (select material source — existing stock or an
            external supplier), and — for external supplier only — P02-A04 (review supplier risk).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selections So Far</CardTitle>
        </CardHeader>
        <CardContent>
          {order.materialType || order.materialSource ? (
            <dl className="text-xs space-y-2">
              {order.materialType && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Material Type</dt>
                  <dd className="text-slate-700 font-medium text-right">{order.materialType.replace(/_/g, " ")}</dd>
                </div>
              )}
              {order.materialSource && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Source</dt>
                  <dd className="text-slate-700 font-medium text-right">{isStock ? "Existing Stock" : "External Supplier"}</dd>
                </div>
              )}
              {!isStock && order.supplier && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Supplier</dt>
                  <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">{order.supplier.name}</dd>
                </div>
              )}
              {!isStock && order.supplierRiskLevel && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Risk Level</dt>
                  <dd className="text-slate-700 font-medium text-right">{order.supplierRiskLevel}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Selections will appear here as you complete each sub-step.</p>
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
            {subStep === "done"
              ? isStock
                ? "Supplier and purchasing steps are skipped. This order continues through delivery/logistics scheduling and handover to intake."
                : "Once you continue, this order moves to S3 — Quote Comparison & Selection."
              : "Choose a material source at P02-A03 — Existing Stock skips supplier and purchasing steps entirely; External Supplier continues through supplier risk, quotes, and PO."}
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
            <li>Existing Stock: material already held by the company, fulfilled without an external purchase order.</li>
            <li>Only suppliers with an APPROVED status can be confirmed as approved here.</li>
            <li>A high risk rating doesn&apos;t block progress, but is worth flagging for later steps.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A02 — Material type ──────────────────────────────────────────────────────

function MaterialTypeForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [materialType, setMaterialType] = useState<SteelMaterialType | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: IdentifyMaterialTypePayload) => SteelSourcingService.identifyMaterialType(id, payload, token),
    onSuccess: () => {
      toast("Material type identified — continue to the supplier check.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!materialType) {
      setError("Please select a material type.");
      return;
    }
    mutation.mutate({ materialType, materialTypeNotes: notes || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MATERIAL_TYPES.map((m) => {
          const Icon = m.icon;
          const selected = m.value === materialType;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMaterialType(m.value)}
              aria-pressed={selected}
              className={
                "relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (selected
                  ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
              }
            >
              {selected && (
                <div className="absolute top-2 right-2 h-4.5 w-4.5 rounded-full bg-blue-600 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              <div
                className={
                  "h-8 w-8 rounded-lg flex items-center justify-center " +
                  (selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
                }
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-slate-900">{m.label}</p>
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the material type" />
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!materialType || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Material Type →"}
        </Button>
      </div>
    </form>
  );
}

// ── A03 — Select material source ─────────────────────────────────────────────

function SourceChoiceCards({ onChoose }: { onChoose: (source: SteelSourcingMaterialSource) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
        <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
          <Warehouse className="h-4.5 w-4.5 text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Existing Stock</p>
          <p className="text-xs text-slate-500 mt-1">Material is already available in company stock.</p>
          <p className="text-xs text-slate-400 mt-1">No supplier or PO required.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onChoose("EXISTING_STOCK")}>
          Use Existing Stock
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
          <Truck className="h-4.5 w-4.5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">External Supplier</p>
          <p className="text-xs text-slate-500 mt-1">Material must be purchased from an approved supplier.</p>
          <p className="text-xs text-slate-400 mt-1">Supplier assessment applies.</p>
        </div>
        <Button size="sm" onClick={() => onChoose("EXTERNAL_SUPPLIER")}>
          Select Supplier
        </Button>
      </div>
    </div>
  );
}

function ExistingStockForm({ id, token, onDone, onBack }: { id: string; token: string; onDone: () => void; onBack: () => void }) {
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
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm px-3 py-2 flex items-start gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Supplier assessment, quote comparison, supplier selection, and purchase order creation will be skipped —
          this requirement moves straight to delivery/logistics scheduling and handover.
        </span>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the stock fulfillment" />
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600">
          ← Change source
        </button>
        <Button
          onClick={() => mutation.mutate({ source: "EXISTING_STOCK", stockFulfillmentNotes: notes || undefined })}
          disabled={mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use Existing Stock →"}
        </Button>
      </div>
    </div>
  );
}

function SupplierPicker({
  suppliers, selectedId, onSelect,
}: { suppliers: Supplier[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {suppliers.map((s) => {
        const selected = s.id === selectedId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-pressed={selected}
            className={
              "relative flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
              (selected
                ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
            }
          >
            {selected && (
              <div className="absolute top-2 right-2 h-4.5 w-4.5 rounded-full bg-blue-600 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            <div className="flex items-center justify-between w-full pr-6">
              <p className="text-sm font-semibold text-slate-900">{s.name}</p>
            </div>
            <Badge className={APPROVAL_STYLES[s.approvalStatus]}>{s.approvalStatus}</Badge>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-1">
              {s.country && <span>{s.country}</span>}
              {s.materialTypes.length > 0 && <span>{s.materialTypes.join(", ").replace(/_/g, " ")}</span>}
              {s.rejectionCount > 0 && <span>{s.rejectionCount} rejection(s)</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SupplierCheckForm({ id, token, onDone, onBack }: { id: string; token: string; onDone: () => void; onBack: () => void }) {
  const { toast } = useToast();
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => SteelSourcingService.getSuppliers(token),
    enabled: !!token,
  });
  const [supplierId, setSupplierId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suppliers = suppliersQuery.data ?? [];
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const isApproved = selectedSupplier?.approvalStatus === "APPROVED";

  const handleSelect = (sid: string) => {
    setSupplierId(sid);
    const supplier = suppliers.find((s) => s.id === sid);
    // Backend rejects supplierApprovalConfirmed=true unless the supplier's
    // real approvalStatus is APPROVED — default the checkbox accordingly so
    // the UI never claims approval the backend won't accept.
    setConfirmed(supplier?.approvalStatus === "APPROVED");
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
      supplierApprovalConfirmed: confirmed,
      supplierCheckNotes: notes || undefined,
    });
  };

  if (suppliersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (suppliersQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-slate-600">Suppliers could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={() => suppliersQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Users className="h-5 w-5 text-slate-300" />
        <p className="text-sm text-slate-600">No suppliers found yet.</p>
        <p className="text-xs text-slate-400">Add a supplier to the master list before checking one here.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <SupplierPicker suppliers={suppliers} selectedId={supplierId} onSelect={handleSelect} />

      {selectedSupplier && !isApproved && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {selectedSupplier.name} is not on the approved list (status: {selectedSupplier.approvalStatus}). You can
            still proceed with this supplier, but approval cannot be confirmed until its status is APPROVED.
          </span>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!selectedSupplier || !isApproved}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Approved supplier list status confirmed
      </label>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the supplier check" />
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600">
          ← Change source
        </button>
        <Button type="submit" disabled={!supplierId || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Supplier →"}
        </Button>
      </div>
    </form>
  );
}

// ── A03 dispatcher — source choice, then the matching path's form ────────────

function MaterialSourceForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const [chosen, setChosen] = useState<SteelSourcingMaterialSource | null>(null);

  if (chosen === "EXISTING_STOCK") {
    return <ExistingStockForm id={id} token={token} onDone={onDone} onBack={() => setChosen(null)} />;
  }
  if (chosen === "EXTERNAL_SUPPLIER") {
    return <SupplierCheckForm id={id} token={token} onDone={onDone} onBack={() => setChosen(null)} />;
  }
  return <SourceChoiceCards onChoose={setChosen} />;
}

// ── A04 — Supplier risk ──────────────────────────────────────────────────────

function SupplierRiskForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {RISK_LEVELS.map((r) => {
          const selected = r.value === risk;
          const isHigh = r.value === "HIGH";
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRisk(r.value)}
              aria-pressed={selected}
              className={
                "relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (selected
                  ? isHigh
                    ? "border-red-300 bg-red-50 ring-1 ring-red-200"
                    : "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
              }
            >
              {selected && (
                <div
                  className={
                    "absolute top-2 right-2 h-4.5 w-4.5 rounded-full flex items-center justify-center " +
                    (isHigh ? "bg-red-600" : "bg-blue-600")
                  }
                >
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              <div
                className={
                  "h-8 w-8 rounded-lg flex items-center justify-center " +
                  (selected ? (isHigh ? "bg-red-600 text-white" : "bg-blue-600 text-white") : "bg-slate-100 text-slate-500")
                }
              >
                {isHigh ? <ShieldAlert className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                <p className="text-xs text-slate-500 leading-snug">{r.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {risk === "HIGH" && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This supplier is being marked as HIGH risk. This does not block progress, but review it carefully before
            proceeding to quote collection.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Rejection rate notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={rejectionRateNotes} onChange={(e) => setRejectionRateNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Complaint history notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={complaintHistoryNotes} onChange={(e) => setComplaintHistoryNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!risk || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Risk Review →"}
        </Button>
      </div>
    </form>
  );
}

// ── S2 completion ─────────────────────────────────────────────────────────────

function S2CompleteCard({ order, onContinue }: { order: SteelSourcingOrder; onContinue: () => void }) {
  const isStock = order.materialSource === "EXISTING_STOCK";
  return (
    <SubStepCard code="S2" title="Identify & Assess Complete" status="done">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Material Type" value={order.materialType?.replace(/_/g, " ")} />
          <Field label="Source" value={isStock ? "Existing Stock" : "External Supplier"} />
          {isStock ? (
            <Field label="Notes" value={order.stockFulfillmentNotes} />
          ) : (
            <Field label="Supplier" value={order.supplier?.name} />
          )}
        </div>
        {isStock ? (
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
            Supplier assessment, quote comparison, and PO creation were skipped. Next:{" "}
            <span className="font-medium text-slate-700">Delivery/logistics scheduling &amp; handover to intake</span>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
            Next: <span className="font-medium text-slate-700">S3 — Quote Comparison &amp; Selection</span>
          </div>
        )}
        <Button onClick={onContinue} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {isStock ? "Continue" : "Continue to S3 — Quote Comparison"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </SubStepCard>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S2IdentifyAssess({
  order, token, onRefresh,
}: { order: SteelSourcingOrder; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    onRefresh();
  };

  const isStock = order.materialSource === "EXISTING_STOCK";

  // Local ordering restricted to S2's own activities — the real sequencing/
  // gating is still enforced server-side. For the Existing Stock path, the
  // server jumps the order's stage straight to A08_PO_CREATED (skipping
  // A04-A08, which don't apply without a supplier) — that stage isn't in
  // this S2-local list, so it's treated as "beyond A04" rather than looked
  // up by index.
  const order12: SteelSourcingOrder["stage"][] = [
    "A01_REQUIREMENT_REVIEWED",
    "A02_MATERIAL_TYPE_IDENTIFIED",
    "A03_SUPPLIER_CHECKED",
    "A04_SUPPLIER_RISK_REVIEWED",
  ];
  const rawIdx = order12.indexOf(order.stage);
  const effectiveIdx = rawIdx === -1 ? order12.length : rawIdx;

  const statusFor = (stage: SteelSourcingOrder["stage"]): "done" | "active" | "locked" => {
    const targetIdx = order12.indexOf(stage);
    if (effectiveIdx >= targetIdx) return "done";
    if (effectiveIdx === targetIdx - 1) return "active";
    return "locked";
  };

  const a02Status = statusFor("A02_MATERIAL_TYPE_IDENTIFIED");
  const a03Status = statusFor("A03_SUPPLIER_CHECKED");
  const a04Status = statusFor("A04_SUPPLIER_RISK_REVIEWED");
  const allDone = isStock ? a03Status === "done" : order.stage === "A04_SUPPLIER_RISK_REVIEWED";

  const subStep: "A02" | "A03" | "A04" | "done" = allDone
    ? "done"
    : a02Status === "active"
      ? "A02"
      : a03Status === "active"
        ? "A03"
        : "A04";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={ShieldCheck}
        title="Identify & Assess Supplier"
        subtitle="Classify the material type, check the supplier against the approved list, and review supplier risk."
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
      <ContextSummary order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <SubStepCard code="P02-A02" title="Identify Material Type Needed" status={a02Status}>
            {a02Status === "done" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Material type" value={order.materialType?.replace(/_/g, " ")} />
                <Field label="Notes" value={order.materialTypeNotes} />
              </div>
            ) : a02Status === "active" ? (
              <MaterialTypeForm id={order.id} token={token} onDone={refresh} />
            ) : (
              <p className="text-sm text-slate-400">Complete the previous step first.</p>
            )}
          </SubStepCard>

          <SubStepCard code="P02-A03" title="Select Material Source" status={a03Status}>
            {a03Status === "done" ? (
              isStock ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source" value="Existing Stock" />
                  <Field label="Notes" value={order.stockFulfillmentNotes} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source" value="External Supplier" />
                  <Field label="Supplier" value={order.supplier?.name} />
                  <Field
                    label="Approval status"
                    value={order.supplier ? <Badge className={APPROVAL_STYLES[order.supplier.approvalStatus]}>{order.supplier.approvalStatus}</Badge> : null}
                  />
                  <Field label="Approval confirmed" value={order.supplierApprovalConfirmed ? "Yes" : "No"} />
                  <Field label="Notes" value={order.supplierCheckNotes} />
                </div>
              )
            ) : a03Status === "active" ? (
              <MaterialSourceForm id={order.id} token={token} onDone={refresh} />
            ) : (
              <p className="text-sm text-slate-400">Complete the previous step first.</p>
            )}
          </SubStepCard>

          {!isStock && (
            <SubStepCard code="P02-A04" title="Check Supplier Quality & Rejection History" status={a04Status}>
              {a04Status === "done" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Risk level" value={order.supplierRiskLevel} />
                  <Field label="Rejection notes" value={order.rejectionRateNotes} />
                  <Field label="Complaint history" value={order.complaintHistoryNotes} />
                </div>
              ) : a04Status === "active" ? (
                <SupplierRiskForm id={order.id} token={token} onDone={refresh} />
              ) : (
                <p className="text-sm text-slate-400">Complete the previous step first.</p>
              )}
            </SubStepCard>
          )}

          {allDone && <S2CompleteCard order={order} onContinue={refresh} />}
        </div>
        <Sidebar order={order} subStep={subStep} />
      </div>
    </div>
  );
}
