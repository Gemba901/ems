"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";

export interface KpiItem {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Tailwind icon-badge tone, e.g. "text-blue-700 bg-blue-50". */
  tone: string;
  /** Short caption under the value. */
  context?: string;
  /** Optional tooltip text on the whole card. */
  tooltip?: string;
}

interface Props {
  items: KpiItem[];
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  errorMessage?: string;
}

function KpiCard({ item, isLoading }: { item: KpiItem; isLoading: boolean }) {
  const Icon = item.icon;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        ) : (
          <p className="text-3xl font-bold leading-none text-slate-900">{item.value}</p>
        )}
        {item.context && <p className="text-[11px] text-slate-400">{item.context}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Canonical KPI card row — replaces P01/P02/P03/P05/P06's near-identical
 * KpiCards components. Callers still compute every value from real backend
 * data (this component only renders whatever `items` it's given); loading/
 * error/tooltip behavior is now consistent everywhere instead of drifting
 * per copy (P01's old version, for example, had no tooltips at all).
 */
export function KpiCardRow({ items, isLoading, isError, isFetching, onRetry, errorMessage }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message={errorMessage ?? "Could not load summary."} />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) =>
          item.tooltip ? (
            <Tooltip key={item.label}>
              <TooltipTrigger render={(triggerProps) => <div {...triggerProps}><KpiCard item={item} isLoading={isLoading} /></div>} />
              <TooltipContent>{item.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <KpiCard key={item.label} item={item} isLoading={isLoading} />
          ),
        )}
      </div>
    </TooltipProvider>
  );
}
