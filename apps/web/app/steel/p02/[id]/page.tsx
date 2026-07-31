"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { Role } from "@/types/role";
import {
  SteelSourcingService,
  SOURCING_STAGE_LABELS,
  SOURCING_STAGE_ORDER,
  SteelMaterialType,
  SupplierRiskLevel,
  QuotationItemPayload,
} from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Lock, Loader2, Plus, Trash2 } from "lucide-react";

const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

const MATERIAL_TYPES: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];
const RISK_LEVELS: SupplierRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-1">{label}</label>
      <select
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function StepCard({
  code, title, status, children,
}: { code: string; title: string; status: "done" | "active" | "locked"; children: React.ReactNode }) {
  return (
    <Card className={status === "locked" ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {status === "active" && <Circle className="h-4 w-4 text-blue-500 fill-blue-100" />}
          {status === "locked" && <Lock className="h-3.5 w-3.5 text-slate-400" />}
          <CardTitle className="text-sm">
            <span className="text-slate-400 font-mono text-xs mr-1.5">{code}</span>
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type StepProps = { id: string; token: string; onDone: () => void; onError: (e: unknown) => void };

// ── P02-A02 ──
function MaterialTypeForm({ id, token, onDone, onError }: StepProps) {
  const [materialType, setMaterialType] = useState<SteelMaterialType | "">("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.identifyMaterialType(id, { materialType: materialType as SteelMaterialType, materialTypeNotes: notes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <SelectField label="Material type" value={materialType} onChange={(v) => setMaterialType(v as SteelMaterialType)} options={MATERIAL_TYPES.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))} />
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!materialType || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm material type"}
      </Button>
    </div>
  );
}

// ── P02-A03 ──
function SupplierCheckForm({ id, token, onDone, onError }: StepProps) {
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => SteelSourcingService.getSuppliers(token) });
  const [supplierId, setSupplierId] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.checkSupplier(id, { supplierId, supplierApprovalConfirmed: confirmed, supplierCheckNotes: notes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <SelectField
        label="Supplier"
        value={supplierId}
        onChange={setSupplierId}
        options={(suppliers ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.approvalStatus})` }))}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Approved supplier list status confirmed
      </label>
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!supplierId || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm supplier"}
      </Button>
    </div>
  );
}

// ── P02-A04 ──
function SupplierRiskForm({ id, token, onDone, onError }: StepProps) {
  const [risk, setRisk] = useState<SupplierRiskLevel | "">("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [complaintNotes, setComplaintNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.reviewSupplierRisk(id, { supplierRiskLevel: risk as SupplierRiskLevel, rejectionRateNotes: rejectionNotes || undefined, complaintHistoryNotes: complaintNotes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <SelectField label="Supplier risk level" value={risk} onChange={(v) => setRisk(v as SupplierRiskLevel)} options={RISK_LEVELS.map((r) => ({ value: r, label: r }))} />
      <Input placeholder="Rejection rate notes (optional)" value={rejectionNotes} onChange={(e) => setRejectionNotes(e.target.value)} />
      <Input placeholder="Complaint history notes (optional)" value={complaintNotes} onChange={(e) => setComplaintNotes(e.target.value)} />
      <Button size="sm" disabled={!risk || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm risk review"}
      </Button>
    </div>
  );
}

// ── P02-A05 ──
function QuotationsForm({ id, token, onDone, onError }: StepProps) {
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => SteelSourcingService.getSuppliers(token) });
  const [rows, setRows] = useState<QuotationItemPayload[]>([{ supplierId: "", price: 0 }]);
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.collectQuotations(id, { quotations: rows.filter((r) => r.supplierId && r.price > 0) }, token),
    onSuccess: onDone, onError,
  });
  const update = (i: number, patch: Partial<QuotationItemPayload>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-center">
          <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={row.supplierId} onChange={(e) => update(i, { supplierId: e.target.value })}>
            <option value="">Supplier...</option>
            {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Input type="number" step="0.01" placeholder="Price" value={row.price || ""} onChange={(e) => update(i, { price: Number(e.target.value) })} />
          <Input placeholder="Qty avail." type="number" value={row.quantityAvailable ?? ""} onChange={(e) => update(i, { quantityAvailable: Number(e.target.value) })} />
          <button type="button" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setRows((prev) => [...prev, { supplierId: "", price: 0 }])}>
        <Plus className="h-3.5 w-3.5" /> Add quotation
      </Button>
      <div>
        <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save quotations"}
        </Button>
      </div>
    </div>
  );
}

// ── P02-A06 ──
function SelectSupplierForm({ id, token, onDone, onError, quotedSupplierIds, suppliersById }: StepProps & { quotedSupplierIds: string[]; suppliersById: Record<string, string> }) {
  const [selected, setSelected] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.selectSupplier(id, { selectedSupplierId: selected, qcdComparisonNotes: notes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <SelectField label="Selected supplier (QCD comparison)" value={selected} onChange={setSelected} options={quotedSupplierIds.map((sid) => ({ value: sid, label: suppliersById[sid] ?? sid }))} />
      <Input placeholder="QCD comparison notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={!selected || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm selection"}
      </Button>
    </div>
  );
}

// ── P02-A07 ──
function SpecForm({ id, token, onDone, onError }: StepProps) {
  const [notes, setNotes] = useState("");
  const [certRequired, setCertRequired] = useState(true);
  const [docs, setDocs] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.confirmSpecification(id, {
      specificationRequirementNotes: notes || undefined,
      certificateRequired: certRequired,
      documentsRequired: docs ? docs.split(",").map((d) => d.trim()) : undefined,
    }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <Input placeholder="Specification / grade / standard notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={certRequired} onChange={(e) => setCertRequired(e.target.checked)} />
        Test certificate required
      </label>
      <Input placeholder="Documents required (comma-separated)" value={docs} onChange={(e) => setDocs(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm specification"}
      </Button>
    </div>
  );
}

// ── P02-A08 ──
function PurchaseOrderForm({ id, token, onDone, onError }: StepProps) {
  const [poNumber, setPoNumber] = useState("");
  const [poItem, setPoItem] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.createPurchaseOrder(id, {
      poNumber, poItem: poItem || undefined, poQuantity: Number(qty), poPrice: Number(price), poDeliveryTerms: terms || undefined,
    }, token),
    onSuccess: onDone, onError,
  });
  const valid = poNumber.trim() && Number(qty) > 0 && Number(price) >= 0;
  return (
    <div className="space-y-3">
      <Input placeholder="PO number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
      <Input placeholder="Item description (optional)" value={poItem} onChange={(e) => setPoItem(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input type="number" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <Input placeholder="Delivery terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} />
      <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create purchase order"}
      </Button>
    </div>
  );
}

// ── P02-A09 ──
function DeliveryScheduleForm({ id, token, onDone, onError }: StepProps) {
  const [dispatch, setDispatch] = useState("");
  const [arrival, setArrival] = useState("");
  const [vehicle, setVehicle] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.confirmDeliverySchedule(id, {
      confirmedDispatchDate: dispatch || undefined, confirmedArrivalDate: arrival || undefined, vehicleContainerInfo: vehicle || undefined,
    }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-sm font-medium text-slate-700 block mb-1">Dispatch date</label><Input type="date" value={dispatch} onChange={(e) => setDispatch(e.target.value)} /></div>
        <div><label className="text-sm font-medium text-slate-700 block mb-1">Expected arrival</label><Input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} /></div>
      </div>
      <Input placeholder="Vehicle / container info" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm delivery schedule"}
      </Button>
    </div>
  );
}

// ── P02-A10 ──
function LogisticsForm({ id, token, onDone, onError }: StepProps) {
  const [bol, setBol] = useState("");
  const [origin, setOrigin] = useState("");
  const [clearance, setClearance] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.prepareLogistics(id, {
      billOfLading: bol || undefined, countryOfOrigin: origin || undefined, portClearanceStatus: clearance || undefined, importLogisticsNotes: notes || undefined,
    }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Only required for the Imported Billet Route — leave blank and submit to skip for local/domestic sourcing.</p>
      <Input placeholder="Bill of lading" value={bol} onChange={(e) => setBol(e.target.value)} />
      <Input placeholder="Country of origin" value={origin} onChange={(e) => setOrigin(e.target.value)} />
      <Input placeholder="Port clearance status" value={clearance} onChange={(e) => setClearance(e.target.value)} />
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm / skip logistics"}
      </Button>
    </div>
  );
}

// ── P02-A11 ──
function InformIntakeForm({ id, token, onDone, onError }: StepProps) {
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.informIntakeTeam(id, { intakeNotifyNotes: notes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <Input placeholder="Notes for gate / weighbridge / yard / quality teams (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inform intake team"}
      </Button>
    </div>
  );
}

// ── P02-A12 ──
function CloseHandoverForm({ id, token, onDone, onError }: StepProps) {
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => SteelSourcingService.closeHandover(id, { handoverNotes: notes || undefined }, token),
    onSuccess: onDone, onError,
  });
  return (
    <div className="space-y-3">
      <Input placeholder="Handover notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close sourcing handover"}
      </Button>
      <p className="text-xs text-slate-400">This closes the order and hands it to the intake process (P03).</p>
    </div>
  );
}

export default function SteelSourcingOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["steel-sourcing-order", params.id],
    queryFn: () => SteelSourcingService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", params.id] });
  const onError = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong", "error");

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentIdx = SOURCING_STAGE_ORDER.indexOf(order.stage);
  const statusFor = (activityNumber: number): "done" | "active" | "locked" => {
    const targetIdx = activityNumber - 1;
    if (currentIdx >= targetIdx) return "done";
    if (currentIdx === targetIdx - 1) return "active";
    return "locked";
  };
  const canIssuePO = user?.roleLevel && PO_ROLES.includes(user.roleLevel as Role);

  const quotedSupplierIds = [...new Set(order.quotations.map((q) => q.supplierId))];
  const suppliersById = Object.fromEntries(order.quotations.map((q) => [q.supplierId, `${q.supplier?.name} — ${q.price} ${q.currency}`]));

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Link href="/steel/p02" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to sourcing orders
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{order.sourcingNumber}</h1>
          <p className="text-sm text-slate-500">
            For plan {order.plan?.planNumber} · Created by {order.createdBy.firstName} {order.createdBy.lastName} on{" "}
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge>{SOURCING_STAGE_LABELS[order.stage]}</Badge>
      </div>

      <StepCard code="P02-A01" title="Requirement Reviewed" status="done">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Required by" value={order.requiredByDate ? new Date(order.requiredByDate).toLocaleDateString() : null} />
          <Field label="Requirement notes" value={order.materialRequirementNotes} />
        </div>
      </StepCard>

      <StepCard code="P02-A02" title="Identify Material Type Needed" status={statusFor(2)}>
        {statusFor(2) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material type" value={order.materialType?.replace(/_/g, " ")} />
            <Field label="Notes" value={order.materialTypeNotes} />
          </div>
        ) : statusFor(2) === "active" ? (
          <MaterialTypeForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A03" title="Check Approved Supplier List" status={statusFor(3)}>
        {statusFor(3) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" value={order.supplier?.name} />
            <Field label="Approval confirmed" value={order.supplierApprovalConfirmed ? "Yes" : "No"} />
            <Field label="Notes" value={order.supplierCheckNotes} />
          </div>
        ) : statusFor(3) === "active" ? (
          <SupplierCheckForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A04" title="Check Supplier Quality & Rejection History" status={statusFor(4)}>
        {statusFor(4) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk level" value={order.supplierRiskLevel} />
            <Field label="Rejection notes" value={order.rejectionRateNotes} />
            <Field label="Complaint history" value={order.complaintHistoryNotes} />
          </div>
        ) : statusFor(4) === "active" ? (
          <SupplierRiskForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A05" title="Collect Price & Availability Confirmation" status={statusFor(5)}>
        {statusFor(5) === "done" ? (
          <div className="space-y-1.5">
            {order.quotations.map((q) => (
              <div key={q.id} className="text-sm flex justify-between border-b border-slate-100 py-1 last:border-0">
                <span>{q.supplier?.name}</span>
                <span className="text-slate-500">{q.price} {q.currency}{q.quantityAvailable ? ` · ${q.quantityAvailable} avail.` : ""}</span>
              </div>
            ))}
          </div>
        ) : statusFor(5) === "active" ? (
          <QuotationsForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A06" title="Compare Supplier Options Using QCD Logic" status={statusFor(6)}>
        {statusFor(6) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Selected supplier" value={order.quotations.find((q) => q.supplierId === order.selectedSupplierId)?.supplier?.name} />
            <Field label="QCD notes" value={order.qcdComparisonNotes} />
          </div>
        ) : statusFor(6) === "active" ? (
          <SelectSupplierForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} quotedSupplierIds={quotedSupplierIds} suppliersById={suppliersById} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A07" title="Confirm Technical Specification & Documents Required" status={statusFor(7)}>
        {statusFor(7) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spec notes" value={order.specificationRequirementNotes} />
            <Field label="Certificate required" value={order.certificateRequired ? "Yes" : "No"} />
            <Field label="Documents required" value={order.documentsRequired.join(", ")} />
          </div>
        ) : statusFor(7) === "active" ? (
          <SpecForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A08" title="Create Purchase Order" status={statusFor(8)}>
        {statusFor(8) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="PO number" value={order.poNumber} />
            <Field label="Quantity" value={order.poQuantity} />
            <Field label="Price" value={order.poPrice ? `${order.poPrice} ${order.poCurrency}` : null} />
            <Field label="Delivery terms" value={order.poDeliveryTerms} />
          </div>
        ) : statusFor(8) === "active" ? (
          canIssuePO ? <PurchaseOrderForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
            : <p className="text-sm text-slate-400">Only Management/Admin roles can create the purchase order.</p>
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A09" title="Confirm Delivery Schedule With Supplier" status={statusFor(9)}>
        {statusFor(9) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dispatch date" value={order.confirmedDispatchDate ? new Date(order.confirmedDispatchDate).toLocaleDateString() : null} />
            <Field label="Expected arrival" value={order.confirmedArrivalDate ? new Date(order.confirmedArrivalDate).toLocaleDateString() : null} />
            <Field label="Vehicle / container" value={order.vehicleContainerInfo} />
          </div>
        ) : statusFor(9) === "active" ? (
          <DeliveryScheduleForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A10" title="Prepare Import / Local Logistics (If Applicable)" status={statusFor(10)}>
        {statusFor(10) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill of lading" value={order.billOfLading} />
            <Field label="Country of origin" value={order.countryOfOrigin} />
            <Field label="Port clearance" value={order.portClearanceStatus} />
          </div>
        ) : statusFor(10) === "active" ? (
          <LogisticsForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A11" title="Inform Raw Material Intake Team" status={statusFor(11)}>
        {statusFor(11) === "done" ? (
          <Field label="Informed at" value={order.intakeInformedAt ? new Date(order.intakeInformedAt).toLocaleString() : null} />
        ) : statusFor(11) === "active" ? (
          <InformIntakeForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>

      <StepCard code="P02-A12" title="Close Sourcing Handover to Intake" status={statusFor(12)}>
        {statusFor(12) === "done" ? (
          <Field label="Closed at" value={order.handoverClosedAt ? new Date(order.handoverClosedAt).toLocaleString() : null} />
        ) : statusFor(12) === "active" ? (
          canIssuePO ? <CloseHandoverForm id={order.id} token={accessToken!} onDone={refresh} onError={onError} />
            : <p className="text-sm text-slate-400">Only Management/Admin roles can close the handover.</p>
        ) : <p className="text-sm text-slate-400">Complete the previous step first.</p>}
      </StepCard>
    </div>
  );
}