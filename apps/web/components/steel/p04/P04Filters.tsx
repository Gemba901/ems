"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import {
  SteelChargeStage,
  SteelChargeStatus,
  CHARGE_STAGE_LABELS,
  CHARGE_STAGE_ORDER,
} from "@/services/steel-charge-preparation.service";

const STATUS_OPTIONS: SteelChargeStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];

export interface P04FiltersState {
  search: string;
  stage: SteelChargeStage | "";
  status: SteelChargeStatus | "";
  planId: string;
}

export const DEFAULT_P04_FILTERS: P04FiltersState = { search: "", stage: "", status: "", planId: "" };

interface Props {
  value: P04FiltersState;
  onChange: (next: P04FiltersState) => void;
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// stage/status/planId filter GET /steel/charge-preparation against the
// backend's real, validated query params (QueryChargePreparationsDto). No
// client-side filtering happens here; every change re-fetches.
export function P04Filters({ value, onChange }: Props) {
  const { accessToken } = useAuthStore();
  const active = value.search !== "" || value.stage !== "" || value.status !== "" || value.planId !== "";

  const { data: plans } = useQuery({
    queryKey: ["steel-plans", "for-p04-filter"],
    queryFn: () => SteelService.getAll(accessToken!, { limit: 100 }),
    enabled: !!accessToken,
  });

  function set<K extends keyof P04FiltersState>(key: K, v: P04FiltersState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <div {...triggerProps} className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search preparation or Charge ID..."
                  className="pl-9"
                  value={value.search}
                  onChange={(e) => set("search", e.target.value)}
                />
              </div>
            )}
          />
          <TooltipContent>Search by preparation number or Charge ID.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.stage}
                onChange={(e) => set("stage", e.target.value as SteelChargeStage | "")}
              >
                <option value="">All stages</option>
                {CHARGE_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{CHARGE_STAGE_LABELS[s]}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter preparations by where they currently are in the process.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.status}
                onChange={(e) => set("status", e.target.value as SteelChargeStatus | "")}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter by the preparation&apos;s current status.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.planId}
                onChange={(e) => set("planId", e.target.value)}
              >
                <option value="">All production plans</option>
                {(plans?.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.planNumber}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Show only preparations for one production plan.</TooltipContent>
        </Tooltip>

        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_P04_FILTERS)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
