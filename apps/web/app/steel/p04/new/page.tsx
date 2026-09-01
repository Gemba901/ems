"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { ChargePreparationService, CreateChargePreparationPayload } from "@/services/steel-charge-preparation.service";
import { SteelService } from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { ClipboardList, Loader2 } from "lucide-react";

export default function NewChargePreparationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}>
      <NewChargePreparationForm />
    </Suspense>
  );
}

function NewChargePreparationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [planId, setPlanId] = useState(searchParams.get("planId") ?? "");
  const [stockAvailabilityConfirmed, setStockAvailabilityConfirmed] = useState(false);
  const [requirementNotes, setRequirementNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Charge preparation can only be started against a released production plan (P01-A12).
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["steel-plans", "released"],
    queryFn: () => SteelService.getAll(accessToken!, { status: "RELEASED", limit: 100 }),
    enabled: !!accessToken,
  });
  const releasedPlans = plans?.data ?? [];

  const mutation = useMutation({
    mutationFn: (payload: CreateChargePreparationPayload) => ChargePreparationService.create(payload, accessToken!),
    onSuccess: (prep) => {
      toast("Charge preparation created — proceed to select material lots.", "success");
      router.push(`/steel/p04/${prep.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!planId) {
      setError("Select the released production plan to prepare a charge for.");
      return;
    }

    mutation.mutate({
      planId,
      stockAvailabilityConfirmed,
      requirementNotes: requirementNotes || undefined,
    });
  };

  const selectedPlan = releasedPlans.find((p) => p.id === planId);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <ScreenHeader
        code="P04"
        icon={ClipboardList}
        title="New Charge Preparation"
        subtitle="Review the production plan and material requirement to start preparing a furnace charge."
        backHref="/steel/p04"
        backLabel="Back to Charge Preparations"
      />

      <Card>
        <CardHeader>
          <CardTitle>Production Plan & Requirement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Production plan</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">{plansLoading ? "Loading production plans..." : "Select a released production plan..."}</option>
                {releasedPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.planNumber} — {p.customerName ?? p.dealerName ?? "—"}
                  </option>
                ))}
              </select>
              {releasedPlans.length === 0 && !plansLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  No production plans are released yet. The plan must be released (P01-A12) before charge preparation can start.
                </p>
              )}
            </div>

            {selectedPlan && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-slate-400 block">Product</span>{selectedPlan.productType?.replace(/_/g, " ") ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Grade</span>{selectedPlan.grade ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Quantity</span>{selectedPlan.totalQuantity ?? selectedPlan.requestedQuantityTonnes ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Route</span>{selectedPlan.plantRoute?.replace(/_/g, " ") ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Priority</span>{selectedPlan.priority ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Planned start</span>{selectedPlan.plannedStartDate ? new Date(selectedPlan.plannedStartDate).toLocaleDateString() : "—"}</div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stockAvailabilityConfirmed} onChange={(e) => setStockAvailabilityConfirmed(e.target.checked)} />
              Stock availability confirmed
            </label>
            <Input placeholder="Requirement notes (optional)" value={requirementNotes} onChange={(e) => setRequirementNotes(e.target.value)} />

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Charge Preparation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
