"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  SteelProductionPlan,
  StockDecision,
  StockCheckPayload,
  StockDecisionPayload,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  PackageSearch,
  PackageCheck,
  Factory,
  Check,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

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
            const isDone = i < 2;
            const isActive = i === 2;
            return (
              <div key={s.code} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
                      (isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-400 ring-1 ring-slate-200")
                    }
                  >
                    {isDone || isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className={
                      "text-xs font-medium whitespace-nowrap " +
                      (isDone || isActive ? "text-slate-900" : "text-slate-400")
                    }
                  >
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
          <PackageSearch className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Stock Check & Fulfilment</h1>
          <p className="text-sm text-slate-500">Verify certified finished-goods availability and determine the fulfilment path.</p>
        </div>
      </div>
    </div>
  );
}

function ContextSummary({ plan, requiredQty }: { plan: SteelProductionPlan; requiredQty: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Context</CardTitle>
        <p className="text-sm text-slate-500">From S1/S2 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Plan</p>
            <p className="font-medium text-slate-800">{plan.planNumber}</p>
          </div>
          {(plan.customerName || plan.dealerName) && (
            <div>
              <p className="text-xs text-slate-400">Customer/Dealer</p>
              <p className="font-medium text-slate-800">{plan.customerName || plan.dealerName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Product</p>
            <p className="font-medium text-slate-800">{plan.productType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Grade / Size</p>
            <p className="font-medium text-slate-800">{[plan.grade, plan.size].filter(Boolean).join(" / ") || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Required Quantity</p>
            <p className="font-medium text-slate-800">{requiredQty} t</p>
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

function Sidebar({
  plan, requiredQty, certifiedQty, subStep,
}: {
  plan: SteelProductionPlan;
  requiredQty: number;
  certifiedQty: number | null;
  subStep: "A05" | "A06";
}) {
  const shortfall = certifiedQty !== null ? requiredQty - certifiedQty : null;

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
            S3 covers P01-A05 (check certified finished-goods stock) and P01-A06 (decide whether to dispatch from
            stock or require production). This is the pivotal fulfilment decision for the plan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Plan ID</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.planNumber}</dd>
            </div>
            {(plan.customerName || plan.dealerName) && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Customer</dt>
                <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">
                  {plan.customerName || plan.dealerName}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Product</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.productType?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Grade</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.grade ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Required Quantity</dt>
              <dd className="text-slate-700 font-medium text-right">{requiredQty} t</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Priority</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.priority?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock Position</CardTitle>
        </CardHeader>
        <CardContent>
          {certifiedQty !== null ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Required</dt>
                <dd className="text-slate-700 font-medium text-right">{requiredQty} t</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Certified Available</dt>
                <dd className="text-slate-700 font-medium text-right">{certifiedQty} t</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">{shortfall !== null && shortfall > 0 ? "Shortfall" : "Surplus"}</dt>
                <dd className={"font-medium text-right " + (shortfall !== null && shortfall > 0 ? "text-red-600" : "text-emerald-600")}>
                  {shortfall !== null ? Math.abs(shortfall) : 0} t
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">The stock position will appear here once checked.</p>
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
              ? "Once the stock check is recorded, you'll decide the fulfilment path in this same screen."
              : "S4 — Feasibility & Route Planning."}
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
                <li>Only count certified finished-goods stock — not raw material.</li>
                <li>Bundle IDs, heat numbers, and certificate references are optional.</li>
              </>
            ) : (
              <>
                <li>The comparison above is informational — the decision is yours to confirm.</li>
                <li>All later checks (route, material, capacity) still apply either way.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ── A05 — Stock check ─────────────────────────────────────────────────────────

function StockCheckForm({
  planId, token, requiredQty, onDone,
}: { planId: string; token: string; requiredQty: number; onDone: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [bundleIds, setBundleIds] = useState("");
  const [heatNumbers, setHeatNumbers] = useState("");
  const [certificateRefs, setCertificateRefs] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: StockCheckPayload) => SteelService.checkStock(planId, payload, token),
    onSuccess: () => {
      toast("Stock check recorded — decide the fulfilment path next.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedQty = Number(qty);
    if (qty === "" || parsedQty < 0) {
      setError("Please enter the certified stock available (0 or more).");
      return;
    }
    mutation.mutate({
      certifiedStockAvailableQty: parsedQty,
      stockBundleIds: bundleIds ? bundleIds.split(",").map((s) => s.trim()).filter(Boolean) : [],
      stockHeatNumbers: heatNumbers ? heatNumbers.split(",").map((s) => s.trim()).filter(Boolean) : [],
      stockCertificateRefs: certificateRefs ? certificateRefs.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
  };

  const enteredQty = qty === "" ? null : Number(qty);
  const shortfall = enteredQty !== null && !Number.isNaN(enteredQty) ? requiredQty - enteredQty : null;

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
          <CardTitle>Demand vs. Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Requested</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{requiredQty}</p>
              <p className="text-xs text-slate-400">tonnes</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-4">
              <p className="text-xs text-blue-600 uppercase tracking-wide">Certified Stock</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{enteredQty !== null && !Number.isNaN(enteredQty) ? enteredQty : "—"}</p>
              <p className="text-xs text-blue-500">tonnes</p>
            </div>
            <div className={"rounded-xl border px-3 py-4 " + (shortfall !== null && shortfall > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50")}>
              <p className={"text-xs uppercase tracking-wide " + (shortfall !== null && shortfall > 0 ? "text-red-600" : "text-emerald-600")}>
                {shortfall !== null && shortfall <= 0 ? "Surplus" : "Shortfall"}
              </p>
              <p className={"text-2xl font-bold mt-1 " + (shortfall !== null && shortfall > 0 ? "text-red-700" : "text-emerald-700")}>
                {shortfall !== null ? Math.abs(shortfall) : "—"}
              </p>
              <p className={"text-xs " + (shortfall !== null && shortfall > 0 ? "text-red-500" : "text-emerald-500")}>tonnes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certified Finished Goods Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Certified stock available <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 7.5" className="pr-12" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">tonnes</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Bundle IDs <span className="text-slate-400 font-normal">(optional, comma separated)</span>
              </label>
              <Input value={bundleIds} onChange={(e) => setBundleIds(e.target.value)} placeholder="BND-001, BND-002" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Heat numbers <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input value={heatNumbers} onChange={(e) => setHeatNumbers(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
                Certificate references <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input value={certificateRefs} onChange={(e) => setCertificateRefs(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Stock Check →"}
        </Button>
      </div>
    </form>
  );
}

// ── A06 — Fulfilment decision ────────────────────────────────────────────────

function DecisionCompleteCard({ plan, onContinue }: { plan: SteelProductionPlan; onContinue: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700">
          <Check className="h-4 w-4" />
          S3 Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-slate-400">Fulfilment decision</p>
          <p className="text-base font-semibold text-slate-900">
            {plan.stockDecision === "DISPATCH_FROM_STOCK" ? "Dispatch from Stock" : "Production Required"}
          </p>
          {plan.stockDecisionNotes && <p className="text-xs text-slate-500 mt-1">{plan.stockDecisionNotes}</p>}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
          Next: <span className="font-medium text-slate-700">S4 — Feasibility & Route Planning</span>
        </div>
        <Button onClick={onContinue} className="gap-2">
          Continue to S4 <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function StockDecisionForm({
  plan, token, requiredQty, certifiedQty, onDecided,
}: {
  plan: SteelProductionPlan;
  token: string;
  requiredQty: number;
  certifiedQty: number;
  onDecided: () => void;
}) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<StockDecision | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: StockDecisionPayload) => SteelService.decideStockOrProduction(plan.id, payload, token),
    onSuccess: () => {
      toast("Fulfilment decision recorded.", "success");
      onDecided();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!decision) {
      setError("Please select a fulfilment path.");
      return;
    }
    mutation.mutate({ stockDecision: decision, stockDecisionNotes: notes || undefined });
  };

  const shortfall = requiredQty - certifiedQty;

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
          <CardTitle>Fulfilment Decision</CardTitle>
          <p className="text-sm text-slate-500">How should this demand be satisfied?</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setDecision("DISPATCH_FROM_STOCK")}
              aria-pressed={decision === "DISPATCH_FROM_STOCK"}
              className={
                "relative flex flex-col gap-3 rounded-2xl border-2 px-5 py-5 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (decision === "DISPATCH_FROM_STOCK"
                  ? "border-emerald-400 bg-emerald-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
              }
            >
              {decision === "DISPATCH_FROM_STOCK" && (
                <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              <div className="h-11 w-11 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                <PackageCheck className="h-5.5 w-5.5" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">Dispatch from Stock</p>
                <p className="text-xs text-slate-500 mt-0.5">Certified stock can satisfy the requirement.</p>
              </div>
              <div className="flex items-center gap-4 text-xs pt-1 border-t border-slate-200/70 mt-1">
                <span className="text-slate-500">
                  Available <span className="font-semibold text-slate-800">{certifiedQty} t</span>
                </span>
                <span className="text-slate-500">
                  Required <span className="font-semibold text-slate-800">{requiredQty} t</span>
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDecision("PRODUCTION_REQUIRED")}
              aria-pressed={decision === "PRODUCTION_REQUIRED"}
              className={
                "relative flex flex-col gap-3 rounded-2xl border-2 px-5 py-5 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (decision === "PRODUCTION_REQUIRED"
                  ? "border-blue-400 bg-blue-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
              }
            >
              {decision === "PRODUCTION_REQUIRED" && (
                <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                <Factory className="h-5.5 w-5.5" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">Production Required</p>
                <p className="text-xs text-slate-500 mt-0.5">Stock is insufficient, or production is otherwise needed.</p>
              </div>
              <div className="flex items-center gap-4 text-xs pt-1 border-t border-slate-200/70 mt-1">
                <span className={shortfall > 0 ? "text-red-500" : "text-slate-500"}>
                  {shortfall > 0 ? "Shortfall" : "Surplus"}{" "}
                  <span className="font-semibold text-slate-800">{Math.abs(shortfall)} t</span>
                </span>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {decision && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Decision notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for this decision" />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending || !decision} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Fulfilment Decision"}
        </Button>
      </div>
    </form>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S3StockFulfilment({
  plan, token, onRefresh,
}: { plan: SteelProductionPlan; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  const requiredQty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  const certifiedQty = plan.certifiedStockAvailableQty;

  let subStep: "A05" | "A06" = "A05";
  let body: React.ReactNode;

  if (plan.stage === "A04_SPEC_CONFIRMED") {
    subStep = "A05";
    body = <StockCheckForm planId={plan.id} token={token} requiredQty={requiredQty} onDone={refresh} />;
  } else if (plan.stage === "A05_STOCK_CHECKED") {
    subStep = "A06";
    body = (
      <StockDecisionForm
        plan={plan}
        token={token}
        requiredQty={requiredQty}
        certifiedQty={certifiedQty ?? 0}
        onDecided={refresh}
      />
    );
  } else {
    // stage === A06_STOCK_DECISION_MADE — whether just decided (refetched
    // via onDecided) or resumed after a page refresh, the completion card
    // reflects the real, saved decision either way.
    subStep = "A06";
    body = <DecisionCompleteCard plan={plan} onContinue={refresh} />;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <Header />
      <WorkflowIndicator />
      <ContextSummary plan={plan} requiredQty={requiredQty} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">{body}</div>
        <Sidebar plan={plan} requiredQty={requiredQty} certifiedQty={certifiedQty} subStep={subStep} />
      </div>
    </div>
  );
}
