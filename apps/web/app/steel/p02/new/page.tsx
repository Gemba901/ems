"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelService } from "@/services/steel.service";
import { SteelSourcingService, CreateSourcingOrderPayload } from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewSteelSourcingOrderPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [planId, setPlanId] = useState("");
  const [materialRequirementNotes, setMaterialRequirementNotes] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only released plans (P01-A12) can start sourcing.
  const { data: releasedPlans, isLoading: plansLoading } = useQuery({
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
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p02" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to sourcing orders
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Sourcing Order</CardTitle>
          <p className="text-sm text-slate-500">
            P02-A01 — Review the material requirement from a released production plan to start sourcing.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Released production plan</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">{plansLoading ? "Loading released plans..." : "Select a plan..."}</option>
                {releasedPlans?.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.planNumber} — {p.customerName || p.dealerName || "—"}
                  </option>
                ))}
              </select>
              {releasedPlans?.data.length === 0 && !plansLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  No released plans yet. Release a P01 production plan first.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Required by date</label>
              <Input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Material requirement notes</label>
              <textarea
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px]"
                value={materialRequirementNotes}
                onChange={(e) => setMaterialRequirementNotes(e.target.value)}
                placeholder="What material, quantity, grade, and date needed does the plan require?"
              />
            </div>

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Sourcing Order"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}