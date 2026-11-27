"use client";

import { Button } from "@/components/ui/button";
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
    { key: 'ALL', label: 'All', count: counts.all, dotColor: 'bg-muted-foreground' },
    { key: 'OVERDUE', label: 'Overdue', count: counts.overdue, dotColor: 'bg-danger' },
    { key: 'NOT_ACKNOWLEDGED', label: 'Not Acknowledged', count: counts.notAcknowledged, dotColor: 'bg-warning' },
    { key: 'PENDING', label: 'Pending', count: counts.pending, dotColor: 'bg-info' },
    { key: 'APPROVAL_PENDING', label: 'Approval Pending', count: counts.approvalPending, dotColor: 'bg-info' },
    { key: 'COMPLETED', label: 'Completed', count: counts.completed, dotColor: 'bg-success' },
  ] as const;
  const visibleTabs = source === 'routine'
    ? tabsList.filter((tab) => tab.key !== 'NOT_ACKNOWLEDGED')
    : tabsList;

  return (
    <div className="w-full">
      {/* Sub-tabs Navigation */}
      <div className="flex min-w-0 flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:gap-4">
        <div className="-mx-1 flex min-w-0 flex-1 gap-5 overflow-x-auto px-1 select-none whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Button
                variant="ghost"
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 pb-2 pt-1 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${isActive
                  ? 'text-info border-b-2 border-info'
                  : 'text-muted-foreground border-b-2 border-transparent hover:text-foreground'
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tab.dotColor}`} />
                <span>{tab.label}</span>
                {tab.key !== 'COMPLETED' && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive
                    ? 'bg-info-subtle text-info border border-info'
                    : 'bg-card text-muted-foreground border border-border'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        {rightContent && <div className="w-full min-w-0 pb-3 sm:w-auto sm:shrink-0 sm:pb-2">{rightContent}</div>}
      </div>
    </div>
  );
}

