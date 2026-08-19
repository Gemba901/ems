"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, History, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard, SteelMeltingStatus } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  CLOSED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  DRAFT: "bg-slate-100 text-slate-600",
};

const PAGE_SIZE = 10;

function formatMinutes(min: number | null) {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Backed by the dashboard's own bounded (≤200) recent-heats list for the
// selected period — search/status filter and pagination happen client-side
// over that already-fetched set rather than issuing further requests. For
// exhaustive search beyond this bound, "All Melting Records" (steel-melting
// service's existing paginated GET /steel/melting) remains available.
export function RecentHeatHistoryTable({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SteelMeltingStatus | "">("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const rows = data?.recentHeats ?? [];
    return rows.filter((h) => {
      if (status && h.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !h.heatInProcessNumber.toLowerCase().includes(q) &&
          !(h.chargeNumberSnapshot ?? "").toLowerCase().includes(q) &&
          !(h.furnace?.code ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateSearch(v: string) {
    setSearch(v);
    setPage(1);
  }
  function updateStatus(v: SteelMeltingStatus | "") {
    setStatus(v);
    setPage(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          Recent Heat History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search heat, charge, or furnace..." className="pl-9" value={search} onChange={(e) => updateSearch(e.target.value)} />
          </div>
          <select
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            value={status}
            onChange={(e) => updateStatus(e.target.value as SteelMeltingStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="CLOSED">Closed</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load heat history." />
        ) : pageRows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No heats match this period/filter.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b">
                    <th className="py-1.5 pr-3">Heat ID</th>
                    <th className="py-1.5 pr-3">Date</th>
                    <th className="py-1.5 pr-3">Furnace</th>
                    <th className="py-1.5 pr-3 text-right">Input</th>
                    <th className="py-1.5 pr-3 text-right">Output</th>
                    <th className="py-1.5 pr-3 text-right">Loss</th>
                    <th className="py-1.5 pr-3 text-right">Yield</th>
                    <th className="py-1.5 pr-3 text-right">Cycle</th>
                    <th className="py-1.5 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((h) => (
                    <tr key={h.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <Link href={`/steel/p05/${h.id}`} className="font-medium text-slate-900 hover:underline">
                          {h.heatInProcessNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{h.handoverToRefiningAt ? new Date(h.handoverToRefiningAt).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-3 text-slate-600">{h.furnace?.code ?? "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{h.materialInput !== null ? h.materialInput.toFixed(1) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{h.output !== null ? h.output.toFixed(1) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{h.materialLoss !== null ? h.materialLoss.toFixed(1) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-medium text-slate-900">{h.yieldPercent !== null ? `${h.yieldPercent.toFixed(1)}%` : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{formatMinutes(h.cycleDurationMinutes)}</td>
                      <td className="py-2 pr-3">
                        <Badge className={STATUS_STYLES[h.status] ?? "bg-slate-100 text-slate-600"}>{h.status.replace(/_/g, " ")}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-400">Page {page} of {pageCount} · {filtered.length} heats</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
