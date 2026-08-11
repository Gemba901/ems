"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MaterialIntakeService, CreateMaterialIntakePayload } from "@/services/material-intake.service";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

// Only sourcing orders that have informed the intake team (P02-A11) or closed
// handover (P02-A12) are ready to receive against — mirrors the backend's
// createIntake eligibility check.
const READY_STAGES = ["A11_INTAKE_INFORMED", "A12_HANDOVER_CLOSED"];

export default function NewMaterialIntakePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}>
      <NewMaterialIntakeForm />
    </Suspense>
  );
}

function NewMaterialIntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [sourcingOrderId, setSourcingOrderId] = useState(searchParams.get("sourcingOrderId") ?? "");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [arrivalDateTime, setArrivalDateTime] = useState("");
  const [gateEntryRef, setGateEntryRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: sourcingOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["steel-sourcing-orders", "ready-for-intake"],
    queryFn: () => SteelSourcingService.getAll(accessToken!, { limit: 100 }),
    enabled: !!accessToken,
  });
  const readyOrders = (sourcingOrders?.data ?? []).filter((o) => READY_STAGES.includes(o.stage));

  const mutation = useMutation({
    mutationFn: (payload: CreateMaterialIntakePayload) => MaterialIntakeService.create(payload, accessToken!),
    onSuccess: (intake) => {
      toast("Material intake recorded — proceed to verify documents.", "success");
      router.push(`/steel/p03/${intake.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourcingOrderId) {
      setError("Select the sourcing order this delivery is against.");
      return;
    }
    if (!vehicleNumber.trim()) {
      setError("Vehicle/container number is required.");
      return;
    }

    mutation.mutate({
      sourcingOrderId,
      vehicleNumber: vehicleNumber.trim(),
      driverName: driverName || undefined,
      transporterName: transporterName || undefined,
      arrivalDateTime: arrivalDateTime ? new Date(arrivalDateTime).toISOString() : undefined,
      gateEntryRef: gateEntryRef || undefined,
    });
  };

  const selectedOrder = readyOrders.find((o) => o.id === sourcingOrderId);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <Link href="/steel/p03" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        Back to material intakes
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Material Intake</CardTitle>
          <p className="text-sm text-slate-500">
            P03-A01 — Record truck/container arrival at the gate against a sourcing order.
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
              <label className="text-sm font-medium text-slate-700 block mb-1">Sourcing order</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={sourcingOrderId}
                onChange={(e) => setSourcingOrderId(e.target.value)}
              >
                <option value="">{ordersLoading ? "Loading sourcing orders..." : "Select a sourcing order..."}</option>
                {readyOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.sourcingNumber} — {o.supplier?.name ?? "No supplier"}
                  </option>
                ))}
              </select>
              {readyOrders.length === 0 && !ordersLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  No sourcing orders are ready for intake yet. The sourcing order must have informed the intake team (P02-A11) first.
                </p>
              )}
            </div>

            {selectedOrder && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-slate-400 block">Material type</span>{selectedOrder.materialType?.replace(/_/g, " ") ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">Supplier</span>{selectedOrder.supplier?.name ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">PO number</span>{selectedOrder.poNumber ?? "—"}</div>
                <div><span className="text-xs text-slate-400 block">PO quantity</span>{selectedOrder.poQuantity ?? "—"}</div>
              </div>
            )}

            <Input placeholder="Vehicle / container number" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Driver name (optional)" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              <Input placeholder="Transporter (optional)" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Arrival date/time (optional)</label>
              <Input type="datetime-local" value={arrivalDateTime} onChange={(e) => setArrivalDateTime(e.target.value)} />
            </div>
            <Input placeholder="Gate entry reference (optional)" value={gateEntryRef} onChange={(e) => setGateEntryRef(e.target.value)} />

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Gate Arrival"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
