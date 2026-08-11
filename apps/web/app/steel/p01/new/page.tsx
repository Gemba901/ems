"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  DemandSource,
  OrderPriority,
  CreditStatus,
  CreateSteelDemandPayload,
  ConfirmPriorityPayload,
  SteelProductionPlan,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  ClipboardList,
  ShoppingCart,
  Building2,
  Briefcase,
  TrendingUp,
  Warehouse,
  Check,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  Gauge,
  Zap,
  Plane,
  RefreshCw,
} from "lucide-react";

const DEMAND_SOURCES: { value: DemandSource; label: string; description: string; icon: typeof ShoppingCart }[] = [
  {
    value: "CUSTOMER_ORDER",
    label: "Customer Order",
    description: "A confirmed order placed directly by a customer.",
    icon: ShoppingCart,
  },
  {
    value: "DEALER_REQUIREMENT",
    label: "Dealer Requirement",
    description: "A requirement raised by a dealer or distributor.",
    icon: Building2,
  },
  {
    value: "PROJECT_REQUIREMENT",
    label: "Project Requirement",
    description: "Material needed for a specific ongoing project.",
    icon: Briefcase,
  },
  {
    value: "FORECAST",
    label: "Forecast",
    description: "Anticipated demand based on sales forecasting.",
    icon: TrendingUp,
  },
  {
    value: "INTERNAL_STOCK_PLAN",
    label: "Internal Stock Plan",
    description: "Replenishment to maintain internal stock levels.",
    icon: Warehouse,
  },
];

// Fields relevant to each demand source — the DTO accepts all of these as
// optional regardless of source, but only some are meaningful per source.
const SOURCE_FIELDS: Record<DemandSource, ("customerName" | "dealerName" | "salesOrderNumber" | "projectReference" | "forecastReference" | "stockRequirementReference")[]> = {
  CUSTOMER_ORDER: ["customerName", "salesOrderNumber"],
  DEALER_REQUIREMENT: ["dealerName", "salesOrderNumber"],
  PROJECT_REQUIREMENT: ["projectReference"],
  FORECAST: ["forecastReference"],
  INTERNAL_STOCK_PLAN: ["stockRequirementReference"],
};

const PRIORITY_OPTIONS: { value: OrderPriority; label: string; description: string; icon: typeof Gauge }[] = [
  { value: "NORMAL", label: "Normal", description: "Standard processing timeline.", icon: Gauge },
  { value: "URGENT", label: "Urgent", description: "Needs expedited handling.", icon: Zap },
  { value: "EXPORT", label: "Export", description: "Bound for export shipment.", icon: Plane },
  { value: "PROJECT", label: "Project", description: "Tied to a project commitment.", icon: Briefcase },
  { value: "STOCK_REPLENISHMENT", label: "Stock Replenishment", description: "Internal stock replenishment.", icon: RefreshCw },
];

const CREDIT_STATUS_OPTIONS: { value: CreditStatus; label: string }[] = [
  { value: "APPROVED", label: "Approved" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "PENDING", label: "Pending" },
];

// The 6 screens of the redesigned P01 workflow. Only S1 exists so far —
// S2-S6 are shown as upcoming, never as done, on this screen.
const SCREENS = [
  { code: "S1", label: "Demand & Priority" },
  { code: "S2", label: "Product & Specification" },
  { code: "S3", label: "Stock & Fulfilment" },
  { code: "S4", label: "Feasibility & Route" },
  { code: "S5", label: "Plan Preparation" },
  { code: "S6", label: "Plan Release" },
];

function WorkflowIndicator() {
  return (
    <Card>
      <CardContent className="py-1">
        <div className="flex items-center overflow-x-auto">
          {SCREENS.map((s, i) => {
            const isActive = i === 0;
            return (
              <div key={s.code} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
                      (isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 ring-1 ring-slate-200")
                    }
                  >
                    {isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={"text-xs font-medium whitespace-nowrap " + (isActive ? "text-slate-900" : "text-slate-400")}>
                    {s.label}
                  </span>
                </div>
                {i < SCREENS.length - 1 && <div className="h-px w-8 md:w-10 bg-slate-200 mx-2 shrink-0" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Header() {
  return (
    <div className="space-y-3">
      <Link
        href="/steel/p01"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Production Planning
      </Link>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <ClipboardList className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Demand & Priority</h1>
          <p className="text-sm text-slate-500">Capture the customer or business requirement and establish its priority.</p>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ plan, subStep }: { plan: SteelProductionPlan | null; subStep: "A01" | "A02" }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            S1 covers P01-A01 (capture the demand) and P01-A02 (confirm priority). Both happen in this one screen —
            the plan is created first, then its priority is confirmed immediately after.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {plan ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Production Plan</dt>
                <dd className="text-slate-700 font-medium text-right">{plan.planNumber}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Demand Source</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {DEMAND_SOURCES.find((d) => d.value === plan.demandSource)?.label ?? plan.demandSource}
                </dd>
              </div>
              {(plan.customerName || plan.dealerName) && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Customer/Dealer</dt>
                  <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">
                    {plan.customerName || plan.dealerName}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Requested Quantity</dt>
                <dd className="text-slate-700 font-medium text-right">{plan.requestedQuantityTonnes} t</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Expected Delivery</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">The plan summary will appear here once the demand is captured.</p>
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
            {subStep === "A01"
              ? "Once the demand is captured, you'll immediately confirm its priority in this same screen."
              : "Once priority is confirmed, this plan moves to S2 — Product & Specification."}
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
            {subStep === "A01" ? (
              <>
                <li>Customer name is required for customer orders.</li>
                <li>Quantity is entered in tonnes and can be refined in later stages.</li>
              </>
            ) : (
              <>
                <li>Priority affects how this plan is scheduled against others.</li>
                <li>Credit status and delivery promise are optional but help downstream planning.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── A01 — Demand capture ─────────────────────────────────────────────────────

function DemandCaptureForm({ onCreated }: { onCreated: (plan: SteelProductionPlan) => void }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [demandSource, setDemandSource] = useState<DemandSource>("CUSTOMER_ORDER");
  const [customerName, setCustomerName] = useState("");
  const [dealerName, setDealerName] = useState("");
  const [projectReference, setProjectReference] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [forecastReference, setForecastReference] = useState("");
  const [stockRequirementReference, setStockRequirementReference] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [requestedQuantityTonnes, setRequestedQuantityTonnes] = useState("");
  const [demandNotes, setDemandNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CreateSteelDemandPayload) => SteelService.create(payload, accessToken!),
    onSuccess: (plan) => {
      toast("Demand captured — confirm priority to continue.", "success");
      onCreated(plan);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(requestedQuantityTonnes);
    if (!qty || qty <= 0) {
      setError("Please enter a valid requested quantity (tonnes).");
      return;
    }
    if (demandSource === "CUSTOMER_ORDER" && !customerName.trim()) {
      setError("Customer name is required for a customer order.");
      return;
    }

    mutation.mutate({
      demandSource,
      customerName: customerName || undefined,
      dealerName: dealerName || undefined,
      projectReference: projectReference || undefined,
      salesOrderNumber: salesOrderNumber || undefined,
      forecastReference: forecastReference || undefined,
      stockRequirementReference: stockRequirementReference || undefined,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      requestedQuantityTonnes: qty,
      demandNotes: demandNotes || undefined,
    });
  };

  const visibleFields = SOURCE_FIELDS[demandSource];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Demand Source</CardTitle>
          <p className="text-sm text-slate-500">Where is this requirement coming from?</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {DEMAND_SOURCES.map((d) => {
              const Icon = d.icon;
              const selected = d.value === demandSource;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDemandSource(d.value)}
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
                      "h-9 w-9 rounded-lg flex items-center justify-center " +
                      (selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
                    }
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{d.label}</p>
                    <p className="text-xs text-slate-500 leading-snug">{d.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {visibleFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Demand Details</CardTitle>
            <p className="text-sm text-slate-500">Reference information for this demand.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {visibleFields.includes("customerName") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Customer name
                    {demandSource === "CUSTOMER_ORDER" && <span className="text-red-500">*</span>}
                  </label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Acme Steel Traders" />
                </div>
              )}
              {visibleFields.includes("dealerName") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Dealer name <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <Input value={dealerName} onChange={(e) => setDealerName(e.target.value)} placeholder="Optional" />
                </div>
              )}
              {visibleFields.includes("salesOrderNumber") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Sales order number <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <Input value={salesOrderNumber} onChange={(e) => setSalesOrderNumber(e.target.value)} placeholder="Optional" />
                </div>
              )}
              {visibleFields.includes("projectReference") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Project reference <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <Input value={projectReference} onChange={(e) => setProjectReference(e.target.value)} placeholder="Optional" />
                </div>
              )}
              {visibleFields.includes("forecastReference") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Forecast reference <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <Input value={forecastReference} onChange={(e) => setForecastReference(e.target.value)} placeholder="Optional" />
                </div>
              )}
              {visibleFields.includes("stockRequirementReference") && (
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                    Stock requirement reference <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <Input
                    value={stockRequirementReference}
                    onChange={(e) => setStockRequirementReference(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Production Requirement</CardTitle>
          <p className="text-sm text-slate-500">When it&apos;s needed and how much.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Expected delivery date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Requested quantity <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={requestedQuantityTonnes}
                  onChange={(e) => setRequestedQuantityTonnes(e.target.value)}
                  placeholder="e.g. 25.5"
                  className="pr-12"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">tonnes</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Must be greater than zero.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
            value={demandNotes}
            maxLength={500}
            onChange={(e) => setDemandNotes(e.target.value)}
            placeholder="Any additional context about this demand..."
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{demandNotes.length}/500</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/steel/p01">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Capture Demand →"}
        </Button>
      </div>
    </form>
  );
}

// ── A02 — Priority confirmation ──────────────────────────────────────────────

function PriorityForm({ plan }: { plan: SteelProductionPlan }) {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [priority, setPriority] = useState<OrderPriority | "">("");
  const [creditStatus, setCreditStatus] = useState<CreditStatus | "">("");
  const [deliveryPromiseDate, setDeliveryPromiseDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmPriorityPayload) => SteelService.confirmPriority(plan.id, payload, accessToken!),
    onSuccess: () => {
      toast("Priority confirmed — continuing to Product & Specification.", "success");
      queryClient.invalidateQueries({ queryKey: ["steel-plan-s1", plan.id] });
      router.push(`/steel/p01/${plan.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!priority) {
      setError("Please select a priority.");
      return;
    }
    mutation.mutate({
      priority,
      creditStatus: creditStatus || undefined,
      deliveryPromiseDate: deliveryPromiseDate || undefined,
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

      <Card>
        <CardHeader>
          <CardTitle>Demand Summary</CardTitle>
          <p className="text-sm text-slate-500">Plan {plan.planNumber}, captured just now.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Demand Source</p>
              <p className="font-medium text-slate-800">{DEMAND_SOURCES.find((d) => d.value === plan.demandSource)?.label}</p>
            </div>
            {(plan.customerName || plan.dealerName) && (
              <div>
                <p className="text-xs text-slate-400">Customer/Dealer</p>
                <p className="font-medium text-slate-800">{plan.customerName || plan.dealerName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400">Requested Quantity</p>
              <p className="font-medium text-slate-800">{plan.requestedQuantityTonnes} t</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Expected Delivery</p>
              <p className="font-medium text-slate-800">
                {plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Priority</CardTitle>
          <p className="text-sm text-slate-500">How urgent is this order?</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {PRIORITY_OPTIONS.map((p) => {
              const Icon = p.icon;
              const selected = p.value === priority;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
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
                      "h-9 w-9 rounded-lg flex items-center justify-center " +
                      (selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
                    }
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.label}</p>
                    <p className="text-xs text-slate-500 leading-snug">{p.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Delivery promise date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input type="date" value={deliveryPromiseDate} onChange={(e) => setDeliveryPromiseDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Credit status <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={creditStatus}
                onChange={(e) => setCreditStatus(e.target.value as CreditStatus)}
              >
                <option value="">Select...</option>
                {CREDIT_STATUS_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/steel/p01">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Priority — Continue to Product & Specification →"}
        </Button>
      </div>
    </form>
  );
}

// ── Page shell — resolves server stage on load/refresh ──────────────────────

function NewPlanS1Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const planId = searchParams.get("plan");

  const planQuery = useQuery({
    queryKey: ["steel-plan-s1", planId],
    queryFn: () => SteelService.getById(planId!, accessToken!),
    enabled: !!accessToken && !!planId,
    retry: false,
  });

  const handleCreated = (plan: SteelProductionPlan) => {
    queryClient.setQueryData(["steel-plan-s1", plan.id], plan);
    router.replace(`/steel/p01/new?plan=${plan.id}`, { scroll: false });
  };

  let body: React.ReactNode;
  let subStep: "A01" | "A02" = "A01";
  let planForSidebar: SteelProductionPlan | null = null;

  if (!planId) {
    body = <DemandCaptureForm onCreated={handleCreated} />;
  } else if (planQuery.isLoading) {
    body = (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  } else if (planQuery.isError || !planQuery.data) {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">
          {planQuery.error instanceof Error ? planQuery.error.message : "This production plan could not be loaded."}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => planQuery.refetch()} disabled={planQuery.isFetching}>
            {planQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
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
  } else {
    const plan = planQuery.data;
    planForSidebar = plan;
    // Server stage is authoritative. A01 is always complete once the plan
    // exists; if A02 (priority) is also already confirmed, S1 is finished —
    // hand off to the existing detail page (S2 onward) instead of re-showing
    // a completed step.
    if (plan.stage === "A01_DEMAND_CAPTURED") {
      subStep = "A02";
      body = <PriorityForm plan={plan} />;
    } else {
      router.replace(`/steel/p01/${plan.id}`);
      body = (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      );
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <Header />
      <WorkflowIndicator />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">{body}</div>
        <Sidebar plan={planForSidebar} subStep={subStep} />
      </div>
    </div>
  );
}

export default function NewSteelPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      }
    >
      <NewPlanS1Content />
    </Suspense>
  );
}
