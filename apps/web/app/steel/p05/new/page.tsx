"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MeltingService, CreateMeltingPayload } from "@/services/steel-melting.service";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { FurnaceService } from "@/services/steel-furnace.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/p05/ScreenHeader";
import { Flame, Loader2 } from "lucide-react";

export default function NewMeltingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}>
      <NewMeltingForm />
    </Suspense>
  );
}

function NewMeltingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [chargePreparationId, setChargePreparationId] = useState(searchParams.get("chargePreparationId") ?? "");
  const [furnaceRefId, setFurnaceRefId] = useState("");
  const [furnaceId, setFurnaceId] = useState("");
  const [plannedHeatRef, setPlannedHeatRef] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [shift, setShift] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Melting can only be started against a closed, charge-numbered preparation (P04-A11/A12).
  const { data: preps, isLoading: prepsLoading } = useQuery({
    queryKey: ["charge-preparations", "closed"],
    queryFn: () => ChargePreparationService.getAll(accessToken!, { status: "CLOSED", limit: 100 }),
    enabled: !!accessToken,
  });
  const closedPreps = (preps?.data ?? []).filter((p) => !!p.chargeNumber);

  const { data: furnaces, isLoading: furnacesLoading } = useQuery({
    queryKey: ["furnaces", "ready"],
    queryFn: () => FurnaceService.getAll(accessToken!, { status: "READY" }),
    enabled: !!accessToken,
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateMeltingPayload) => MeltingService.create(payload, accessToken!),
    onSuccess: (melting) => {
      toast("Melting record created — proceed to confirm furnace readiness.", "success");
      router.push(`/steel/p05/${melting.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!chargePreparationId) {
      setError("Select the closed charge preparation this heat will be melted from.");
      return;
    }

    mutation.mutate({
      chargePreparationId,
      furnaceRefId: furnaceRefId || undefined,
      furnaceId: furnaceId || undefined,
      plannedHeatRef: plannedHeatRef || undefined,
      operatorName: operatorName || undefined,
      shift: shift || undefined,
    });
  };

  const selectedPrep = closedPreps.find((p) => p.id === chargePreparationId);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <ScreenHeader
        icon={Flame}
        title="New Melting Record"
        subtitle="Confirm furnace availability and planned heat to start melting a released charge."
        backHref="/steel/p05"
        backLabel="Back to Melting Records"
      />

      <Card>
        <CardHeader>
          <CardTitle>Charge & Furnace Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Charge preparation</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={chargePreparationId}
                onChange={(e) => setChargePreparationId(e.target.value)}
              >
                <option value="">{prepsLoading ? "Loading closed charge preparations..." : "Select a closed charge preparation..."}</option>
                {closedPreps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.prepNumber} — Charge {p.chargeNumber}
                  </option>
                ))}
              </select>
              {closedPreps.length === 0 && !prepsLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  No charge preparations are ready yet. The charge must be released and the furnace handover closed
                  (P04-A11/A12) before melting can start.
                </p>
              )}
            </div>

            {selectedPrep && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-slate-400 block">Charge ID</span>{selectedPrep.chargeNumber}</div>
                <div><span className="text-xs text-slate-400 block">Planned heat reference</span>{selectedPrep.plannedHeatReference ?? "—"}</div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Furnace (optional)</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={furnaceRefId}
                onChange={(e) => setFurnaceRefId(e.target.value)}
              >
                <option value="">{furnacesLoading ? "Loading furnaces..." : "Select a ready furnace..."}</option>
                {(furnaces ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.name}
                  </option>
                ))}
              </select>
              {(furnaces ?? []).length === 0 && !furnacesLoading && (
                <p className="text-xs text-slate-400 mt-1">
                  No furnace master data set up yet — you can still record a free-text furnace label below.
                </p>
              )}
            </div>
            <Input placeholder="Furnace label (optional, free text)" value={furnaceId} onChange={(e) => setFurnaceId(e.target.value)} />
            <Input placeholder="Planned heat reference (optional)" value={plannedHeatRef} onChange={(e) => setPlannedHeatRef(e.target.value)} />
            <Input placeholder="Operator (optional)" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
            <Input placeholder="Shift (optional)" value={shift} onChange={(e) => setShift(e.target.value)} />

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Melting Record"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
