"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { S1Requirement } from "./S1Requirement";
import { S2SupplierAssessment } from "./S2SupplierAssessment";
import { S3QuoteSelection } from "./S3QuoteSelection";
import { S4SpecificationPO } from "./S4SpecificationPO";
import { S5DeliveryHandover } from "./S5DeliveryHandover";

// Every reachable P02 stage (A01-A12) resolves to one of the S1-S5 screens.
// This page is purely a router/orchestrator — no workflow UI lives here.
// Mirrors the pattern established in apps/web/app/steel/p01/[id]/page.tsx.
//
// S1 (Requirement) covers A01-A02: the order is created at A01_REQUIREMENT_REVIEWED
// and this page shows S1 until material classification (A02) is confirmed, at
// which point the stage itself advances to A02_MATERIAL_TYPE_IDENTIFIED and the
// router moves straight to S2 — no acknowledgement flag needed since there's no
// shared terminal stage between the two screens (unlike S2/S3/S4 below).
export default function SteelSourcingOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  // Tracks whether the user has acknowledged S2's completion card (shown
  // right after A04 is saved) so "Continue to S3" can hand off without
  // inventing a client-side stage — the server stage (A04_SUPPLIER_RISK_REVIEWED)
  // doesn't change at that point. Mirrors the pattern used in P01's router.
  const [s2Acknowledged, setS2Acknowledged] = useState(false);
  // Same pattern for S3's completion card (shown after A06).
  const [s3Acknowledged, setS3Acknowledged] = useState(false);
  // Same pattern for S4's completion card (shown after A08).
  const [s4Acknowledged, setS4Acknowledged] = useState(false);

  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["steel-sourcing-order", params.id],
    queryFn: () => SteelSourcingService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    retry: (failureCount, err) => {
      const message = err instanceof Error ? err.message : "";
      if (/not found|forbidden|no employee profile/i.test(message)) return false;
      return failureCount < 2;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", params.id] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !order) {
    const message = error instanceof Error ? error.message : "Something went wrong loading this sourcing order.";
    const isNotFound = /not found/i.test(message);
    const isForbidden = /forbidden|no employee profile/i.test(message);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Link href="/steel/p02" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to sourcing orders
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">
              {isNotFound ? "Sourcing order not found." : isForbidden ? "You don't have access to this record." : "Couldn't load this sourcing order."}
            </p>
            <p className="text-xs text-slate-400">{message}</p>
            {!isNotFound && !isForbidden && (
              <button
                onClick={() => refetch()}
                className="text-sm font-medium text-slate-700 hover:text-slate-900 underline"
              >
                Retry
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Existing Stock path: A03 jumps the server stage straight to
  // A08_PO_CREATED (supplier assessment/quotes/PO don't apply without a
  // supplier) — S3 and S4 never apply to this path, so it gets its own
  // acknowledgement-gated branch here rather than falling into S4's stage
  // check below (which assumes a real supplier/PO flow happened).
  const isStockJump = order.materialSource === "EXISTING_STOCK" && order.stage === "A08_PO_CREATED";

  // S1 (P02-A01/A02) — no acknowledgement flag needed; see note above.
  if (order.stage === "A01_REQUIREMENT_REVIEWED") {
    return <S1Requirement order={order} token={accessToken!} onRefresh={refresh} />;
  }

  // S2 (P02-A03/A04, or A03 only for the Existing Stock path)
  if (
    order.stage === "A02_MATERIAL_TYPE_IDENTIFIED" ||
    order.stage === "A03_SUPPLIER_CHECKED" ||
    (order.stage === "A04_SUPPLIER_RISK_REVIEWED" && !s2Acknowledged) ||
    (isStockJump && !s2Acknowledged)
  ) {
    return (
      <S2SupplierAssessment
        order={order}
        token={accessToken!}
        onRefresh={() => {
          if (order.stage === "A04_SUPPLIER_RISK_REVIEWED" || isStockJump) setS2Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S3 (P02-A05/A06) — same acknowledgement pattern as S2. Never reached for
  // the Existing Stock path (isStockJump goes straight to S5 below).
  if (
    !isStockJump &&
    ((order.stage === "A04_SUPPLIER_RISK_REVIEWED" && s2Acknowledged) ||
      order.stage === "A05_QUOTATIONS_COLLECTED" ||
      (order.stage === "A06_SUPPLIER_SELECTED" && !s3Acknowledged))
  ) {
    return (
      <S3QuoteSelection
        order={order}
        token={accessToken!}
        onRefresh={() => {
          if (order.stage === "A06_SUPPLIER_SELECTED") setS3Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S4 (P02-A07/A08) — same acknowledgement pattern as S2/S3. Never reached
  // for the Existing Stock path (isStockJump goes straight to S5 below,
  // since A08_PO_CREATED was reached by skipping, not by a real PO).
  if (
    !isStockJump &&
    ((order.stage === "A06_SUPPLIER_SELECTED" && s3Acknowledged) ||
      order.stage === "A07_SPEC_CONFIRMED" ||
      (order.stage === "A08_PO_CREATED" && !s4Acknowledged))
  ) {
    return (
      <S4SpecificationPO
        order={order}
        token={accessToken!}
        onRefresh={() => {
          if (order.stage === "A08_PO_CREATED") setS4Acknowledged(true);
          refresh();
        }}
      />
    );
  }

  // S5 (P02-A09/A10/A11/A12) — the final screen, through CLOSED. No
  // acknowledgement flag needed: there is no further screen to hand off to.
  return <S5DeliveryHandover order={order} token={accessToken!} />;
}
