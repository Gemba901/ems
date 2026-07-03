"use client";

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
    <div className={`flex flex-col gap-4 border-b border-border-app ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-1 gap-6 overflow-x-auto select-none whitespace-nowrap">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const dotColor = tab.dotColor ?? 'bg-slate-400';

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`pb-3 text-sm font-semibold flex items-center gap-2 relative transition duration-150 cursor-pointer border-b-2 ${
                  isActive
                    ? 'text-blue-700 border-blue-500'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
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

        {rightContent && <div className="shrink-0 pb-2">{rightContent}</div>}
      </div>
    </div>
  );
}
