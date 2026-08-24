"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Suggestion, SuggestionStatus } from "@/services/sims.service";
import { DepartmentWithCount } from "@/services/departments.service";
import { STATUS_DOTS } from "@/components/sims/sims-ui";
import { computeStatusChartData } from "./shared";

interface DepartmentGroup {
  id: string;
  name: string;
  employeeCount: number;
  suggestions: Suggestion[];
}

// Severity stops shared with TargetDial's gauge, expressed as a flat lookup
// since this meter only needs the nearest color/label, not an interpolated arc.
const SEVERITY_STOPS: { pct: number; hex: string; label: string }[] = [
  { pct: 0,    hex: "#d03b3b", label: "Needs attention" },
  { pct: 0.33, hex: "#ec835a", label: "Getting started" },
  { pct: 0.66, hex: "#fab219", label: "On track" },
  { pct: 1,    hex: "#0ca30c", label: "Target hit" },
];

function severityFor(pct: number) {
  let current = SEVERITY_STOPS[0];
  for (const stop of SEVERITY_STOPS) {
    if (pct >= stop.pct) current = stop;
  }
  return current;
}

// Compact linear meter — replaces the semi-circle gauge so the target readout
// takes one row instead of half the card.
function ImplementationMeter({ implemented, target }: { implemented: number; target: number }) {
  const rawPct = target > 0 ? implemented / target : 0;
  const pct = Math.min(1, Math.max(0, rawPct));
  const { hex, label } = severityFor(pct);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500">Implementation target</p>
        <p className="text-[11px] font-bold" style={{ color: hex }}>{label}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
          {pct > 0 && (
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct * 100}%`, backgroundColor: hex }}
            />
          )}
        </div>
        <span className="text-xs font-bold text-slate-700 tabular-nums shrink-0 w-9 text-right">
          {target > 0 ? `${Math.round(rawPct * 100)}%` : "—"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{implemented} of {target} implemented</p>
    </div>
  );
}

// Compact part-to-whole bar — replaces the pie donut (deprioritized in favor
// of stacked bars) so the full status breakdown reads in two short rows
// instead of a 220px chart.
function StatusStackedBar({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className="text-[11px] text-slate-400">No suggestions yet</p>;
  }

  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100">
        {data.map((d) => (
          <div
            key={d.name}
            title={`${d.name}: ${d.value}`}
            style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            {d.name} <span className="font-semibold text-slate-700">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="py-14 text-center text-sm text-slate-400">No departments yet</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {groups.map((g) => {
        const implemented = g.suggestions.filter((s) => s.status === "IMPLEMENTED").length;
        const pending = g.suggestions.filter((s) =>
          (["WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"] as SuggestionStatus[]).includes(s.status),
        ).length;
        const statusData = computeStatusChartData(g.suggestions);

        return (
          <div key={g.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
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

            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>{g.suggestions.length} suggestion{g.suggestions.length !== 1 ? "s" : ""}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
              <span>{g.employeeCount} employee{g.employeeCount !== 1 ? "s" : ""}</span>
              {pending > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS.UNDER_REVIEW}`} />
                    {pending} pending
                  </span>
                </>
              )}
            </div>

            <ImplementationMeter implemented={implemented} target={g.employeeCount * 4} />
            <StatusStackedBar data={statusData} />
          </div>
        );
      })}
    </div>
  );
}
