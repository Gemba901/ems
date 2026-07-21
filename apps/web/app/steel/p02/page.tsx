"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  SteelSourcingService,
  SteelSourcingStage,
  SteelSourcingStatus,
  SOURCING_STAGE_LABELS,
  SOURCING_STAGE_ORDER,
} from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Truck, Loader2 } from "lucide-react";

const STATUS_STYLES: Record<SteelSourcingStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  PO_ISSUED: "bg-indigo-50 text-indigo-700",
  CLOSED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function SteelSourcingOrdersPage() {
  const { accessToken } = useAuthStore();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<SteelSourcingStage | "">("");
  const [status, setStatus] = useState<SteelSourcingStatus | "">("");
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ["steel-sourcing-summary"],
    queryFn: () => SteelSourcingService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["steel-sourcing-orders", search, stage, status, page],
    queryFn: () =>
      SteelSourcingService.getAll(accessToken!, {
        search: search || undefined,
        stage: stage || undefined,
        status: status || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Raw Material Sourcing</h1>
            <p className="text-sm text-slate-500">P02 — Supplier Selection & Purchase Order</p>
          </div>
        </div>
        <Link href="/steel/p02/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Sourcing Order
          </Button>
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">Total</p><p className="text-2xl font-bold">{summary.total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">In Progress</p><p className="text-2xl font-bold">{summary.byStatus?.IN_PROGRESS ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">PO Issued</p><p className="text-2xl font-bold">{summary.byStatus?.PO_ISSUED ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">Closed</p><p className="text-2xl font-bold">{summary.byStatus?.CLOSED ?? 0}</p></CardContent></Card>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search sourcing orders or PO number..."
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={stage}
          onChange={(e) => { setStage(e.target.value as SteelSourcingStage | ""); setPage(1); }}
        >
          <option value="">All stages</option>
          {SOURCING_STAGE_ORDER.map((s) => <option key={s} value={s}>{SOURCING_STAGE_LABELS[s]}</option>)}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value as SteelSourcingStatus | ""); setPage(1); }}
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sourcing Orders</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-2">
              {data?.data.map((order) => (
                <div key={order.id} className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
                  <div>
                    <Link href={`/steel/p02/${order.id}`} className="font-medium text-slate-900 hover:underline">
                      {order.sourcingNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{order.plan?.planNumber ?? "—"} · {order.supplier?.name ?? "No supplier yet"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{SOURCING_STAGE_LABELS[order.stage]}</span>
                    <Badge className={STATUS_STYLES[order.status]}>{order.status}</Badge>
                  </div>
                </div>
              ))}
              {data?.data.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">No sourcing orders yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}