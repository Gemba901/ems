"use client";

import React from 'react';

export type TaskSubTabType = 'ALL' | 'OVERDUE' | 'NOT_ACKNOWLEDGED' | 'PENDING' | 'COMPLETED';

type Props = {
  activeTab: TaskSubTabType;
  setActiveTab: (tab: TaskSubTabType) => void;
  counts: {
    all: number;
    overdue: number;
    notAcknowledged: number;
    pending: number;
    completed: number;
  };
};

export default function TaskHeader({ activeTab, setActiveTab, counts }: Props) {
  const tabsList = [
    { key: 'ALL', label: 'All', count: counts.all, dotColor: 'bg-slate-400' },
    { key: 'OVERDUE', label: 'Overdue', count: counts.overdue, dotColor: 'bg-rose-500' },
    { key: 'NOT_ACKNOWLEDGED', label: 'Not Acknowledged', count: counts.notAcknowledged, dotColor: 'bg-amber-500' },
    { key: 'PENDING', label: 'Pending', count: counts.pending, dotColor: 'bg-sky-500' },
    { key: 'COMPLETED', label: 'Completed', count: counts.completed, dotColor: 'bg-emerald-500' },
  ] as const;

  return (
    <div className="w-full">
      {/* Sub-tabs Navigation */}
      <div className="flex gap-5 overflow-x-auto border-b border-border-app select-none whitespace-nowrap">
        {tabsList.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex shrink-0 cursor-pointer items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition duration-150 ${isActive
                ? 'text-blue-700 border-b-2 border-blue-500'
                : 'text-slate-500 border-b-2 border-transparent hover:text-slate-800'
                }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tab.dotColor}`} />
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive 
                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                : 'bg-white text-slate-500 border border-slate-200'
                }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
