"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SimsService } from "@/services/sims.service";
import { KpiCard, ChartCard } from "@/components/sims/sims-ui";
import { Users, Clock, PauseCircle, CheckCircle2, ClipboardList, ArrowRight } from "lucide-react";
import {
  computeStatusChartData, computeCategoryChartData, StatusDonutChart, CategoryBarChart,
  RecentActivityTable, TopContributors, DepartmentLeaderboard, StatusCountStrip,
  SegmentedToggle, OrgOverviewView,
} from "./shared";
import { TargetDial } from "@/components/sims/TargetDial";

type Scope = "department" | "organization";

export default function HodDashboard() {
  const { user, accessToken } = useAuthStore();
  const [scope, setScope] = useState<Scope>("department");

  const { data: deptRes, isLoading: loading } = useQuery({
    queryKey: ["sims-department", "dashboard"],
    queryFn: () => SimsService.getDepartment(accessToken!, { limit: 500 }),
    enabled: !!accessToken,
  });
  const suggestions = useMemo(() => deptRes?.data ?? [], [deptRes]);

  const { data: orgRes, isLoading: orgLoading } = useQuery({
    queryKey: ["sims-all", "dashboard"],
    queryFn: () => SimsService.getAll(accessToken!, { limit: 500 }),
    enabled: !!accessToken && scope === "organization",
  });
  const orgSuggestions = useMemo(() => orgRes?.data ?? [], [orgRes]);

  const { data: summary } = useQuery({
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

  const implementedCount = useMemo(
    () => suggestions.filter((s) => s.status === "IMPLEMENTED").length,
    [suggestions],
  );

  const kpis = useMemo(() => {
    const total = suggestions.length;
    const awaitingReview = suggestions.filter((s) =>
      ["WAITING_FOR_REVIEW", "UNDER_REVIEW"].includes(s.status),
    ).length;
    const onHold = suggestions.filter((s) => s.status === "ON_HOLD").length;
    const approved = suggestions.filter((s) =>
      s.status === "APPROVED_FOR_IMPLEMENTATION" || s.status === "IMPLEMENTED",
    ).length;
    return { total, awaitingReview, onHold, approved };
  }, [suggestions]);

  const statusData = useMemo(() => computeStatusChartData(suggestions), [suggestions]);
  const categoryData = useMemo(() => computeCategoryChartData(suggestions), [suggestions]);

  return (
    <div className="space-y-6">
      {/* Scope toggle — HODs land on their own department by default, but can flip to see
          how other departments are faring. Read-only: no review affordances in org scope. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800">
          {scope === "department" ? "My Department" : "Organization"}
        </h2>
        <SegmentedToggle
          value={scope}
          onChange={setScope}
          options={[
            { value: "department", label: "My Department" },
            { value: "organization", label: "Organization" },
          ]}
        />
      </div>

      {scope === "department" ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <KpiCard label="Department Total" value={loading ? "—" : kpis.total} sub="All suggestions" icon={<Users className="h-5 w-5 text-blue-600" />} accent="bg-blue-50" />
            <KpiCard label="Awaiting Review" value={loading ? "—" : kpis.awaitingReview} sub={kpis.awaitingReview > 0 ? "needs your attention" : "all clear"} icon={<Clock className="h-5 w-5 text-amber-500" />} accent="bg-amber-50" />
            <KpiCard label="On Hold" value={loading ? "—" : kpis.onHold} sub="Paused for clarification" icon={<PauseCircle className="h-5 w-5 text-orange-500" />} accent="bg-orange-50" />
            <KpiCard label="Approved / Implemented" value={loading ? "—" : kpis.approved} sub="Moving forward" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-50" />
          </div>

          {/* Per-status breakdown — department suggestions, every status incl. Selected for SGA */}
          <StatusCountStrip suggestions={suggestions} />

          {/* Review CTA banner */}
          {!loading && kpis.awaitingReview > 0 && (
            <Link
              href="/sims/queue"
              className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3.5 hover:bg-amber-100/70 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-amber-800">
                  {kpis.awaitingReview} suggestion{kpis.awaitingReview !== 1 ? "s" : ""} need{kpis.awaitingReview === 1 ? "s" : ""} your review
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
            </Link>
          )}

          {/* Target dial + charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-center">
              <TargetDial
                implemented={implementedCount}
                target={(summary?.department.employeeCount ?? 0) * 4}
                title="Implementation target (4 per employee)"
              />
            </div>
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <ChartCard title="Status Breakdown" subtitle="Department suggestions by current status">
                <StatusDonutChart data={statusData} />
              </ChartCard>
              <ChartCard title="Category Mix" subtitle="Department suggestions by QCDSMT category">
                <CategoryBarChart data={categoryData} />
              </ChartCard>
            </div>
          </div>

          {/* Recent activity + leaderboards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <RecentActivityTable
                suggestions={suggestions}
                showAuthor
                viewAllHref="/sims/all"
                viewAllLabel="View all"
                emptyText="No suggestions from your department yet"
              />
            </div>
            <div className="space-y-4">
              <TopContributors ranked={leaderboard} loading={leaderboardLoading} currentUserId={user?.userId} />
              <DepartmentLeaderboard ranked={departmentLeaderboard} loading={departmentLeaderboardLoading} />
            </div>
          </div>
        </>
      ) : (
        <OrgOverviewView
          suggestions={orgSuggestions}
          loading={orgLoading}
          leaderboard={leaderboard}
          leaderboardLoading={leaderboardLoading}
          departmentLeaderboard={departmentLeaderboard}
          departmentLeaderboardLoading={departmentLeaderboardLoading}
          currentUserId={user?.userId}
          employeeCount={summary?.organization.employeeCount}
        />
      )}
    </div>
  );
}
