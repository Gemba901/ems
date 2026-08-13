"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SteelIntakeStage,
  SteelIntakeStatus,
  INTAKE_STAGE_LABELS,
  INTAKE_STAGE_ORDER,
} from "@/services/material-intake.service";

const STATUS_OPTIONS: SteelIntakeStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "REJECTED", "RELEASED", "CANCELLED"];

export interface P03FiltersState {
  search: string;
  stage: SteelIntakeStage | "";
  status: SteelIntakeStatus | "";
}

export const DEFAULT_P03_FILTERS: P03FiltersState = { search: "", stage: "", status: "" };

interface Props {
  value: P03FiltersState;
  onChange: (next: P03FiltersState) => void;
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// stage/status filter GET /steel/material-intake against the backend's
// real, validated query params (QueryMaterialIntakesDto — search/stage/
// status/page/limit are the only supported filters; there is no
// material-type filter on this endpoint). No client-side filtering happens
// here; every change re-fetches.
export function P03Filters({ value, onChange }: Props) {
  const active = value.search !== "" || value.stage !== "" || value.status !== "";

  function set<K extends keyof P03FiltersState>(key: K, v: P03FiltersState[K]) {
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
                  placeholder="Search intake or vehicle number..."
                  className="pl-9"
                  value={value.search}
                  onChange={(e) => set("search", e.target.value)}
                />
              </div>
            )}
          />
          <TooltipContent>Search by material intake or vehicle/container number.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.stage}
                onChange={(e) => set("stage", e.target.value as SteelIntakeStage | "")}
              >
                <option value="">All stages</option>
                {INTAKE_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{INTAKE_STAGE_LABELS[s]}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter deliveries by where they currently are in the process.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <select
                {...triggerProps}
                className={selectClass}
                value={value.status}
                onChange={(e) => set("status", e.target.value as SteelIntakeStatus | "")}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            )}
          />
          <TooltipContent>Filter by the intake&apos;s current status.</TooltipContent>
        </Tooltip>

        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_P03_FILTERS)}
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
