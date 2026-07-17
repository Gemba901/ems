"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelService, DemandSource, CreateSteelDemandPayload } from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

const DEMAND_SOURCES: { value: DemandSource; label: string }[] = [
  { value: "CUSTOMER_ORDER", label: "Customer Order" },
  { value: "DEALER_REQUIREMENT", label: "Dealer Requirement" },
  { value: "PROJECT_REQUIREMENT", label: "Project Requirement" },
  { value: "FORECAST", label: "Forecast" },
  { value: "INTERNAL_STOCK_PLAN", label: "Internal Stock Plan" },
];

export default function NewSteelPlanPage() {
  const router = useRouter();
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
      toast("Production plan created — proceed to confirm priority.", "success");
      router.push(`/steel/p01/${plan.id}`);
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
    if (
      demandSource === "CUSTOMER_ORDER" && !customerName.trim()
    ) {
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

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p01" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to plans
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Production Plan</CardTitle>
          <p className="text-sm text-slate-500">
            P01-A01 — Capture the customer enquiry, sales order, forecast, or stock requirement that
            starts this plan.
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
              <label className="text-sm font-medium text-slate-700 block mb-1">Demand source</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={demandSource}
                onChange={(e) => setDemandSource(e.target.value as DemandSource)}
              >
                {DEMAND_SOURCES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Customer name</label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Acme Steel Traders" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Dealer name</label>
                <Input value={dealerName} onChange={(e) => setDealerName(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Sales order number</label>
                <Input value={salesOrderNumber} onChange={(e) => setSalesOrderNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Project reference</label>
                <Input value={projectReference} onChange={(e) => setProjectReference(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Forecast reference</label>
                <Input value={forecastReference} onChange={(e) => setForecastReference(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Stock requirement reference</label>
                <Input value={stockRequirementReference} onChange={(e) => setStockRequirementReference(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Expected delivery date</label>
                <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Requested quantity (tonnes)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={requestedQuantityTonnes}
                  onChange={(e) => setRequestedQuantityTonnes(e.target.value)}
                  placeholder="e.g. 25.5"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
              <textarea
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm min-h-[80px]"
                value={demandNotes}
                onChange={(e) => setDemandNotes(e.target.value)}
                placeholder="Any additional context about this demand..."
              />
            </div>

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Production Plan"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}