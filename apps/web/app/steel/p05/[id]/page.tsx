"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MeltingService } from "@/services/steel-melting.service";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { MeltingStickyHeader } from "@/components/steel/p05/MeltingStickyHeader";
import { RecordStatusBanner } from "@/components/steel/p05/RecordStatusBanner";
import { MeltingWorkspaces } from "./MeltingWorkspaces";

export default function MeltingDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: melting, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["melting", params.id],
    queryFn: () => MeltingService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["melting", params.id] });
    toast("Saved", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !melting) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this heat.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p05" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to Heats
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Heat not found." : isForbidden ? "You don't have access to this heat." : "Couldn't load this heat."}
            </p>
            <p className="text-xs text-slate-400">{message}</p>
            {!isNotFound && !isForbidden && (
              <button onClick={() => refetch()} className="text-sm font-medium text-slate-700 hover:text-slate-900 underline">
                Retry
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <MeltingStickyHeader melting={melting} />
      <RecordStatusBanner melting={melting} />
      <MeltingWorkspaces melting={melting} onRefresh={refresh} />
    </div>
  );
}
