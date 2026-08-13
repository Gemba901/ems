"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { Loader2 } from "lucide-react";
import { S2IdentifyAssess } from "./S2IdentifyAssess";
import { S3QuoteSelection } from "./S3QuoteSelection";
import { S4SpecificationPO } from "./S4SpecificationPO";
import { S5DeliveryHandover } from "./S5DeliveryHandover";

// Every reachable P02 stage (A01-A12) resolves to one of the S2-S5 screens.
// This page is purely a router/orchestrator — no workflow UI lives here.
// Mirrors the pattern established in apps/web/app/steel/p01/[id]/page.tsx.
//
// A01 has no separate pending action of its own: the sourcing order is
// created directly at stage A01_REQUIREMENT_REVIEWED (unlike P01, where A01
// still needs a follow-up A02 confirmation before the plan is usable), so
// there's no S1 "resume" screen to route back to here — S2 renders for A01
// with its own A02 sub-step already active.
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

  const { data: order, isLoading } = useQuery({
    queryKey: ["steel-sourcing-order", params.id],
    queryFn: () => SteelSourcingService.getById(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", params.id] });

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // Existing Stock path: A03 jumps the server stage straight to
  // A08_PO_CREATED (supplier assessment/quotes/PO don't apply without a
  // supplier) — S3 and S4 never apply to this path, so it gets its own
  // acknowledgement-gated branch here rather than falling into S4's stage
  // check below (which assumes a real supplier/PO flow happened).
  const isStockJump = order.materialSource === "EXISTING_STOCK" && order.stage === "A08_PO_CREATED";

  // S2 (P02-A02/A03/A04, or A02/A03 only for the Existing Stock path)
  if (
    order.stage === "A01_REQUIREMENT_REVIEWED" ||
    order.stage === "A02_MATERIAL_TYPE_IDENTIFIED" ||
    order.stage === "A03_SUPPLIER_CHECKED" ||
    (order.stage === "A04_SUPPLIER_RISK_REVIEWED" && !s2Acknowledged) ||
    (isStockJump && !s2Acknowledged)
  ) {
    return (
      <S2IdentifyAssess
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
