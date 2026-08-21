"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MeltingService, CreateMeltingPayload, toOperatorMessage } from "@/services/steel-melting.service";
import { FurnaceService } from "@/services/steel-furnace.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
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

  // Melting can only be started against a closed, charge-numbered preparation
  // (P04-A11/A12) that isn't already claimed by another heat — filtered
  // server-side (MeltingService.getAvailableChargePreparations), so this
  // list never includes a charge preparation that already has a melting
  // record.
  const { data: closedPreps, isLoading: prepsLoading } = useQuery({
    queryKey: ["melting-available-charge-preparations"],
    queryFn: () => MeltingService.getAvailableChargePreparations(accessToken!),
    enabled: !!accessToken,
  });
  const preps = closedPreps ?? [];

  const { data: furnaces, isLoading: furnacesLoading } = useQuery({
    queryKey: ["furnaces", "ready"],
    queryFn: () => FurnaceService.getAll(accessToken!, { status: "READY" }),
    enabled: !!accessToken,
  });

  // A charge preparation can be melted at most once (chargePreparationId is
  // unique on SteelMelting). The list above doesn't know which closed preps
  // are already spoken for, so check the selected one directly rather than
  // letting the user hit the backend's unique-constraint error on submit.
  const { data: existingMelting, isFetching: checkingExisting } = useQuery({
    queryKey: ["melting-for-charge", chargePreparationId],
    queryFn: () => MeltingService.getAll(accessToken!, { chargePreparationId, limit: 1 }),
    enabled: !!accessToken && !!chargePreparationId,
  });
  const alreadyMelted = existingMelting?.data[0];

  const mutation = useMutation({
    mutationFn: (payload: CreateMeltingPayload) => MeltingService.create(payload, accessToken!),
    onSuccess: (melting) => {
      toast(`Heat ${melting.heatInProcessNumber} started successfully.`, "success");
      router.push(`/steel/p05/${melting.id}`);
    },
    onError: (err: unknown) => setError(toOperatorMessage(err, "We couldn't start this heat. Please try again or contact production support.")),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!chargePreparationId) {
      setError("Select the closed charge preparation this heat will be melted from.");
      return;
    }
    if (alreadyMelted) {
      setError("This charge preparation has already been handed over to melting. Select a different one.");
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

  const selectedPrep = preps.find((p) => p.id === chargePreparationId);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <ScreenHeader
        code="P05"
        icon={Flame}
        title="New Heat"
        subtitle="Confirm furnace availability and planned heat to start melting a released charge."
        backHref="/steel/p05"
        backLabel="Back to Heats"
      />

      <Card>
        <CardHeader>
          <CardTitle>Charge & Furnace Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                <p className="font-semibold">Cannot start this heat</p>
                <p className="mt-0.5">{error}</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Charge preparation</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={chargePreparationId}
                onChange={(e) => {
                  const id = e.target.value;
                  setChargePreparationId(id);
                  const prep = preps.find((p) => p.id === id);
                  if (prep?.plannedHeatReference && !plannedHeatRef) setPlannedHeatRef(prep.plannedHeatReference);
                }}
              >
                <option value="">{prepsLoading ? "Loading closed charge preparations..." : "Select a closed charge preparation..."}</option>
                {preps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.prepNumber} — Charge {p.chargeNumber}
                  </option>
                ))}
              </select>
              {preps.length === 0 && !prepsLoading && (
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

            {checkingExisting && chargePreparationId && (
              <p className="text-xs text-slate-400">Checking whether this charge is already being melted...</p>
            )}
            {alreadyMelted && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
                This charge preparation was already handed to melting as{" "}
                <Link href={`/steel/p05/${alreadyMelted.id}`} className="font-medium underline">
                  {alreadyMelted.heatInProcessNumber}
                </Link>
                . Select a different charge preparation.
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

            <Button type="submit" disabled={mutation.isPending || !!alreadyMelted} className="w-full gap-2">
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting heat...
                </>
              ) : (
                "Start Heat"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
