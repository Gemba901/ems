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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p03/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p03/ScreenSidebar";
import { SCREEN_TOP_STEPS } from "@/components/steel/p03/screenMap";
import { Loader2, Truck, HelpCircle, Info, ExternalLink } from "lucide-react";

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
  const wasPreselected = !!searchParams.get("sourcingOrderId");
  const noEligibleOrders = readyOrders.length === 0 && !ordersLoading;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
        code="P03"
          icon={Truck}
          title="New Material Intake"
          subtitle="P03-A01 — Record truck/container arrival at the gate against a sourcing order."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[0]} doneCount={0} activeIndex={0} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <Card>
            <CardHeader>
              <CardTitle>Gate Arrival Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-xs px-3 py-2.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Record the vehicle&apos;s arrival at the gate. This intake will be linked to the selected sourcing order.
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Sourcing order <span className="text-red-500">*</span>
                  </label>
                  {wasPreselected && selectedOrder ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm">
                      <p className="font-medium text-slate-900">{selectedOrder.sourcingNumber}</p>
                      <p className="text-xs text-slate-500">Carried over from P02 — {selectedOrder.supplier?.name ?? "No supplier"}</p>
                    </div>
                  ) : (
                    <select
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
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
                  )}
                  {noEligibleOrders && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <div>
                        No sourcing orders are ready for intake yet. A sourcing order must have informed the intake
                        team (P02-A11) or closed handover (P02-A12) before a delivery can be received against it.
                        <Link href="/steel/p02" className="flex items-center gap-1 font-medium text-amber-900 hover:underline mt-1">
                          View sourcing orders <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
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

                <div className="space-y-3 pt-1 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide pt-3">Vehicle / Container</p>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">
                      Vehicle / container number <span className="text-red-500">*</span>
                    </label>
                    <Input placeholder="e.g. MH-12-AB-1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Driver name (optional)</label>
                      <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Transporter (optional)</label>
                      <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide pt-3">Arrival</p>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Arrival date/time (optional)</label>
                    <Input type="datetime-local" value={arrivalDateTime} onChange={(e) => setArrivalDateTime(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-slate-500">Gate entry reference (optional)</label>
                      <Tooltip>
                        <TooltipTrigger render={(p) => <HelpCircle {...p} className="h-3 w-3 text-slate-300" />} />
                        <TooltipContent>An internal gate log reference, if your site tracks one.</TooltipContent>
                      </Tooltip>
                    </div>
                    <Input value={gateEntryRef} onChange={(e) => setGateEntryRef(e.target.value)} />
                  </div>
                </div>

                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Gate Arrival"}
                </Button>
                <p className="text-xs text-slate-400 text-center">Fields marked with * are required to save and proceed.</p>
              </form>
            </CardContent>
          </Card>

          <ScreenSidebar>
            {selectedOrder && (
              <Card>
                <CardHeader>
                  <CardTitle>Sourcing Order Context</CardTitle>
                  <p className="text-sm text-slate-500">From P02 — read only.</p>
                </CardHeader>
                <CardContent>
                  <dl className="text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-400">Sourcing Order</dt>
                      <dd className="text-slate-700 font-medium text-right">{selectedOrder.sourcingNumber}</dd>
                    </div>
                    {selectedOrder.plan?.planNumber && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Production Plan</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.plan.planNumber}</dd>
                      </div>
                    )}
                    {selectedOrder.plan?.customerName && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Customer</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.plan.customerName}</dd>
                      </div>
                    )}
                    {selectedOrder.materialType && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Material Type</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.materialType.replace(/_/g, " ")}</dd>
                      </div>
                    )}
                    {selectedOrder.supplier?.name && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Supplier</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.supplier.name}</dd>
                      </div>
                    )}
                    {selectedOrder.poNumber && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">PO Number</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.poNumber}</dd>
                      </div>
                    )}
                    {selectedOrder.poQuantity != null && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">PO Quantity</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.poQuantity}</dd>
                      </div>
                    )}
                    {selectedOrder.poPrice != null && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">PO Price</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.poPrice} {selectedOrder.poCurrency}</dd>
                      </div>
                    )}
                    {selectedOrder.poDeliveryTerms && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">PO Terms</dt>
                        <dd className="text-slate-700 font-medium text-right">{selectedOrder.poDeliveryTerms}</dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Intake Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {SCREEN_TOP_STEPS[0].map((step, i) => (
                    <li key={step.code} className="flex items-start gap-2.5">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${
                        i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium leading-tight ${i === 0 ? "text-slate-800" : "text-slate-400"}`}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">{step.code} — {i === 0 ? "In Progress" : "Pending"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-500 text-[11px] px-2.5 py-2">
                  <Info className="h-3 w-3 shrink-0" />
                  Complete each step to move forward.
                </div>
              </CardContent>
            </Card>
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
