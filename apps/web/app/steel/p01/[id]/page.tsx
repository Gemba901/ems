"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { Role } from "@/types/role";
import {
  SteelService,
  SteelProductionPlan,
  STAGE_LABELS,
  STAGE_ORDER,
  OrderPriority,
  CreditStatus,
  ProductType,
  StockDecision,
  PlantRoute,
  AvailabilityStatus,
  SteelDepartment,
  SteelProductionSequenceItem,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Lock, Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { S2ProductSpecification } from "./S2ProductSpecification";
import { S3StockFulfilment } from "./S3StockFulfilment";
import { S4FeasibilityRoute } from "./S4FeasibilityRoute";
import { S5PlanPreparation } from "./S5PlanPreparation";
import { S6PlanRelease } from "./S6PlanRelease";

const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

const ALL_DEPARTMENTS: SteelDepartment[] = [
  "PROCUREMENT", "YARD", "FURNACE", "CCM", "ROLLING", "QUALITY", "MAINTENANCE", "STORES", "DISPATCH",
];

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

// ── Step shell ────────────────────────────────────────────────────────────────

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

export default function SteelPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken, user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Tracks whether the user has acknowledged S3's completion card (shown
  // right after the A06 decision) so "Continue to S4" can hand off to the
  // existing flat page without needing a fake client-side stage — the
  // server stage (A06_STOCK_DECISION_MADE) doesn't change at that point.
  const [s3Acknowledged, setS3Acknowledged] = useState(false);
  // Same pattern for S4's completion card (shown after A09).
  const [s4Acknowledged, setS4Acknowledged] = useState(false);

  const { data: plan, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["steel-plan", params.id],
    queryFn: () => SteelService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-plan", params.id] });
  const onError = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong", "error");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !plan) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">
          {error instanceof Error ? error.message : "This production plan could not be loaded."}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
          </Button>
          <Link href="/steel/p01">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Production Plans
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // S2 (P01-A03/A04) is a dedicated screen — intercept here while the plan
  // is in that range so it's not also shown inline in the flat waterfall
  // below. Server stage remains authoritative; once A04 completes, this
  // branch stops matching and the existing flat page (S3-S6, unmodified)
  // takes over as before.
  if (plan.stage === "A02_PRIORITY_CONFIRMED" || plan.stage === "A03_PRODUCT_CONFIRMED") {
    return <S2ProductSpecification plan={plan} token={accessToken!} onRefresh={refresh} />;
  }

  // S3 (P01-A05/A06) is a dedicated screen — same interception pattern as
  // S2. A06_STOCK_DECISION_MADE is included so the completion card renders
  // once (whether just decided or resumed after a refresh); "Continue to S4"
  // acknowledges it locally so the existing flat page (S4-S6, unmodified)
  // takes over without inventing a new server stage.
  if (
    plan.stage === "A04_SPEC_CONFIRMED" ||
    plan.stage === "A05_STOCK_CHECKED" ||
    (plan.stage === "A06_STOCK_DECISION_MADE" && !s3Acknowledged)
  ) {
    return (
      <S3StockFulfilment
        plan={plan}
        token={accessToken!}
        onRefresh={() => {
          if (plan.stage === "A06_STOCK_DECISION_MADE") setS3Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S4 (P01-A07/A08/A09) — same interception + acknowledgement pattern as
  // S3. A09_CAPACITY_CHECKED is included so the completion card renders
  // once; "Continue to S5" acknowledges it locally so the existing flat
  // page (S5-S6, unmodified) takes over without inventing a server stage.
  if (
    plan.stage === "A06_STOCK_DECISION_MADE" ||
    plan.stage === "A07_ROUTE_SELECTED" ||
    plan.stage === "A08_MATERIAL_CHECKED" ||
    (plan.stage === "A09_CAPACITY_CHECKED" && !s4Acknowledged)
  ) {
    return (
      <S4FeasibilityRoute
        plan={plan}
        token={accessToken!}
        onRefresh={() => {
          if (plan.stage === "A09_CAPACITY_CHECKED") setS4Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S5 (P01-A10/A11) — covers drafting the production plan and initiating
  // department communication. Once communicate succeeds, plan.stage becomes
  // A11_PLAN_COMMUNICATED, this branch stops matching, and S6 (below) takes
  // over — S6 owns acknowledgement tracking and the release gate, so there's
  // no need for a client-side "leave" flag here.
  if (plan.stage === "A09_CAPACITY_CHECKED" || plan.stage === "A10_PLAN_DRAFTED") {
    return <S5PlanPreparation plan={plan} token={accessToken!} onRefresh={refresh} onContinue={refresh} />;
  }

  // S6 (P01-A12) — department acknowledgement tracking and final release
  // approval, plus the released/success state (with "Continue to P02").
  if (plan.stage === "A11_PLAN_COMMUNICATED" || plan.stage === "A12_PLAN_RELEASED") {
    return <S6PlanRelease plan={plan} token={accessToken!} onRefresh={refresh} />;
  }

  const currentIdx = STAGE_ORDER.indexOf(plan.stage);
  const statusFor = (activityNumber: number): "done" | "active" | "locked" => {
    const targetIdx = activityNumber - 1;
    if (currentIdx >= targetIdx) return "done";
    if (currentIdx === targetIdx - 1) return "active";
    return "locked";
  };

  const canRelease = user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Link href="/steel/p01" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to plans
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{plan.planNumber}</h1>
          <p className="text-sm text-slate-500">
            Created by {plan.createdBy.firstName} {plan.createdBy.lastName} on{" "}
            {new Date(plan.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge>{STAGE_LABELS[plan.stage]}</Badge>
      </div>

      {/* P01-A01 — Demand (always complete, read-only) */}
      <StepCard code="P01-A01" title="Demand Captured" status="done">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Demand source" value={plan.demandSource.replace(/_/g, " ")} />
          <Field label="Customer" value={plan.customerName} />
          <Field label="Dealer" value={plan.dealerName} />
          <Field label="Project reference" value={plan.projectReference} />
          <Field label="Sales order #" value={plan.salesOrderNumber} />
          <Field label="Expected delivery" value={plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : null} />
          <Field label="Requested quantity" value={`${plan.requestedQuantityTonnes} t`} />
          <Field label="Notes" value={plan.demandNotes} />
        </div>
      </StepCard>

      {/* P01-A02 — Priority */}
      <StepCard code="P01-A02" title="Confirm Customer & Order Priority" status={statusFor(2)}>
        {statusFor(2) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" value={plan.priority?.replace(/_/g, " ")} />
            <Field label="Credit status" value={plan.creditStatus} />
            <Field label="Delivery promise" value={plan.deliveryPromiseDate ? new Date(plan.deliveryPromiseDate).toLocaleDateString() : null} />
          </div>
        ) : statusFor(2) === "active" ? (
          <PriorityForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A03 — Product */}
      <StepCard code="P01-A03" title="Confirm Product Type & Standard" status={statusFor(3)}>
        {statusFor(3) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product type" value={plan.productType?.replace(/_/g, " ")} />
            <Field label="Standard" value={plan.productStandard} />
            <Field label="Customer spec" value={plan.customerSpecification} />
          </div>
        ) : statusFor(3) === "active" ? (
          <ProductForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A04 — Specification */}
      <StepCard code="P01-A04" title="Confirm Grade, Size, Length, Bundle & Quantity" status={statusFor(4)}>
        {statusFor(4) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grade" value={plan.grade} />
            <Field label="Size" value={plan.size} />
            <Field label="Length" value={plan.length} />
            <Field label="Bundle type" value={plan.bundleType} />
            <Field label="Total quantity" value={plan.totalQuantity ? `${plan.totalQuantity} t` : null} />
            <Field label="Tolerance notes" value={plan.toleranceNotes} />
          </div>
        ) : statusFor(4) === "active" ? (
          <SpecificationForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A05 — Stock check */}
      <StepCard code="P01-A05" title="Check Certified Finished Goods Stock" status={statusFor(5)}>
        {statusFor(5) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Certified stock available" value={plan.certifiedStockAvailableQty !== null ? `${plan.certifiedStockAvailableQty} t` : null} />
            <Field label="Bundle IDs" value={plan.stockBundleIds.join(", ")} />
            <Field label="Heat numbers" value={plan.stockHeatNumbers.join(", ")} />
            <Field label="Certificate refs" value={plan.stockCertificateRefs.join(", ")} />
          </div>
        ) : statusFor(5) === "active" ? (
          <StockCheckForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A06 — Stock decision */}
      <StepCard code="P01-A06" title="Decide Dispatch From Stock or Production Required" status={statusFor(6)}>
        {statusFor(6) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Decision" value={plan.stockDecision?.replace(/_/g, " ")} />
            <Field label="Notes" value={plan.stockDecisionNotes} />
          </div>
        ) : statusFor(6) === "active" ? (
          <StockDecisionForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A07 — Route */}
      <StepCard code="P01-A07" title="Select Applicable Plant Route" status={statusFor(7)}>
        {statusFor(7) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Route" value={plan.plantRoute?.replace(/_/g, " ")} />
            <Field label="Notes" value={plan.routeNotes} />
          </div>
        ) : statusFor(7) === "active" ? (
          <RouteForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A08 — Material check */}
      <StepCard code="P01-A08" title="Check Raw Material / Billet Availability" status={statusFor(8)}>
        {statusFor(8) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material availability" value={plan.materialAvailability?.replace(/_/g, " ")} />
            <Field label="Shortage notes" value={plan.materialShortageNotes} />
            <Field label="Purchase requirement" value={plan.purchaseRequirementNotes} />
          </div>
        ) : statusFor(8) === "active" ? (
          <MaterialCheckForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A09 — Capacity check */}
      <StepCard code="P01-A09" title="Check Equipment, Maintenance & Manpower Availability" status={statusFor(9)}>
        {statusFor(9) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Equipment availability" value={plan.equipmentAvailability?.replace(/_/g, " ")} />
            <Field label="Manpower availability" value={plan.manpowerAvailability?.replace(/_/g, " ")} />
            <Field label="Maintenance notes" value={plan.maintenanceShutdownNotes} />
            <Field label="Shift plan notes" value={plan.shiftPlanNotes} />
          </div>
        ) : statusFor(9) === "active" ? (
          <CapacityCheckForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A10 — Production plan */}
      <StepCard code="P01-A10" title="Prepare Production Plan & Sequence" status={statusFor(10)}>
        {statusFor(10) === "done" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned start" value={plan.plannedStartDate ? new Date(plan.plannedStartDate).toLocaleDateString() : null} />
              <Field label="Planned end" value={plan.plannedEndDate ? new Date(plan.plannedEndDate).toLocaleDateString() : null} />
              <Field label="Notes" value={plan.planNotes} />
            </div>
            {plan.productionSequence && plan.productionSequence.length > 0 && (
              <div className="border border-slate-100 rounded-lg overflow-hidden">
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
          </div>
        ) : statusFor(10) === "active" ? (
          <ProductionPlanForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>

      {/* P01-A11 — Communicate */}
      <StepCard code="P01-A11" title="Communicate Plan to All Concerned Departments" status={statusFor(11)}>
        {statusFor(11) === "locked" ? (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        ) : !plan.planCommunicatedAt ? (
          <CommunicateForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              Communicated on {new Date(plan.planCommunicatedAt).toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {plan.departmentAcks.map((ack) => (
                <DepartmentAckRow
                  key={ack.id}
                  planId={plan.id}
                  ack={ack}
                  token={accessToken!}
                  onDone={refresh}
                  onError={onError}
                />
              ))}
            </div>
          </div>
        )}
      </StepCard>

      {/* P01-A12 — Release */}
      <StepCard code="P01-A12" title="Release Approved Production Plan" status={statusFor(12)}>
        {statusFor(12) === "done" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Approved by" value={plan.approvedBy ? `${plan.approvedBy.firstName} ${plan.approvedBy.lastName}` : null} />
            <Field label="Approved at" value={plan.approvedAt ? new Date(plan.approvedAt).toLocaleString() : null} />
            <Field label="Release notes" value={plan.releaseNotes} />
          </div>
        ) : statusFor(12) === "active" ? (
          canRelease ? (
            <ReleaseForm planId={plan.id} token={accessToken!} onDone={refresh} onError={onError} />
          ) : (
            <p className="text-sm text-slate-400">Only Management, Admin, or Super Admin can release this plan.</p>
          )
        ) : (
          <p className="text-sm text-slate-400">Complete the previous step first.</p>
        )}
      </StepCard>
    </div>
  );
}

// ── A02 ───────────────────────────────────────────────────────────────────────

function PriorityForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [priority, setPriority] = useState<OrderPriority | "">("");
  const [creditStatus, setCreditStatus] = useState<CreditStatus | "">("");
  const [deliveryPromiseDate, setDeliveryPromiseDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!priority) return onError(new Error("Please select a priority"));
    setSaving(true);
    try {
      await SteelService.confirmPriority(planId, {
        priority,
        creditStatus: creditStatus || undefined,
        deliveryPromiseDate: deliveryPromiseDate || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Priority" value={priority} onChange={(v) => setPriority(v as OrderPriority)}
          options={[
            { value: "NORMAL", label: "Normal" },
            { value: "URGENT", label: "Urgent" },
            { value: "EXPORT", label: "Export" },
            { value: "PROJECT", label: "Project" },
            { value: "STOCK_REPLENISHMENT", label: "Stock Replenishment" },
          ]}
        />
        <SelectField
          label="Credit status" value={creditStatus} onChange={(v) => setCreditStatus(v as CreditStatus)}
          options={[
            { value: "APPROVED", label: "Approved" },
            { value: "ON_HOLD", label: "On Hold" },
            { value: "PENDING", label: "Pending" },
          ]}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Delivery promise date</label>
        <Input type="date" value={deliveryPromiseDate} onChange={(e) => setDeliveryPromiseDate(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Priority"}
      </Button>
    </div>
  );
}

// ── A03 ───────────────────────────────────────────────────────────────────────

function ProductForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [productType, setProductType] = useState<ProductType | "">("");
  const [productStandard, setProductStandard] = useState("");
  const [customerSpecification, setCustomerSpecification] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!productType) return onError(new Error("Please select a product type"));
    if (!productStandard.trim()) return onError(new Error("Please enter the applicable standard"));
    setSaving(true);
    try {
      await SteelService.confirmProduct(planId, {
        productType, productStandard, customerSpecification: customerSpecification || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Product type" value={productType} onChange={(v) => setProductType(v as ProductType)}
          options={[
            { value: "TMT_BAR", label: "TMT Bar" },
            { value: "BILLET", label: "Billet" },
            { value: "WIRE_ROD", label: "Wire Rod" },
            { value: "SECTION", label: "Section" },
            { value: "OTHER", label: "Other" },
          ]}
        />
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Standard</label>
          <Input value={productStandard} onChange={(e) => setProductStandard(e.target.value)} placeholder="e.g. IS 1786" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Customer specification</label>
        <Input value={customerSpecification} onChange={(e) => setCustomerSpecification(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Product & Standard"}
      </Button>
    </div>
  );
}

// ── A04 ───────────────────────────────────────────────────────────────────────

function SpecificationForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [grade, setGrade] = useState("");
  const [size, setSize] = useState("");
  const [length, setLength] = useState("");
  const [bundleType, setBundleType] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [toleranceNotes, setToleranceNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!grade.trim() || !size.trim()) return onError(new Error("Grade and size are required"));
    const qty = Number(totalQuantity);
    if (!qty || qty <= 0) return onError(new Error("Please enter a valid total quantity"));
    setSaving(true);
    try {
      await SteelService.confirmSpecification(planId, {
        grade, size, length: length || undefined, bundleType: bundleType || undefined,
        totalQuantity: qty, toleranceNotes: toleranceNotes || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Grade</label>
          <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Fe500D" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Size</label>
          <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 12mm" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Length</label>
          <Input value={length} onChange={(e) => setLength(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Bundle type</label>
          <Input value={bundleType} onChange={(e) => setBundleType(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Total quantity (tonnes)</label>
          <Input type="number" step="0.01" value={totalQuantity} onChange={(e) => setTotalQuantity(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Tolerance notes</label>
        <Input value={toleranceNotes} onChange={(e) => setToleranceNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Specification"}
      </Button>
    </div>
  );
}

// ── A05 ───────────────────────────────────────────────────────────────────────

function StockCheckForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [qty, setQty] = useState("0");
  const [bundleIds, setBundleIds] = useState("");
  const [heatNumbers, setHeatNumbers] = useState("");
  const [certificateRefs, setCertificateRefs] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await SteelService.checkStock(planId, {
        certifiedStockAvailableQty: Number(qty) || 0,
        stockBundleIds: bundleIds ? bundleIds.split(",").map((s) => s.trim()).filter(Boolean) : [],
        stockHeatNumbers: heatNumbers ? heatNumbers.split(",").map((s) => s.trim()).filter(Boolean) : [],
        stockCertificateRefs: certificateRefs ? certificateRefs.split(",").map((s) => s.trim()).filter(Boolean) : [],
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Certified stock available (tonnes)</label>
        <Input type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Bundle IDs (comma separated)</label>
        <Input value={bundleIds} onChange={(e) => setBundleIds(e.target.value)} placeholder="BND-001, BND-002" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Heat numbers (comma separated)</label>
        <Input value={heatNumbers} onChange={(e) => setHeatNumbers(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Certificate references (comma separated)</label>
        <Input value={certificateRefs} onChange={(e) => setCertificateRefs(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Stock Check"}
      </Button>
    </div>
  );
}

// ── A06 ───────────────────────────────────────────────────────────────────────

function StockDecisionForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [decision, setDecision] = useState<StockDecision | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!decision) return onError(new Error("Please select a decision"));
    setSaving(true);
    try {
      await SteelService.decideStockOrProduction(planId, { stockDecision: decision, stockDecisionNotes: notes || undefined }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <SelectField
        label="Decision" value={decision} onChange={(v) => setDecision(v as StockDecision)}
        options={[
          { value: "DISPATCH_FROM_STOCK", label: "Dispatch from Stock" },
          { value: "PRODUCTION_REQUIRED", label: "Production Required" },
        ]}
      />
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Decision"}
      </Button>
    </div>
  );
}

// ── A07 ───────────────────────────────────────────────────────────────────────

function RouteForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [route, setRoute] = useState<PlantRoute | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!route) return onError(new Error("Please select a route"));
    setSaving(true);
    try {
      await SteelService.selectRoute(planId, { plantRoute: route, routeNotes: notes || undefined }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <SelectField
        label="Plant route" value={route} onChange={(v) => setRoute(v as PlantRoute)}
        options={[
          { value: "INTEGRATED_PLANT", label: "Integrated Plant" },
          { value: "SCRAP_BASED_FURNACE_PLANT", label: "Scrap-Based Furnace Plant" },
          { value: "RE_ROLLER_PLANT", label: "Re-Roller Plant" },
          { value: "OWN_CCM_BILLET_ROUTE", label: "Own CCM Billet Route" },
          { value: "LOCAL_PURCHASED_BILLET_ROUTE", label: "Local Purchased Billet Route" },
          { value: "IMPORTED_BILLET_ROUTE", label: "Imported Billet Route" },
          { value: "HOT_CHARGE_ROUTE", label: "Hot Charge Route" },
          { value: "COLD_CHARGE_ROUTE", label: "Cold Charge Route" },
          { value: "MULTIPLE_ROUTES", label: "Multiple Routes" },
        ]}
      />
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Select Route"}
      </Button>
    </div>
  );
}

// ── A08 ───────────────────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "PARTIAL", label: "Partial" },
  { value: "NOT_AVAILABLE", label: "Not Available" },
];

function MaterialCheckForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [availability, setAvailability] = useState<AvailabilityStatus | "">("");
  const [shortageNotes, setShortageNotes] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!availability) return onError(new Error("Please select material availability"));
    setSaving(true);
    try {
      await SteelService.checkMaterial(planId, {
        materialAvailability: availability,
        materialShortageNotes: shortageNotes || undefined,
        purchaseRequirementNotes: purchaseNotes || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <SelectField label="Material availability" value={availability} onChange={(v) => setAvailability(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Shortage notes</label>
        <Input value={shortageNotes} onChange={(e) => setShortageNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Purchase requirement notes</label>
        <Input value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Material Check"}
      </Button>
    </div>
  );
}

// ── A09 ───────────────────────────────────────────────────────────────────────

function CapacityCheckForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [equipment, setEquipment] = useState<AvailabilityStatus | "">("");
  const [manpower, setManpower] = useState<AvailabilityStatus | "">("");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!equipment || !manpower) return onError(new Error("Please select equipment and manpower availability"));
    setSaving(true);
    try {
      await SteelService.checkCapacity(planId, {
        equipmentAvailability: equipment,
        manpowerAvailability: manpower,
        maintenanceShutdownNotes: maintenanceNotes || undefined,
        shiftPlanNotes: shiftNotes || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Equipment availability" value={equipment} onChange={(v) => setEquipment(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
        <SelectField label="Manpower availability" value={manpower} onChange={(v) => setManpower(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Maintenance / shutdown notes</label>
        <Input value={maintenanceNotes} onChange={(e) => setMaintenanceNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Shift plan notes</label>
        <Input value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Capacity Check"}
      </Button>
    </div>
  );
}

// ── A10 ───────────────────────────────────────────────────────────────────────

function ProductionPlanForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [items, setItems] = useState<SteelProductionSequenceItem[]>([{ batch: "1" }]);
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const updateItem = (i: number, patch: Partial<SteelProductionSequenceItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const submit = async () => {
    const valid = items.filter((it) => it.batch.trim());
    if (valid.length === 0) return onError(new Error("Add at least one production batch"));
    setSaving(true);
    try {
      await SteelService.prepareProductionPlan(planId, {
        productionSequence: valid,
        plannedStartDate: plannedStartDate || undefined,
        plannedEndDate: plannedEndDate || undefined,
        planNotes: planNotes || undefined,
      }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Planned start date</label>
          <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Planned end date</label>
          <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 block">Production sequence</label>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-center">
            <Input placeholder="Batch #" value={item.batch} onChange={(e) => updateItem(i, { batch: e.target.value })} />
            <Input placeholder="Description" value={item.description || ""} onChange={(e) => updateItem(i, { description: e.target.value })} />
            <Input
              type="number" placeholder="Qty (t)"
              value={item.quantityTonnes ?? ""}
              onChange={(e) => updateItem(i, { quantityTonnes: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input type="date" value={item.sequenceDate || ""} onChange={(e) => updateItem(i, { sequenceDate: e.target.value })} />
            <Button
              variant="ghost" size="icon-sm" type="button"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline" size="sm" type="button"
          onClick={() => setItems((prev) => [...prev, { batch: String(prev.length + 1) }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add batch
        </Button>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
        <Input value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Optional" />
      </div>

      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Production Plan"}
      </Button>
    </div>
  );
}

// ── A11 ───────────────────────────────────────────────────────────────────────

function CommunicateForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [selected, setSelected] = useState<SteelDepartment[]>(ALL_DEPARTMENTS);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (d: SteelDepartment) => {
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = async () => {
    if (selected.length === 0) return onError(new Error("Select at least one department"));
    setSaving(true);
    try {
      await SteelService.communicatePlan(planId, { departments: selected, notes: notes || undefined }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {ALL_DEPARTMENTS.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(d)} onChange={() => toggle(d)} />
            {d.charAt(0) + d.slice(1).toLowerCase()}
          </label>
        ))}
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Communicate to Departments"}
      </Button>
    </div>
  );
}

function DepartmentAckRow({
  planId, ack, token, onDone, onError,
}: {
  planId: string;
  ack: SteelProductionPlan["departmentAcks"][number];
  token: string;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [saving, setSaving] = useState(false);

  const ackNow = async () => {
    setSaving(true);
    try {
      await SteelService.acknowledgeDepartment(planId, ack.department, { acknowledged: true }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-sm text-slate-700">{ack.department.charAt(0) + ack.department.slice(1).toLowerCase()}</span>
      {ack.acknowledged ? (
        <Badge className="bg-emerald-50 text-emerald-700">Acknowledged</Badge>
      ) : (
        <Button size="xs" variant="outline" onClick={ackNow} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Acknowledge"}
        </Button>
      )}
    </div>
  );
}

// ── A12 ───────────────────────────────────────────────────────────────────────

function ReleaseForm({ planId, token, onDone, onError }: { planId: string; token: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await SteelService.releasePlan(planId, { releaseNotes: notes || undefined }, token);
      onDone();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">Release notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <Button onClick={submit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release Production Plan"}
      </Button>
    </div>
  );
}
