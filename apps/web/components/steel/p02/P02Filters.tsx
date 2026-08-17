"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SteelSourcingStage,
  SteelSourcingStatus,
  SteelMaterialType,
  SOURCING_STAGE_LABELS,
  SOURCING_STAGE_ORDER,
} from "@/services/steel-sourcing.service";

const STATUS_OPTIONS: SteelSourcingStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "PO_ISSUED", "CLOSED", "CANCELLED"];
const MATERIAL_TYPE_OPTIONS: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];

export interface P02FiltersState {
  search: string;
  stage: SteelSourcingStage | "";
  status: SteelSourcingStatus | "";
  materialType: SteelMaterialType | "";
}

export const DEFAULT_P02_FILTERS: P02FiltersState = { search: "", stage: "", status: "", materialType: "" };

interface Props {
  value: P02FiltersState;
  onChange: (next: P02FiltersState) => void;
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// stage/status/materialType filter GET /steel/sourcing against the backend's
// real, validated query params (QuerySteelSourcingOrdersDto). No client-side
// filtering happens here; every change re-fetches.
export function P02Filters({ value, onChange }: Props) {
  const active = value.search !== "" || value.stage !== "" || value.status !== "" || value.materialType !== "";

  function set<K extends keyof P02FiltersState>(key: K, v: P02FiltersState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Tooltip>
            <TooltipTrigger
              render={(triggerProps) => (
                <div {...triggerProps} className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    aria-label="Search sourcing orders or PO number"
                    placeholder="Search sourcing orders or PO number..."
                    className="pl-9"
                    value={value.search}
                    onChange={(e) => set("search", e.target.value)}
                  />
                </div>
              )}
            />
            <TooltipContent>Search by sourcing order or purchase order number.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={(triggerProps) => (
                <select
                  {...triggerProps}
                  aria-label="Filter by stage"
                  className={selectClass}
                  value={value.stage}
                  onChange={(e) => set("stage", e.target.value as SteelSourcingStage | "")}
                >
                  <option value="">All stages</option>
                  {SOURCING_STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>{SOURCING_STAGE_LABELS[s]}</option>
                  ))}
                </select>
              )}
            />
            <TooltipContent>Filter orders by their current workflow stage.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={(triggerProps) => (
                <select
                  {...triggerProps}
                  aria-label="Filter by status"
                  className={selectClass}
                  value={value.status}
                  onChange={(e) => set("status", e.target.value as SteelSourcingStatus | "")}
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              )}
            />
            <TooltipContent>Filter by the order&apos;s current status.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={(triggerProps) => (
                <select
                  {...triggerProps}
                  aria-label="Filter by material type"
                  className={selectClass}
                  value={value.materialType}
                  onChange={(e) => set("materialType", e.target.value as SteelMaterialType | "")}
                >
                  <option value="">All materials</option>
                  {MATERIAL_TYPE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                  ))}
                </select>
              )}
            />
            <TooltipContent>Filter by the material type being sourced.</TooltipContent>
          </Tooltip>

          {active && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_P02_FILTERS)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
