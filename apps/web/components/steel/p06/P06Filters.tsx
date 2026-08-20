"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SteelHeatApprovalStage,
  SteelHeatApprovalStatus,
  HEAT_APPROVAL_STAGE_LABELS,
  HEAT_APPROVAL_STAGE_ORDER,
} from "@/services/steel-heat-approval.service";

const STATUS_OPTIONS: SteelHeatApprovalStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];

export interface P06FiltersState {
  search: string;
  stage: SteelHeatApprovalStage | "";
  status: SteelHeatApprovalStatus | "";
}

export const DEFAULT_P06_FILTERS: P06FiltersState = { search: "", stage: "", status: "" };

interface Props {
  value: P06FiltersState;
  onChange: (next: P06FiltersState) => void;
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// stage/status filter GET /steel/heat-approval against the backend's real,
// validated query params (QueryHeatApprovalsDto). No client-side filtering
// happens here; every change re-fetches.
export function P06Filters({ value, onChange }: Props) {
  const active = value.search !== "" || value.stage !== "" || value.status !== "";

  function set<K extends keyof P06FiltersState>(key: K, v: P06FiltersState[K]) {
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
                  placeholder="Search approval number or heat number..."
                  className="pl-9"
                  value={value.search}
                  onChange={(e) => set("search", e.target.value)}
                />
              </div>
            )}
          />
          <TooltipContent>Search by approval number or heat number.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.stage}
                onChange={(e) => set("stage", e.target.value as SteelHeatApprovalStage | "")}
              >
                <option value="">All stages</option>
                {HEAT_APPROVAL_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{HEAT_APPROVAL_STAGE_LABELS[s]}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter records by where they currently are in the process.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.status}
                onChange={(e) => set("status", e.target.value as SteelHeatApprovalStatus | "")}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter by the record&apos;s current status.</TooltipContent>
        </Tooltip>

        {active && (
          <button type="button" onClick={() => onChange(DEFAULT_P06_FILTERS)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
