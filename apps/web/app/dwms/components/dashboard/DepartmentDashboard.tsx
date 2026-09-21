'use client';

import { useState } from 'react';
import type { DwmsDepartmentDashboardResponse } from '@/services/dwms.service';
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

type DepartmentDashboardProps = {
  departmentData: Pick<DwmsDepartmentDashboardResponse, 'departmentName' | 'employeeScoreboard'>;
  onSelectEmployee: (employeeId: string) => void;
};

export default function DepartmentDashboard({ departmentData, onSelectEmployee }: DepartmentDashboardProps) {
  const [selectedKpi, setSelectedKpi] = useState<PerformanceKpiKey>('completionRate');
  const [sortDirection, setSortDirection] = useState<PerformanceSortDirection>('desc');
  const activeKpi = getPerformanceKpi(selectedKpi);
  const employees = [...(departmentData.employeeScoreboard ?? [])].sort((a, b) => comparePerformanceKpi(a, b, selectedKpi, sortDirection));

  const selectKpi = (key: PerformanceKpiKey) => {
    setSelectedKpi(key);
    setSortDirection(getPerformanceKpi(key).direction);
  };

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-app pb-3">
        <h3 className="font-semibold text-text-app">
          {departmentData.departmentName} Performance Scoreboard
        </h3>
        <div className="flex flex-wrap items-center gap-2">
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
      <p className="mt-3 text-xs text-muted-app">
        {sortDirection === 'desc' ? 'Highest to smallest' : 'Smallest to highest'} {activeKpi.label.toLowerCase()}
      </p>
      <div className="mt-3 space-y-3 max-h-96 overflow-y-auto pr-1">
        {employees.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-app">
            No employees registered in this department.
          </div>
        ) : (
          employees.map((employee, index) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => onSelectEmployee(employee.id)}
              aria-label={`View ${employee.name}'s employee performance`}
              className="flex w-full flex-col gap-4 rounded-2xl border border-border-app bg-white p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-bg-app text-muted-app shrink-0">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-1 text-xs text-text-app">
                    <span className="font-semibold">{employee.name}</span>
                    <span className="text-[10px] text-muted-app">• {employee.role}</span>
                  </span>
                  <span className="block break-words text-[10px] text-muted-app">{employee.email}</span>
                </span>
              </span>
              <span className="flex flex-col border-t border-border-app/40 pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
                <span className="font-medium text-muted-app text-[9px] uppercase tracking-wider">{activeKpi.label}</span>
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
