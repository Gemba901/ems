"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { PlanningDocument } from "./PlanningDocument";

// P01 has two screens: /steel/p01/new (the compact create/edit form, covering
// A01-A11 in one submission) and this route (the generated planning document,
// A11_PLAN_COMMUNICATED / A12_PLAN_RELEASED). Any plan that hasn't reached
// A11 yet is still mid-creation and is sent back to the form to continue.
export default function SteelPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: plan, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["steel-plan", params.id],
    queryFn: () => SteelService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-plan", params.id] });

  useEffect(() => {
    if (plan && plan.stage !== "A11_PLAN_COMMUNICATED" && plan.stage !== "A12_PLAN_RELEASED") {
      router.replace(`/steel/p01/new?plan=${plan.id}`);
    }
  }, [plan, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !plan) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "This production plan could not be loaded."}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
          </Button>
          <Link href="/steel/p01">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Production Plans
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (plan.stage !== "A11_PLAN_COMMUNICATED" && plan.stage !== "A12_PLAN_RELEASED") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <PlanningDocument plan={plan} token={accessToken!} onRefresh={refresh} />;
}
