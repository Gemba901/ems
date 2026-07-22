"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SimsService } from "@/services/sims.service";
import { KpiCard, ChartCard } from "@/components/sims/sims-ui";
import { Lightbulb, Clock, CheckCircle2, Sparkles, Building2 } from "lucide-react";
import {
  computeStatusChartData, computeCategoryChartData, StatusDonutChart, CategoryBarChart,
  RecentActivityTable, TopContributors, DepartmentLeaderboard, StatusCountStrip,
} from "./shared";

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuthStore();

  const { data: mine = [], isLoading: loading } = useQuery({
    queryKey: ["sims-mine"],
    queryFn: () => SimsService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  const { data: summary = null, isLoading: summaryLoading } = useQuery({
    queryKey: ["sims-summary"],
    queryFn: () => SimsService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery({
    queryKey: ["sims-leaderboard"],
    queryFn: () => SimsService.getLeaderboard(accessToken!),
    enabled: !!accessToken,
  });

  const { data: departmentLeaderboard = [], isLoading: departmentLeaderboardLoading } = useQuery({
    queryKey: ["sims-department-leaderboard"],
    queryFn: () => SimsService.getDepartmentLeaderboard(accessToken!),
    enabled: !!accessToken,
  });

  const kpis = useMemo(() => {
    const total = mine.length;
    const pending = mine.filter((s) =>
      ["WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status),
    ).length;
    const approved = mine.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const implemented = mine.filter((s) => s.status === "IMPLEMENTED").length;
    return { total, pending, approved, implemented };
  }, [mine]);

  const statusData = useMemo(() => computeStatusChartData(mine), [mine]);
  const categoryData = useMemo(() => computeCategoryChartData(mine), [mine]);

  const orgApprovalRate = useMemo(() => {
    const total = summary?.organization.total ?? 0;
    const approved =
      (summary?.organization.byStatus["APPROVED_FOR_IMPLEMENTATION"] ?? 0) +
      (summary?.organization.byStatus["IMPLEMENTED"] ?? 0);
    return total > 0 ? Math.round((approved / total) * 100) : 0;
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <KpiCard label="Your Suggestions" value={loading ? "—" : kpis.total} sub="Total submitted" icon={<Lightbulb className="h-5 w-5 text-blue-600" />} accent="bg-blue-50" />
        <KpiCard label="Pending Review" value={loading ? "—" : kpis.pending} sub="Awaiting a decision" icon={<Clock className="h-5 w-5 text-amber-500" />} accent="bg-amber-50" />
        <KpiCard label="Approved" value={loading ? "—" : kpis.approved} sub="For implementation" icon={<CheckCircle2 className="h-5 w-5 text-teal-600" />} accent="bg-teal-50" />
        <KpiCard label="Implemented" value={loading ? "—" : kpis.implemented} sub="Shipped ideas" icon={<Sparkles className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-50" />
      </div>

      {/* Per-status breakdown — your own suggestions, every status incl. Selected for SGA */}
      <StatusCountStrip suggestions={mine} />

      {/* Org pulse strip — org-wide context, kept visually distinct from personal KPIs */}
      <div className="bg-slate-900 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Organisation pulse</p>
        </div>
        <p className="text-sm text-slate-300">
          <span className="font-bold text-white">{summaryLoading ? "—" : summary?.organization.total ?? 0}</span> suggestions submitted org-wide
        </p>
        <p className="text-sm text-slate-300">
          <span className="font-bold text-white">{summaryLoading ? "—" : `${orgApprovalRate}%`}</span> approval rate
        </p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Your Status Breakdown" subtitle="Where your suggestions stand today">
          <StatusDonutChart data={statusData} />
        </ChartCard>
        <ChartCard title="Your Categories" subtitle="QCDSMT category mix of your ideas">
          <CategoryBarChart data={categoryData} />
        </ChartCard>
      </div>

      {/* Recent activity + leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <RecentActivityTable
            suggestions={mine}
            viewAllHref="/sims/my-suggestions"
            viewAllLabel="View all my suggestions"
            emptyText="You haven't submitted any ideas yet"
          />
        </div>
        <div className="space-y-4">
          <TopContributors ranked={leaderboard} loading={leaderboardLoading} currentUserId={user?.userId} />
          <DepartmentLeaderboard ranked={departmentLeaderboard} loading={departmentLeaderboardLoading} />
        </div>
      </div>
    </div>
  );
}
