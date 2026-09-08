"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SimsService } from "@/services/sims.service";
import { DepartmentsService } from "@/services/departments.service";
import { SegmentedToggle, OrgOverviewView } from "./shared";
import { DepartmentBreakdownView } from "./DepartmentBreakdownView";

type Scope = "organization" | "department";

export default function AdminDashboard() {
  const { user, accessToken } = useAuthStore();
  const [scope, setScope] = useState<Scope>("organization");

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

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", "dashboard"],
    queryFn: () => DepartmentsService.getAll(accessToken!),
    enabled: !!accessToken && scope === "department",
  });

  const { data: summary } = useQuery({
    queryKey: ["sims-summary"],
    queryFn: () => SimsService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="flex flex-col gap-6 sm:gap-6 pb-8">
      {/* Scope toggle */}
      <div className="order-0 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800">
          {scope === "organization" ? "Organization" : "By Department"}
        </h2>
        <SegmentedToggle
          value={scope}
          onChange={setScope}
          options={[
            { value: "organization", label: "Organization" },
            { value: "department", label: "By Department" },
          ]}
        />
      </div>

      {scope === "organization" ? (
        <OrgOverviewView
          suggestions={suggestions}
          loading={loading}
          leaderboard={leaderboard}
          leaderboardLoading={leaderboardLoading}
          departmentLeaderboard={departmentLeaderboard}
          departmentLeaderboardLoading={departmentLeaderboardLoading}
          currentUserId={user?.userId}
          employeeCount={summary?.organization.employeeCount}
        />
      ) : (
        <DepartmentBreakdownView suggestions={suggestions} loading={loading} departments={departments} />
      )}
    </div>
  );
}
