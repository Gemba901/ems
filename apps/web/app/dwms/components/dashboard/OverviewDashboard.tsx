import React from 'react';
import type { DwmsOverviewDashboardResponse } from '@/services/dwms.service';

type OverviewDashboardProps = {
  overviewData: DwmsOverviewDashboardResponse;
  onSelectDepartment: (deptId: string) => void;
};

function formatDuration(minutes: number | undefined) {
  if (minutes === undefined || minutes === null || isNaN(minutes)) return '0 min';
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hrs`;
  }
  return `${Math.round(minutes)} min`;
}

export default function OverviewDashboard({ overviewData, onSelectDepartment }: OverviewDashboardProps) {
  return (
    <div className="space-y-6">
      {/* 1. Department Heatmap */}
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-3xl border border-border-app bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-text-app mb-2">Department Heatmap</h3>
          <p className="text-xs text-muted-app mb-4">Click to inspect specific department insights</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overviewData.departmentCompliance?.map((d) => {
              const rate = d.tasksPerformedTodayPercent ?? d.completionRate ?? 100;
              let colorBg = 'bg-rose-500';
              if (rate >= 80) colorBg = 'bg-emerald-500';
              else if (rate >= 50) colorBg = 'bg-amber-500';

              return (
                <div
                  key={d.id}
                  onClick={() => onSelectDepartment(d.id)}
                  className="group cursor-pointer flex flex-col gap-2 rounded-xl border border-border-app bg-white p-3.5 transition hover:bg-slate-50"
                >
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="group-hover:text-accent-app transition">{d.name}</span>
                    <span>{rate}%</span>
                  </div>
                  <div className="w-full bg-border-app h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full ${colorBg}`} style={{ width: `${rate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-muted-app mt-1">
                    <span>Ack: {formatDuration(d.avgAcknowledgeTimeMin)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Leaderboard (Full Width) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Scoreboard List */}
        <div className="lg:col-span-3 rounded-3xl border border-border-app bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-text-app pb-3 border-b border-border-app">
            Scoreboard & Leaderboard
          </h3>
          <div className="mt-3.5 space-y-3 max-h-96 overflow-y-auto pr-1">
            {overviewData.employeeScoreboard?.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-app">
                No active records.
              </div>
            ) : (
              overviewData.employeeScoreboard?.map((e, index) => (
                <div key={e.id} className="flex flex-col gap-4 rounded-2xl border border-border-app bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      index === 0 ? 'bg-yellow-500 text-zinc-50 shadow-sm' :
                      index === 1 ? 'bg-slate-350 text-text-app shadow-sm dark:bg-slate-700' :
                      index === 2 ? 'bg-amber-700 text-zinc-50 shadow-sm' : 'bg-bg-app text-muted-app'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-text-app">{e.name}</p>
                      <p className="text-[10px] text-muted-app">{e.department} • {e.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-[10.5px] border-t border-border-app/40 pt-2 sm:border-t-0 sm:pt-0">
                    <div className="flex flex-col text-left sm:text-right">
                      <span className="font-medium text-muted-app text-[9px] uppercase tracking-wider">Tasks Today</span>
                      <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9.5px] w-fit sm:ml-auto mt-0.5 ${
                        (e.tasksPerformedTodayPercent ?? 0) >= 80 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                        (e.tasksPerformedTodayPercent ?? 0) >= 50 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-450'
                      }`}>
                        {e.tasksPerformedTodayPercent ?? 0}%
                      </span>
                    </div>
                    <div className="flex flex-col text-left sm:text-center w-14">
                      <span className="font-medium text-muted-app text-[9px] uppercase tracking-wider">Ack</span>
                      <span className="font-semibold text-text-app mt-0.5">{formatDuration(e.avgAcknowledgeTimeMin)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
