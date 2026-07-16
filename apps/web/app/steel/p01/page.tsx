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
            <h1 className="text-xl font-bold text-slate-900">Production Planning</h1>
            <p className="text-sm text-slate-500">Process 1 — demand capture through plan release</p>
          </div>
        </div>
        <Link href="/steel/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-slate-500">Total Plans</p>
              <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-slate-500">In Progress</p>
              <p className="text-2xl font-bold text-blue-700">{summary.byStatus.IN_PROGRESS ?? 0}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-slate-500">On Hold</p>
              <p className="text-2xl font-bold text-amber-700">{summary.byStatus.ON_HOLD ?? 0}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-xs text-slate-500">Released</p>
              <p className="text-2xl font-bold text-emerald-700">{summary.byStatus.RELEASED ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search plan #, customer, or sales order..."
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
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={status}
              onChange={(e) => { setStatus(e.target.value as SteelPlanOverallStatus | ""); setPage(1); }}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="RELEASED">Released</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="py-2 pr-4">Plan #</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Stage</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Qty (t)</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((plan) => (
                    <tr key={plan.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <Link href={`/steel/${plan.id}`} className="font-medium text-slate-900 hover:underline">
                          {plan.planNumber}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {plan.customerName || plan.dealerName || plan.projectReference || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">{STAGE_LABELS[plan.stage]}</td>
                      <td className="py-2.5 pr-4">
                        <Badge className={STATUS_STYLES[plan.status]}>{plan.status.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">{plan.requestedQuantityTonnes}</td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data.pagination.pages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    Page {data.pagination.page} of {data.pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-sm">
              No production plans yet. Create one to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
