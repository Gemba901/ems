'use client';

import { Button } from "@/components/ui/button";
import { useUrlViewState } from '@/hooks/useUrlViewState';
import { enumParam, textParam } from '@/lib/url-view-state';
import type { DwmsDepartmentDashboardResponse } from '@/services/dwms.service';
import PerformanceKpiSelect from './PerformanceKpiSelect';
import PerformanceSortSelect from './PerformanceSortSelect';
import PerformanceScoreboardSearch from './PerformanceScoreboardSearch';
import {
  performanceKpis,
  comparePerformanceKpi,
  formatPerformanceKpiValue,
  getPerformanceKpi,
  getPerformanceKpiValue,
  type PerformanceKpiKey,
  type PerformanceSortDirection,
} from './performanceKpis';

const scoreboardSchema = {
  kpi: enumParam(
    performanceKpis.map((item) => item.key),
    "allTasksCompletionRate",
  ),
  sort: enumParam(["asc", "desc"] as const, "desc"),
  search: textParam,
};

type DepartmentDashboardProps = {
  departmentData: Pick<DwmsDepartmentDashboardResponse, 'departmentName' | 'employeeScoreboard'>;
  onSelectEmployee: (employeeId: string) => void;
  canSelectEmployee: (employeeId: string) => boolean;
};

export default function DepartmentDashboard({ departmentData, onSelectEmployee, canSelectEmployee }: DepartmentDashboardProps) {
  const { state, update } = useUrlViewState(
    "scoreDepartment",
    scoreboardSchema,
  );
  const {
    kpi: selectedKpi,
    sort: sortDirection,
    search: scoreboardSearch,
  } = state;
  const setSelectedKpi = (kpi: PerformanceKpiKey) => update({ kpi });
  const setSortDirection = (sort: PerformanceSortDirection) => update({ sort });
  const setScoreboardSearch = (search: string) => update({ search });
  const activeKpi = getPerformanceKpi(selectedKpi);
  const normalizedScoreboardSearch = scoreboardSearch.trim().toLowerCase();
  const employees = [...(departmentData.employeeScoreboard ?? [])]
    .filter((employee) =>
      !normalizedScoreboardSearch ||
      employee.name.toLowerCase().includes(normalizedScoreboardSearch) ||
      employee.role.toLowerCase().includes(normalizedScoreboardSearch),
    )
    .sort((a, b) => comparePerformanceKpi(a, b, selectedKpi, sortDirection));

  const selectKpi = (key: PerformanceKpiKey) => {
    setSelectedKpi(key);
    setSortDirection(getPerformanceKpi(key).direction);
  };

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">
            {departmentData.departmentName} Performance Scoreboard
          </h3>
          <PerformanceScoreboardSearch
            value={scoreboardSearch}
            onChange={setScoreboardSearch}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <PerformanceKpiSelect
            value={selectedKpi}
            onChange={selectKpi}
            ariaLabel="Select department scoreboard KPI"
          />
          <PerformanceSortSelect
            value={sortDirection}
            onChange={setSortDirection}
            ariaLabel="Sort department scoreboard"
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {sortDirection === 'desc' ? 'Highest to smallest' : 'Smallest to highest'} {activeKpi.label.toLowerCase()}
      </p>
      <div className="mt-3 space-y-3 max-h-96 overflow-y-auto pr-1">
        {employees.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            {normalizedScoreboardSearch
              ? 'No employees match this name or role.'
              : 'No employees registered in this department.'}
          </div>
        ) : (
          employees.map((employee, index) => {
            const selectable = canSelectEmployee(employee.id);
            return (
              <Button
                variant="ghost"
                key={employee.id}
                type="button"
                disabled={!selectable}
                onClick={() => {
                  if (selectable) onSelectEmployee(employee.id);
                }}
                aria-label={selectable
                  ? `View ${employee.name}'s employee performance`
                  : `${employee.name}'s employee performance is not available`}
                className={`flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${selectable ? 'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info' : 'cursor-default'}`}
              >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-muted text-muted-foreground shrink-0">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-1 text-xs text-foreground">
                    <span className="font-semibold">{employee.name}</span>
                    <span className="text-[10px] text-muted-foreground">• {employee.role}</span>
                  </span>
                  <span className="block break-words text-[10px] text-muted-foreground">{employee.email}</span>
                </span>
              </span>
              <span className="flex flex-col border-t border-border/40 pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
                <span className="font-medium text-muted-foreground text-[9px] uppercase tracking-wider">{activeKpi.label}</span>
                <span className="mt-0.5 font-semibold tabular-nums text-foreground">
                  {formatPerformanceKpiValue(getPerformanceKpiValue(employee, selectedKpi), selectedKpi)}
                </span>
              </span>
              </Button>
            );
          })
        )}
      </div>
    </div>
  );
}
