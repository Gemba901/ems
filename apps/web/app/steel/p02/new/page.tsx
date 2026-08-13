"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelService, SteelProductionPlan } from "@/services/steel.service";
import { SteelSourcingService, CreateSourcingOrderPayload } from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/p02/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p02/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p02/ScreenSidebar";
import {
  Truck,
  Loader2,
  Check,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  PackageSearch,
} from "lucide-react";

function planLabel(plan: SteelProductionPlan) {
  return plan.customerName || plan.dealerName || "—";
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ plan }: { plan: SteelProductionPlan | null }) {
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
            S1 covers P02-A01 — reviewing the material requirement from an already released P01 production plan to
            open a sourcing order.
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
                <dt className="text-slate-400">Customer/Dealer</dt>
                <dd className="text-slate-700 font-medium text-right truncate max-w-[160px]">{planLabel(plan)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Requested Quantity</dt>
                <dd className="text-slate-700 font-medium text-right">{plan.requestedQuantityTonnes} t</dd>
              </div>
              {plan.productType && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Product Type</dt>
                  <dd className="text-slate-700 font-medium text-right">{plan.productType}</dd>
                </div>
              )}
              {plan.plantRoute && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Plant Route</dt>
                  <dd className="text-slate-700 font-medium text-right">{plan.plantRoute}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Expected Delivery</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {plan.expectedDeliveryDate ? new Date(plan.expectedDeliveryDate).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Select a released plan to see its details here.</p>
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
            Once the sourcing order is created, you&apos;ll move on to S2 — Identify &amp; Assess Supplier, where the
            material type is classified and a candidate supplier is checked and risk-reviewed.
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
            <li>Only production plans that have been released from P01 are eligible for sourcing.</li>
            <li>Required-by date and notes are optional but help suppliers plan delivery.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── Plan picker ───────────────────────────────────────────────────────────

function PlanPicker({
  plans, isLoading, isError, onRetry, selectedId, onSelect,
}: {
  plans: SteelProductionPlan[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">Released production plans could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <PackageSearch className="h-6 w-6 text-slate-300" />
        <p className="text-sm text-slate-600">No released plans yet.</p>
        <p className="text-xs text-slate-400">Release a P01 production plan first to start sourcing against it.</p>
        <Link href="/steel/p01">
          <Button size="sm" variant="outline" className="mt-1">
            Go to Production Planning
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {plans.map((plan) => {
        const selected = plan.id === selectedId;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
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
            <p className="text-sm font-semibold text-slate-900">{plan.planNumber}</p>
            <p className="text-xs text-slate-500">{planLabel(plan)}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-1">
              <span>{plan.requestedQuantityTonnes} t</span>
              {plan.productType && <span>{plan.productType}</span>}
              {plan.expectedDeliveryDate && (
                <span>Due {new Date(plan.expectedDeliveryDate).toLocaleDateString()}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function NewSteelSourcingOrderPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [planId, setPlanId] = useState("");
  const [materialRequirementNotes, setMaterialRequirementNotes] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only released plans (P01-A12) can start sourcing.
  const plansQuery = useQuery({
    queryKey: ["steel-plans", "released-for-sourcing"],
    queryFn: () => SteelService.getAll(accessToken!, { stage: "A12_PLAN_RELEASED", limit: 50 }),
    enabled: !!accessToken,
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateSourcingOrderPayload) => SteelSourcingService.create(payload, accessToken!),
    onSuccess: (order) => {
      toast("Sourcing order created — proceed to identify material type.", "success");
      router.push(`/steel/p02/${order.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const selectedPlan = plansQuery.data?.data.find((p) => p.id === planId) ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!planId) {
      setError("Select the released production plan this sourcing order is for.");
      return;
    }

    mutation.mutate({
      planId,
      materialRequirementNotes: materialRequirementNotes || undefined,
      requiredByDate: requiredByDate || undefined,
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={Truck}
        title="New Sourcing Order"
        subtitle="Review the material requirement from a released production plan to start sourcing."
      />
      <WorkflowIndicator doneCount={0} activeIndex={0} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Select Released Production Plan</CardTitle>
              <p className="text-sm text-slate-500">Only plans that have been released from P01 are eligible.</p>
            </CardHeader>
            <CardContent>
              <PlanPicker
                plans={plansQuery.data?.data}
                isLoading={plansQuery.isLoading}
                isError={plansQuery.isError}
                onRetry={() => plansQuery.refetch()}
                selectedId={planId}
                onSelect={setPlanId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requirement Details</CardTitle>
              <p className="text-sm text-slate-500">When it&apos;s needed and any additional context.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Required by date <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Material requirement notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
                  value={materialRequirementNotes}
                  maxLength={500}
                  onChange={(e) => setMaterialRequirementNotes(e.target.value)}
                  placeholder="What material, quantity, grade, and date needed does the plan require?"
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{materialRequirementNotes.length}/500</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link href="/steel/p02">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={mutation.isPending || !planId} className="gap-2">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Sourcing Order →"}
            </Button>
          </div>
        </form>

        <Sidebar plan={selectedPlan} />
      </div>
    </div>
  );
}
