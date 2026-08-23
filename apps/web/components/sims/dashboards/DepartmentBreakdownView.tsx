"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Suggestion } from "@/services/sims.service";
import { DepartmentWithCount } from "@/services/departments.service";
import { TargetDial } from "@/components/sims/TargetDial";
import { computeStatusChartData, StatusDonutChart } from "./shared";

interface DepartmentGroup {
  id: string;
  name: string;
  employeeCount: number;
  suggestions: Suggestion[];
}

export function DepartmentBreakdownView({
  suggestions,
  loading,
  departments,
}: {
  suggestions: Suggestion[];
  loading: boolean;
  departments: DepartmentWithCount[];
}) {
  const groups = useMemo<DepartmentGroup[]>(() => {
    return departments
      .filter((d) => !d.isPlatformTeam)
      .map((d) => ({
        id: d.id,
        name: d.name,
        employeeCount: d._count.employees,
        suggestions: suggestions.filter((s) => s.departmentId === d.id),
      }))
      .sort((a, b) => b.suggestions.length - a.suggestions.length);
  }, [departments, suggestions]);

  if (loading || departments.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="py-14 text-center text-sm text-slate-400">No departments yet</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {groups.map((g) => {
        const implemented = g.suggestions.filter((s) => s.status === "IMPLEMENTED").length;
        const statusData = computeStatusChartData(g.suggestions);
        return (
          <div key={g.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800 truncate">{g.name}</p>
              <Link
                href={`/sims/all?departmentId=${g.id}`}
                className="flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 shrink-0"
              >
                View
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">
              {g.suggestions.length} suggestion{g.suggestions.length !== 1 ? "s" : ""} · {g.employeeCount} employee{g.employeeCount !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center justify-center">
              <TargetDial implemented={implemented} target={g.employeeCount * 4} title="Implementation target" size={150} />
            </div>
            <StatusDonutChart data={statusData} />
          </div>
        );
      })}
    </div>
  );
}
