"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { HeatApprovalService, CreateHeatApprovalPayload } from "@/services/steel-heat-approval.service";
import { MeltingService } from "@/services/steel-melting.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { FlaskConical, Loader2 } from "lucide-react";

export default function NewHeatApprovalPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}>
      <NewHeatApprovalForm />
    </Suspense>
  );
}

function NewHeatApprovalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [meltingId, setMeltingId] = useState(searchParams.get("meltingId") ?? "");
  const [sampleRef, setSampleRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Heat approval can only be started against a melting record that has
  // completed refining handover (P05-A14/CLOSED).
  const { data: meltings, isLoading: meltingsLoading } = useQuery({
    queryKey: ["meltings", "handed-over"],
    queryFn: () => MeltingService.getAll(accessToken!, { status: "CLOSED", stage: "A14_HANDOVER_TO_REFINING", limit: 100 }),
    enabled: !!accessToken,
  });
  const eligibleMeltings = meltings?.data ?? [];

  const mutation = useMutation({
    mutationFn: (payload: CreateHeatApprovalPayload) => HeatApprovalService.create(payload, accessToken!),
    onSuccess: (heatApproval) => {
      toast("Heat approval record created — proceed to analyze the sample.", "success");
      router.push(`/steel/p06/${heatApproval.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!meltingId) {
      setError("Select the heat that has completed refining handover.");
      return;
    }

    mutation.mutate({
      meltingId,
      sampleRef: sampleRef || undefined,
    });
  };

  const selectedMelting = eligibleMeltings.find((m) => m.id === meltingId);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <ScreenHeader
        code="P06"
        icon={FlaskConical}
        title="New Heat Approval Record"
        subtitle="Take a liquid steel sample from a heat that has completed refining handover to start chemistry approval."
        backHref="/steel/p06"
        backLabel="Back to Heat Approval Records"
      />

      <Card>
        <CardHeader>
          <CardTitle>Heat & Sample</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Heat (melting record)</label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={meltingId}
                onChange={(e) => setMeltingId(e.target.value)}
              >
                <option value="">{meltingsLoading ? "Loading heats..." : "Select a heat handed over to refining..."}</option>
                {eligibleMeltings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.heatInProcessNumber} — Charge {m.chargeNumberSnapshot}
                  </option>
                ))}
              </select>
              {eligibleMeltings.length === 0 && !meltingsLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  No heats are ready yet. The melt must complete refining handover (P05-A14) before chemistry
                  approval can start.
                </p>
              )}
            </div>

            {selectedMelting && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-slate-400 block">Charge ID</span>{selectedMelting.chargeNumberSnapshot}</div>
                <div><span className="text-xs text-slate-400 block">Output weight</span>{selectedMelting.outputWeightTonnes !== null ? `${selectedMelting.outputWeightTonnes} t` : "—"}</div>
              </div>
            )}

            <Input placeholder="Sample reference (optional)" value={sampleRef} onChange={(e) => setSampleRef(e.target.value)} />

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Heat Approval Record"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
