'use client';

import { useState } from 'react';
import type { DwmsOverviewDashboardResponse } from '@/services/dwms.service';
import PerformanceKpiSelect from './PerformanceKpiSelect';
import PerformanceSortSelect from './PerformanceSortSelect';
import {
  comparePerformanceKpi,
  formatPerformanceKpiValue,
  getPerformanceKpi,
  getPerformanceKpiValue,
  type PerformanceKpiKey,
  type PerformanceSortDirection,
} from './performanceKpis';

type OverviewDashboardProps = {
  overviewData: DwmsOverviewDashboardResponse;
  onSelectDepartment: (deptId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
};

function rankingDescription(key: PerformanceKpiKey, direction = getPerformanceKpi(key).direction) {
  const kpi = getPerformanceKpi(key);
  return `${direction === 'desc' ? 'Highest to smallest' : 'Smallest to highest'} ${kpi.label.toLowerCase()}`;
}

export default function OverviewDashboard({ overviewData, onSelectDepartment, onSelectEmployee }: OverviewDashboardProps) {
  const [heatmapKpi, setHeatmapKpi] = useState<PerformanceKpiKey>('completionRate');
  const [scoreboardKpi, setScoreboardKpi] = useState<PerformanceKpiKey>('completionRate');
  const [scoreboardSortDirection, setScoreboardSortDirection] = useState<PerformanceSortDirection>('desc');
  const departments = [...(overviewData.departmentCompliance ?? [])].sort((a, b) => comparePerformanceKpi(a, b, heatmapKpi));
  const employees = [...(overviewData.employeeScoreboard ?? [])].sort((a, b) => comparePerformanceKpi(a, b, scoreboardKpi, scoreboardSortDirection));
  const maxDepartmentValue = Math.max(0, ...departments.map((department) => {
    const value = getPerformanceKpiValue(department, heatmapKpi);
    return value != null && Number.isFinite(value) ? value : 0;
  }));
  const heatmapKpiLabel = getPerformanceKpi(heatmapKpi).label;

  const selectScoreboardKpi = (key: PerformanceKpiKey) => {
    setScoreboardKpi(key);
    setScoreboardSortDirection(getPerformanceKpi(key).direction);
  };

  return (
    <div className="space-y-6">
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-app">Department Heatmap</h3>
            <p className="mt-1 text-xs text-muted-app">Click to inspect specific department insights</p>
          </div>
          <PerformanceKpiSelect
            value={heatmapKpi}
            onChange={setHeatmapKpi}
            ariaLabel="Select department heatmap KPI"
          />
        </div>
        <p className="mb-4 mt-3 text-xs text-muted-app">{rankingDescription(heatmapKpi)}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((department) => {
            const value = getPerformanceKpiValue(department, heatmapKpi);
            const percentage = heatmapKpi === 'completionRate' || heatmapKpi === 'completedOnTime';
            const barWidth = value == null || !Number.isFinite(value) ? 0 : percentage
              ? Math.min(100, Math.max(0, value))
              : maxDepartmentValue > 0 ? Math.min(100, (value / maxDepartmentValue) * 100) : 0;
            const barColor = value == null || !Number.isFinite(value) ? 'bg-slate-300' : percentage
              ? value != null && value >= 80 ? 'bg-emerald-500' : value != null && value >= 50 ? 'bg-amber-500' : 'bg-rose-500'
              : 'bg-blue-500';

            return (
              <button
                key={department.id}
                type="button"
                onClick={() => onSelectDepartment(department.id)}
                aria-label={`View ${department.name} department performance`}
                className="group flex min-w-0 flex-col gap-2 rounded-xl border border-border-app bg-white p-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <span className="flex items-start justify-between gap-3 text-xs font-semibold">
                  <span className="break-words transition group-hover:text-accent-app">{department.name}</span>
                  <span className="shrink-0 tabular-nums">{formatPerformanceKpiValue(value, heatmapKpi)}</span>
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-border-app">
                  <span className={`block h-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                </span>
                <span className="mt-1 text-[10px] text-muted-app">{heatmapKpiLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-app pb-3">
          <h3 className="font-semibold text-text-app">Scoreboard &amp; Leaderboard</h3>
          <div className="flex flex-wrap items-center gap-2">
            <PerformanceKpiSelect
              value={scoreboardKpi}
              onChange={selectScoreboardKpi}
              ariaLabel="Select employee leaderboard KPI"
            />
            <PerformanceSortSelect
              value={scoreboardSortDirection}
              onChange={setScoreboardSortDirection}
              ariaLabel="Sort employee leaderboard"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-app">{rankingDescription(scoreboardKpi, scoreboardSortDirection)}</p>
        <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
          {employees.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-app">No active records.</div>
          ) : (
            employees.map((employee, index) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => onSelectEmployee(employee.id)}
                aria-label={`View ${employee.name}'s employee performance`}
                className="flex w-full flex-col gap-4 rounded-2xl border border-border-app bg-white p-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-app text-[10px] font-bold text-muted-app">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-1 text-xs text-text-app">
                      <span className="font-semibold">{employee.name}</span>
                      <span className="text-[10px] text-muted-app">• {employee.role}</span>
                    </span>
                    <span className="block break-words text-[10px] text-muted-app">{employee.department} • {employee.email}</span>
                  </span>
                </span>
                <span className="flex flex-col border-t border-border-app/40 pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-app">{getPerformanceKpi(scoreboardKpi).label}</span>
                  <span className="mt-0.5 font-semibold tabular-nums text-text-app">
                    {formatPerformanceKpiValue(getPerformanceKpiValue(employee, scoreboardKpi), scoreboardKpi)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
