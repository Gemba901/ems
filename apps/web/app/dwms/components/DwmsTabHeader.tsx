"use client";

import { Button } from "@/components/ui/button";
import React from 'react';

export type DwmsTabItem<T extends string> = {
  key: T;
  label: string;
  dotColor?: string;
  count?: number;
};

type Props<T extends string> = {
  tabs: DwmsTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  rightContent?: React.ReactNode;
  className?: string;
};

export default function DwmsTabHeader<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  rightContent,
  className = '',
}: Props<T>) {
  return (
    <div className={`min-w-0 border-b border-border ${className}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="-mx-1 flex min-w-0 flex-1 gap-5 overflow-x-auto px-1 select-none whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const dotColor = tab.dotColor ?? 'bg-muted-foreground';

            return (
              <Button
                variant="ghost"
                key={tab.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => onTabChange(tab.key)}
                className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 pb-2 pt-1 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${
                  isActive
                    ? 'text-info border-info'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
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
