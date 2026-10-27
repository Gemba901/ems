"use client";

import React from 'react';

export type TaskSubTabType = 'ALL' | 'OVERDUE' | 'NOT_ACKNOWLEDGED' | 'PENDING' | 'APPROVAL_PENDING' | 'COMPLETED';

type Props = {
  activeTab: TaskSubTabType;
  setActiveTab: (tab: TaskSubTabType) => void;
  counts: {
    all: number;
    overdue: number;
    notAcknowledged: number;
    pending: number;
    approvalPending: number;
    completed: number;
  };
  source: 'routine' | 'assigned';
  rightContent?: React.ReactNode;
};

export default function TaskHeader({ activeTab, setActiveTab, counts, source, rightContent }: Props) {
  const tabsList = [
    { key: 'ALL', label: 'All', count: counts.all, dotColor: 'bg-slate-400' },
    { key: 'OVERDUE', label: 'Overdue', count: counts.overdue, dotColor: 'bg-rose-500' },
    { key: 'NOT_ACKNOWLEDGED', label: 'Not Acknowledged', count: counts.notAcknowledged, dotColor: 'bg-amber-500' },
    { key: 'PENDING', label: 'Pending', count: counts.pending, dotColor: 'bg-sky-500' },
    { key: 'APPROVAL_PENDING', label: 'Approval Pending', count: counts.approvalPending, dotColor: 'bg-cyan-500' },
    { key: 'COMPLETED', label: 'Completed', count: counts.completed, dotColor: 'bg-emerald-500' },
  ] as const;
  const visibleTabs = source === 'routine'
    ? tabsList.filter((tab) => tab.key !== 'NOT_ACKNOWLEDGED')
    : tabsList;

  return (
    <div className="w-full">
      {/* Sub-tabs Navigation */}
      <div className="flex min-w-0 flex-col gap-3 border-b border-border-app sm:flex-row sm:items-end sm:gap-4">
        <div className="-mx-1 flex min-w-0 flex-1 gap-5 overflow-x-auto px-1 select-none whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 pb-2 pt-1 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive
                  ? 'text-blue-700 border-b-2 border-blue-500'
                  : 'text-slate-500 border-b-2 border-transparent hover:text-slate-800'
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tab.dotColor}`} />
                <span>{tab.label}</span>
                {tab.key !== 'COMPLETED' && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-white text-slate-500 border border-slate-200'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {rightContent && <div className="w-full min-w-0 pb-3 sm:w-auto sm:shrink-0 sm:pb-2">{rightContent}</div>}
      </div>
    </div>
  );
}

