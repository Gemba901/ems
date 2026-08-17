"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  SteelProductionPlan,
  ProductType,
  ConfirmProductPayload,
  ConfirmSpecificationPayload,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/p01/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/p01/ScreenHeader";
import { ScreenSidebar } from "@/components/steel/p01/ScreenSidebar";
import {
  Loader2,
  Layers,
  Component,
  Box,
  Cable,
  MoreHorizontal,
  Check,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ClipboardEdit,
} from "lucide-react";

const STATUS_BADGE_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_BADGE_STYLES[status] ?? "bg-slate-100 text-slate-600"}>
      {status.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase())}
    </Badge>
  );
}

function CurrentTaskBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
      <ClipboardEdit className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
      <p className="text-sm text-blue-900">
        <span className="font-semibold">What to do now: </span>
        {text}
      </p>
    </div>
  );
}

const PRODUCT_TYPES: { value: ProductType; label: string; description: string; icon: typeof Box }[] = [
  { value: "TMT_BAR", label: "TMT Bar", description: "Thermo-mechanically treated reinforcement bar.", icon: Component },
  { value: "BILLET", label: "Billet", description: "Semi-finished steel billet.", icon: Box },
  { value: "WIRE_ROD", label: "Wire Rod", description: "Hot-rolled wire rod coil.", icon: Cable },
  { value: "SECTION", label: "Section", description: "Structural steel section.", icon: Layers },
  { value: "OTHER", label: "Other", description: "A product type not listed above.", icon: MoreHorizontal },
];

function ContextSummary({ plan }: { plan: SteelProductionPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demand Summary</CardTitle>
        <p className="text-sm text-slate-500">Captured in S1 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Plan</p>
            <p className="font-medium text-slate-800">{plan.planNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Demand Source</p>
            <p className="font-medium text-slate-800">{plan.demandSource.replace(/_/g, " ")}</p>
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
          <div>
            <p className="text-xs text-slate-400">Priority</p>
            <p className="font-medium text-slate-800">{plan.priority?.replace(/_/g, " ") ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Sidebar({ plan, subStep }: { plan: SteelProductionPlan; subStep: "A03" | "A04" }) {
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
            S2 covers P01-A03 (classify the product type and standard) and P01-A04 (lock the exact grade, size, and
            quantity). Getting this right determines route, material, and capacity checks later.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Plan</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.planNumber}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Stage</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.stage.replace(/_/g, " ")}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specification Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {plan.productType ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Product Type</dt>
                <dd className="text-slate-700 font-medium text-right">{plan.productType.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Standard</dt>
                <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">{plan.productStandard}</dd>
              </div>
              {plan.grade && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Grade</dt>
                  <dd className="text-slate-700 font-medium text-right">{plan.grade}</dd>
                </div>
              )}
              {plan.size && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Size</dt>
                  <dd className="text-slate-700 font-medium text-right">{plan.size}</dd>
                </div>
              )}
              {plan.totalQuantity !== null && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Total Quantity</dt>
                  <dd className="text-slate-700 font-medium text-right">{plan.totalQuantity} t</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Confirm the product type to see a summary here.</p>
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
            {subStep === "A03"
              ? "Once the product type and standard are confirmed, you'll enter the exact grade, size, and quantity in this same screen."
              : "Once the specification is saved, this plan moves to S3 — Stock & Fulfilment Decision."}
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
            {subStep === "A03" ? (
              <>
                <li>Standard should match the applicable specification (e.g. IS 1786).</li>
                <li>Customer specification is optional — add it if the customer specified extra requirements.</li>
              </>
            ) : (
              <>
                <li>Grade and size are required; length and bundle type are optional.</li>
                <li>Total quantity can differ slightly from the originally requested quantity.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A03 — Product classification ─────────────────────────────────────────────

function ProductClassificationForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [productType, setProductType] = useState<ProductType | "">("");
  const [productStandard, setProductStandard] = useState("");
  const [customerSpecification, setCustomerSpecification] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmProductPayload) => SteelService.confirmProduct(planId, payload, token),
    onSuccess: () => {
      toast("Product classified — continue with specification.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productType) {
      setError("Please select a product type.");
      return;
    }
    if (!productStandard.trim()) {
      setError("Please enter the applicable product standard.");
      return;
    }
    mutation.mutate({
      productType,
      productStandard: productStandard.trim(),
      customerSpecification: customerSpecification || undefined,
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
          <CardTitle>Product Type</CardTitle>
          <p className="text-sm text-slate-500">What kind of product is this? (required)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {PRODUCT_TYPES.map((p) => {
              const Icon = p.icon;
              const selected = p.value === productType;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProductType(p.value)}
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
          <CardTitle>Standard & Specification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Standard <span className="text-red-500">*</span>
              </label>
              <Input value={productStandard} onChange={(e) => setProductStandard(e.target.value)} placeholder="e.g. IS 1786" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Customer specification <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input
                value={customerSpecification}
                onChange={(e) => setCustomerSpecification(e.target.value)}
                placeholder="Only if the customer specified extra requirements"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Continue →"}
        </Button>
      </div>
    </form>
  );
}

// ── A04 — Production specification ───────────────────────────────────────────

function SpecificationForm({
  planId, token, onDone,
}: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [grade, setGrade] = useState("");
  const [size, setSize] = useState("");
  const [length, setLength] = useState("");
  const [bundleType, setBundleType] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [toleranceNotes, setToleranceNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmSpecificationPayload) => SteelService.confirmSpecification(planId, payload, token),
    onSuccess: () => {
      toast("Specification saved — continuing to Stock & Fulfilment.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!grade.trim() || !size.trim()) {
      setError("Grade and size are required.");
      return;
    }
    const qty = Number(totalQuantity);
    if (!qty || qty <= 0) {
      setError("Please enter a valid total quantity.");
      return;
    }
    mutation.mutate({
      grade: grade.trim(),
      size: size.trim(),
      length: length || undefined,
      bundleType: bundleType || undefined,
      totalQuantity: qty,
      toleranceNotes: toleranceNotes || undefined,
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
          <CardTitle>Product</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Grade <span className="text-red-500">*</span>
              </label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Fe500D" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Size <span className="text-red-500">*</span>
              </label>
              <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 12mm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Length <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input value={length} onChange={(e) => setLength(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packaging</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
              Bundle type <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input value={bundleType} onChange={(e) => setBundleType(e.target.value)} placeholder="Optional" className="max-w-xs" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quantity</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
              Total quantity <span className="text-red-500">*</span>
            </label>
            <div className="relative max-w-xs">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
                placeholder="e.g. 25.5"
                className="pr-12"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">tonnes</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Must be greater than zero.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Tolerance / specification notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
            value={toleranceNotes}
            maxLength={500}
            onChange={(e) => setToleranceNotes(e.target.value)}
            placeholder="Any tolerance or additional specification detail..."
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{toleranceNotes.length}/500</p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Specification — Continue to Stock & Fulfilment →"}
        </Button>
      </div>
    </form>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S2ProductSpecification({
  plan, token, onRefresh,
}: { plan: SteelProductionPlan; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  const subStep: "A03" | "A04" = plan.stage === "A02_PRIORITY_CONFIRMED" ? "A03" : "A04";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={Layers}
        title="Product & Specification"
        subtitle={`${plan.planNumber} — define the product standard and finalize the exact production specification.`}
        rightContent={<StatusBadge status={plan.status} />}
      />
      <WorkflowIndicator doneCount={1} activeIndex={1} />
      <ContextSummary plan={plan} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          <CurrentTaskBanner
            text={
              subStep === "A03"
                ? "Classify the product type and confirm the applicable standard."
                : "Enter the exact grade, size, and quantity for this plan."
            }
          />
          {subStep === "A03" ? (
            <ProductClassificationForm planId={plan.id} token={token} onDone={refresh} />
          ) : (
            <SpecificationForm planId={plan.id} token={token} onDone={refresh} />
          )}
        </div>
        <Sidebar plan={plan} subStep={subStep} />
      </div>
    </div>
  );
}
