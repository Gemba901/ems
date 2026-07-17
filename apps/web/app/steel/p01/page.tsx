"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  SteelService,
  SteelPlanStage,
  SteelPlanOverallStatus,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Factory, Loader2 } from "lucide-react";

const STATUS_STYLES: Record<SteelPlanOverallStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function SteelPlansPage() {
  const { accessToken } = useAuthStore();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<SteelPlanStage | "">("");
  const [status, setStatus] = useState<SteelPlanOverallStatus | "">("");
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ["steel-summary"],
    queryFn: () => SteelService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["steel-plans", search, stage, status, page],
    queryFn: () =>
      SteelService.getAll(accessToken!, {
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
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Production Plans</h1>
            <p className="text-sm text-slate-500">P01 — Demand, Sales Order & Production Planning</p>
          </div>
        </div>
        <Link href="/steel/p01/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Production Plan
          </Button>
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">Total</p><p className="text-2xl font-bold">{summary.total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">In Progress</p><p className="text-2xl font-bold">{summary.byStatus?.IN_PROGRESS ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">On Hold</p><p className="text-2xl font-bold">{summary.byStatus?.ON_HOLD ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-slate-400">Released</p><p className="text-2xl font-bold">{summary.byStatus?.RELEASED ?? 0}</p></CardContent></Card>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search plans..."
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={stage}
          onChange={(e) => { setStage(e.target.value as SteelPlanStage | ""); setPage(1); }}
        >
          <option value="">All stages</option>
          {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value as SteelPlanOverallStatus | ""); setPage(1); }}
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Plans</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-2">
              {data?.data.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
                  <div>
                    <Link href={`/steel/p01/${plan.id}`} className="font-medium text-slate-900 hover:underline">
                      {plan.planNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{plan.customerName || plan.dealerName || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{STAGE_LABELS[plan.stage]}</span>
                    <Badge className={STATUS_STYLES[plan.status]}>{plan.status}</Badge>
                  </div>
                </div>
              ))}
              {data?.data.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">No production plans yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}