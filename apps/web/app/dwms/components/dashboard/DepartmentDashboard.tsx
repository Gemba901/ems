import React from 'react';
import type { DwmsDepartmentDashboardResponse } from '@/services/dwms.service';

type DepartmentDashboardProps = {
  departmentData: Pick<DwmsDepartmentDashboardResponse, 'departmentName' | 'employeeScoreboard'>;
};

function formatDuration(minutes: number | undefined) {
  if (minutes === undefined || minutes === null || isNaN(minutes)) return '0 min';
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hrs`;
  }
  return `${Math.round(minutes)} min`;
}

export default function DepartmentDashboard({ departmentData }: DepartmentDashboardProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Scoreboard List (Main - Full Width) */}
      <div className="lg:col-span-3 rounded-3xl border border-border-app bg-panel-app p-5 shadow-sm backdrop-blur-md">
        <h3 className="font-semibold text-text-app pb-3 border-b border-border-app">
          {departmentData.departmentName} Performance Scoreboard
        </h3>
        <div className="mt-3.5 space-y-3 max-h-96 overflow-y-auto pr-1">
          {departmentData.employeeScoreboard?.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-app">
              No employees registered in this department.
            </div>
          ) : (
            departmentData.employeeScoreboard?.map((e, index) => (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-panel-app border border-border-app gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-bg-app text-muted-app shrink-0">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-text-app">{e.name}</p>
                    <p className="text-[10px] text-muted-app">{e.email} • {e.role}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-5 text-[10.5px] border-t border-border-app/40 pt-2 sm:border-t-0 sm:pt-0">
                  <div className="flex flex-col text-left sm:text-right">
                    <span className="font-medium text-muted-app text-[9px] uppercase tracking-wider">Tasks Today</span>
                    <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9.5px] w-fit sm:ml-auto mt-0.5 ${
                      (e.tasksPerformedTodayPercent ?? 0) >= 80 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                      (e.tasksPerformedTodayPercent ?? 0) >= 50 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-450'
                    }`}>
                      {e.tasksPerformedTodayPercent ?? 0}%
                    </span>
                  </div>
                  <div className="flex flex-col text-left sm:text-center w-16">
                    <span className="font-medium text-muted-app text-[9px] uppercase tracking-wider">Ack Speed</span>
                    <span className="font-semibold text-text-app mt-0.5">{formatDuration(e.avgAcknowledgeTimeMin)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
