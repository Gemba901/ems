"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelService, SteelProductionPlan } from "@/services/steel.service";
import { SteelSourcingService, CreateSourcingOrderPayload } from "@/services/steel-sourcing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { DocSection, DocGrid, DocField, StickyActions, ErrorBanner } from "@/components/steel/p02/document";
import { Truck, Loader2, Check, AlertTriangle, PackageSearch } from "lucide-react";

function planLabel(plan: SteelProductionPlan) {
  return plan.customerName || plan.dealerName || "—";
}

// ── Released-plan picker (Section 1) ─────────────────────────────────────────

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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-muted-foreground">Released production plans could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center px-4">
        <PackageSearch className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No released plans yet.</p>
        <p className="text-xs text-muted-foreground">Release a P01 production plan first to start sourcing against it.</p>
        <Link href="/steel/p01">
          <Button size="sm" variant="outline" className="mt-1">Go to Production Planning</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-input overflow-hidden divide-y divide-input">
      {plans.map((plan) => {
        const selected = plan.id === selectedId;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            aria-pressed={selected}
            className={"w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors " + (selected ? "bg-blue-50" : "hover:bg-muted/40")}
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{plan.planNumber} <span className="text-muted-foreground font-normal">— {planLabel(plan)}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {plan.requestedQuantityTonnes} t
                {plan.productType && ` · ${plan.productType}`}
                {plan.expectedDeliveryDate && ` · Due ${new Date(plan.expectedDeliveryDate).toLocaleDateString()}`}
              </p>
            </div>
            {selected && (
              <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
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
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader
        icon={Truck}
        title="Procurement Request"
        subtitle="Review the material requirement from a released production plan to start sourcing."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={0}
        activeIndex={0}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />

      <form onSubmit={handleSubmit} className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
        {error && <ErrorBanner message={error} />}

        <DocSection number="1" title="Procurement Reference" first>
          <p className="text-xs text-muted-foreground mb-2">Select the released P01 production plan this requirement comes from.</p>
          <PlanPicker
            plans={plansQuery.data?.data}
            isLoading={plansQuery.isLoading}
            isError={plansQuery.isError}
            onRetry={() => plansQuery.refetch()}
            selectedId={planId}
            onSelect={setPlanId}
          />
        </DocSection>

        <DocSection number="2" title="Material Requirement">
          {selectedPlan ? (
            <DocGrid cols={3}>
              <DocField label="Product Type" value={selectedPlan.productType} />
              <DocField label="Grade" value={selectedPlan.grade} />
              <DocField label="Plant Route" value={selectedPlan.plantRoute} />
            </DocGrid>
          ) : (
            <p className="text-sm text-muted-foreground">Select a plan above to see its material requirement here.</p>
          )}
        </DocSection>

        <DocSection number="3" title="Quantity & Required Date">
          <DocGrid>
            <DocField label="Requested Quantity" value={selectedPlan ? `${selectedPlan.requestedQuantityTonnes} t` : "—"} />
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Required by date <span className="text-muted-foreground/70 font-normal">(optional)</span>
              </label>
              <Input className="h-8" type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
            </div>
          </DocGrid>
        </DocSection>

        <DocSection number="4" title="Procurement Notes">
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Material requirement notes <span className="text-muted-foreground/70 font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring"
            value={materialRequirementNotes}
            maxLength={500}
            onChange={(e) => setMaterialRequirementNotes(e.target.value)}
            placeholder="Anything procurement needs to know that isn't already known from the plan"
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{materialRequirementNotes.length}/500</p>
        </DocSection>

        <StickyActions>
          <Link href="/steel/p02">
            <Button type="button" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={mutation.isPending || !planId} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Procurement Request →"}
          </Button>
        </StickyActions>
      </form>
    </div>
  );
}
