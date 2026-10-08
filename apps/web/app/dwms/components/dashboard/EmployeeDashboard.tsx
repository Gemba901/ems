'use client';

import { useState } from 'react';
import type { DwmsEmployeeDashboardResponse } from '@/services/dwms.service';
import PerformanceKpiSelect from './PerformanceKpiSelect';
import PerformanceSortSelect from './PerformanceSortSelect';
import PerformanceScoreboardSearch from './PerformanceScoreboardSearch';
import {
  comparePerformanceKpi,
  formatPerformanceKpiValue,
  getPerformanceKpi,
  getPerformanceKpiValue,
  type PerformanceKpiKey,
  type PerformanceSortDirection,
} from './performanceKpis';

type EmployeeDashboardProps = {
  employeeData: DwmsEmployeeDashboardResponse;
  loggedInUserId: string;
  onSelectEmployee?: (empId: string) => void;
  activeSubTab?: 'insights' | 'team';
};

export default function EmployeeDashboard({
  employeeData,
  loggedInUserId,
  onSelectEmployee,
  activeSubTab = 'insights',
}: EmployeeDashboardProps) {
  const [selectedKpi, setSelectedKpi] = useState<PerformanceKpiKey>('allTasksCompletionRate');
  const [sortDirection, setSortDirection] = useState<PerformanceSortDirection>('desc');
  const [scoreboardSearch, setScoreboardSearch] = useState('');
  const isSelf = employeeData.employee?.id === loggedInUserId;

  if (activeSubTab !== 'team' || !isSelf) return null;

  const activeKpi = getPerformanceKpi(selectedKpi);
  const normalizedSearch = scoreboardSearch.trim().toLowerCase();
  const reportees = [...(employeeData.reporteesPerformance ?? [])]
    .filter((employee) =>
      !normalizedSearch ||
      employee.name.toLowerCase().includes(normalizedSearch) ||
      employee.role.toLowerCase().includes(normalizedSearch) ||
      (employee.departmentName ?? employee.department ?? '').toLowerCase().includes(normalizedSearch),
    )
    .sort((a, b) => comparePerformanceKpi(a, b, selectedKpi, sortDirection));

  const selectKpi = (key: PerformanceKpiKey) => {
    setSelectedKpi(key);
    setSortDirection(getPerformanceKpi(key).direction);
  };

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="border-b border-border-app pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-app">Team Performance Scoreboard</h3>
            <p className="mt-1 text-xs text-muted-app">
              Compare direct and indirect reportees, then select an employee for detailed insights.
            </p>
          </div>
          <PerformanceScoreboardSearch
            value={scoreboardSearch}
            onChange={setScoreboardSearch}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <PerformanceKpiSelect
            value={selectedKpi}
            onChange={selectKpi}
            ariaLabel="Select team scoreboard KPI"
          />
          <PerformanceSortSelect
            value={sortDirection}
            onChange={setSortDirection}
            ariaLabel="Sort team scoreboard"
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-app">
        {sortDirection === 'desc' ? 'Highest to smallest' : 'Smallest to highest'} {activeKpi.label.toLowerCase()}
      </p>
      <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
        {reportees.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-app">
            {normalizedSearch
              ? 'No team members match this search.'
              : 'No team members are linked to this reporting scope.'}
          </div>
        ) : (
          reportees.map((employee, index) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => onSelectEmployee?.(employee.id)}
              aria-label={`View ${employee.name}'s employee performance`}
              className="flex w-full flex-col gap-4 rounded-2xl border border-border-app bg-white p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-row sm:items-center sm:justify-between"
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
                  <span className="block break-words text-[10px] text-muted-app">
                    {employee.departmentName ?? employee.department ?? 'Unassigned'}
                  </span>
                </span>
              </span>
              <span className="flex flex-col border-t border-border-app/40 pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-app">{activeKpi.label}</span>
                <span className="mt-0.5 font-semibold tabular-nums text-text-app">
                  {formatPerformanceKpiValue(getPerformanceKpiValue(employee, selectedKpi), selectedKpi)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
