"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { S2ProductSpecification } from "./S2ProductSpecification";
import { S3StockFulfilment } from "./S3StockFulfilment";
import { S4FeasibilityRoute } from "./S4FeasibilityRoute";
import { S5PlanPreparation } from "./S5PlanPreparation";
import { S6PlanRelease } from "./S6PlanRelease";

// Every reachable P01 stage (A01-A12) resolves to one of the S1-S6 screens.
// This page is purely a router/orchestrator — no workflow UI lives here.
export default function SteelPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  // Tracks whether the user has acknowledged S3's completion card (shown
  // right after the A06 decision) so "Continue to S4" can hand off to S4
  // without needing a fake client-side stage — the server stage
  // (A06_STOCK_DECISION_MADE) doesn't change at that point.
  const [s3Acknowledged, setS3Acknowledged] = useState(false);
  // Same pattern for S4's completion card (shown after A09).
  const [s4Acknowledged, setS4Acknowledged] = useState(false);

  const { data: plan, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["steel-plan", params.id],
    queryFn: () => SteelService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-plan", params.id] });

  // A01 (S1) is owned by /steel/p01/new, which already supports resuming an
  // in-progress plan via ?plan=<id>. A plan can only be at A01 if S1's own
  // priority step hasn't been confirmed yet, so redirect there instead of
  // rendering anything on this route.
  useEffect(() => {
    if (plan?.stage === "A01_DEMAND_CAPTURED") {
      router.replace(`/steel/p01/new?plan=${plan.id}`);
    }
  }, [plan?.stage, plan?.id, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !plan) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">
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

  if (plan.stage === "A01_DEMAND_CAPTURED") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // S2 (P01-A03/A04)
  if (plan.stage === "A02_PRIORITY_CONFIRMED" || plan.stage === "A03_PRODUCT_CONFIRMED") {
    return <S2ProductSpecification plan={plan} token={accessToken!} onRefresh={refresh} />;
  }

  // S3 (P01-A05/A06) — A06_STOCK_DECISION_MADE is included so the
  // completion card renders once (whether just decided or resumed after a
  // refresh); "Continue to S4" acknowledges it locally so S4 (below) takes
  // over without inventing a new server stage.
  if (
    plan.stage === "A04_SPEC_CONFIRMED" ||
    plan.stage === "A05_STOCK_CHECKED" ||
    (plan.stage === "A06_STOCK_DECISION_MADE" && !s3Acknowledged)
  ) {
    return (
      <S3StockFulfilment
        plan={plan}
        token={accessToken!}
        onRefresh={() => {
          if (plan.stage === "A06_STOCK_DECISION_MADE") setS3Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S4 (P01-A07/A08/A09) — same acknowledgement pattern as S3.
  if (
    plan.stage === "A06_STOCK_DECISION_MADE" ||
    plan.stage === "A07_ROUTE_SELECTED" ||
    plan.stage === "A08_MATERIAL_CHECKED" ||
    (plan.stage === "A09_CAPACITY_CHECKED" && !s4Acknowledged)
  ) {
    return (
      <S4FeasibilityRoute
        plan={plan}
        token={accessToken!}
        onRefresh={() => {
          if (plan.stage === "A09_CAPACITY_CHECKED") setS4Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S5 (P01-A10/A11) — covers drafting the production plan and initiating
  // department communication. Once communicate succeeds, plan.stage becomes
  // A11_PLAN_COMMUNICATED, this branch stops matching, and S6 (below) takes
  // over — S6 owns acknowledgement tracking and the release gate, so there's
  // no need for a client-side "leave" flag here.
  if (plan.stage === "A09_CAPACITY_CHECKED" || plan.stage === "A10_PLAN_DRAFTED") {
    return <S5PlanPreparation plan={plan} token={accessToken!} onRefresh={refresh} onContinue={refresh} />;
  }

  // S6 (P01-A12) — department acknowledgement tracking, final release
  // approval, and the released/success state (with "Continue to P02").
  return <S6PlanRelease plan={plan} token={accessToken!} onRefresh={refresh} />;
}
