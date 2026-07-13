import React from 'react';
import RadialProgress from './RadialProgress';
import type { DwmsDashboardMetrics } from '@/services/dwms.service';

type KpiCardsProps = {
  stats: DwmsDashboardMetrics;
  activeTab: 'overview' | 'department' | 'employee';
};

function formatDuration(minutes: number | undefined) {
  if (minutes === undefined || minutes === null || isNaN(minutes)) return '0 min';
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hrs`;
  }
  return `${Math.round(minutes)} min`;
}

export default function KpiCards({ stats }: KpiCardsProps) {
  const tasksPerformedTodayPercent = stats.tasksPerformedTodayPercent ?? stats.completionRate ?? 100;
  const avgAcknowledgeTimeMin = stats.avgAcknowledgeTimeMin ?? 0;
  const overdueTasks = stats.overdueTasks ?? 0;
  const avgCloseTimeMin = stats.avgCloseTimeMin ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Tasks Performed Today */}
      <div className="rounded-3xl border border-border-app bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-app uppercase tracking-wide">Tasks Performed Today</p>
          <h3 className="text-2xl font-bold tracking-tight text-text-app">
            {tasksPerformedTodayPercent}%
          </h3>
          <p className="text-[10px] text-muted-app">Completed scheduled tasks</p>
        </div>
        <RadialProgress percent={tasksPerformedTodayPercent} size={56} />
      </div>

      {/* 3. Time Taken to Acknowledge a Task */}
      <div className="rounded-3xl border border-border-app bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-app uppercase tracking-wide">Avg Acknowledge Time</p>
          <h3 className="text-2xl font-bold tracking-tight text-text-app">
            {formatDuration(avgAcknowledgeTimeMin)}
          </h3>
          <p className="text-[10px] text-muted-app">From assignment to start</p>
        </div>
        <div className="p-3 rounded-2xl bg-blue-150/40 dark:bg-blue-950/40 text-accent-app">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
      </div>

      {/* 3. Number of Overdue Tasks */}
      <div className="rounded-3xl border border-border-app bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-app uppercase tracking-wide">Overdue Tasks</p>
          <h3 className="text-2xl font-bold tracking-tight text-text-app">
            {overdueTasks}
          </h3>
          <p className="text-[10px] text-muted-app">Past due and still open</p>
        </div>
        <div className="p-3 rounded-2xl bg-rose-50 text-rose-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>
      </div>

      {/* 4. Average Time to Complete a Task */}
      <div className="rounded-3xl border border-border-app bg-white p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-app uppercase tracking-wide">Avg Completion Time</p>
          <h3 className="text-2xl font-bold tracking-tight text-text-app">
            {formatDuration(avgCloseTimeMin)}
          </h3>
          <p className="text-[10px] text-muted-app">From start to completion</p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
