"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SimsService } from "@/services/sims.service";
import { KpiCard, ChartCard } from "@/components/sims/sims-ui";
import {
  Lightbulb, Clock, CheckCircle2, AlertCircle,
  ClipboardList, BarChart2, Users, Archive, ChevronRight,
} from "lucide-react";
import {
  computeStatusChartData, computeCategoryChartData, StatusDonutChart, CategoryBarChart,
  RecentActivityTable, TopContributors, DepartmentLeaderboard, StatusCountStrip,
} from "./shared";

const QUICK_LINKS = [
  { label: "Review Queue",     href: "/sims/queue",       icon: ClipboardList, accent: "bg-amber-50",  iconColor: "text-amber-600"  },
  { label: "Analytics",        href: "/sims/analytics",   icon: BarChart2,     accent: "bg-indigo-50", iconColor: "text-indigo-600" },
  { label: "Committee Report", href: "/sims/committees",  icon: Users,         accent: "bg-emerald-50",iconColor: "text-emerald-600"},
  { label: "Closed",           href: "/sims/archived",    icon: Archive,       accent: "bg-slate-100", iconColor: "text-slate-600"  },
];

export default function AdminDashboard() {
  const { user, accessToken } = useAuthStore();

  const { data: allRes, isLoading: loading } = useQuery({
    queryKey: ["sims-all", "dashboard"],
    queryFn: () => SimsService.getAll(accessToken!, { limit: 500 }),
    enabled: !!accessToken,
  });
  const suggestions = useMemo(() => allRes?.data ?? [], [allRes]);

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
    const total = suggestions.length;
    const pending = suggestions.filter((s) =>
      ["WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status),
    ).length;
    const approved = suggestions.filter((s) =>
      s.status === "APPROVED_FOR_IMPLEMENTATION" || s.status === "IMPLEMENTED",
    ).length;
    const onHold = suggestions.filter((s) => s.status === "ON_HOLD").length;
    return { total, pending, approved, onHold };
  }, [suggestions]);

  const statusData = useMemo(() => computeStatusChartData(suggestions), [suggestions]);
  const categoryData = useMemo(() => computeCategoryChartData(suggestions), [suggestions]);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <KpiCard label="Total" value={loading ? "—" : kpis.total} sub="Org-wide suggestions" icon={<Lightbulb className="h-5 w-5 text-blue-600" />} accent="bg-blue-50" />
        <KpiCard label="Pending" value={loading ? "—" : kpis.pending} sub={kpis.pending > 0 ? "need attention" : "all clear"} icon={<Clock className="h-5 w-5 text-amber-500" />} accent="bg-amber-50" />
        <KpiCard label="Approved" value={loading ? "—" : kpis.approved} sub="Approved / implemented" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-50" />
        <KpiCard label="On Hold" value={loading ? "—" : kpis.onHold} sub={kpis.onHold > 0 ? "paused" : "none"} icon={<AlertCircle className="h-5 w-5 text-orange-500" />} accent="bg-orange-50" />
      </div>

      {/* Per-status breakdown — org-wide suggestions, every status incl. Selected for SGA */}
      <StatusCountStrip suggestions={suggestions} />

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.label}
            href={q.href}
            className="flex items-center gap-2 sm:gap-3 bg-white border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
          >
            <div className={`h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${q.accent}`}>
              <q.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${q.iconColor}`} />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-800 flex-1 line-clamp-1">{q.label}</span>
            <ChevronRight className="hidden sm:block h-4 w-4 text-slate-300 shrink-0" />
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Status Breakdown" subtitle="Org-wide suggestions by current status">
          <StatusDonutChart data={statusData} />
        </ChartCard>
        <ChartCard title="Category Mix" subtitle="Org-wide suggestions by QCDSMT category">
          <CategoryBarChart data={categoryData} />
        </ChartCard>
      </div>

      {/* Recent activity + leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <RecentActivityTable
            suggestions={suggestions}
            showAuthor
            showDepartment
            viewAllHref="/sims/all"
            viewAllLabel="View all"
            emptyText="No suggestions submitted yet"
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
