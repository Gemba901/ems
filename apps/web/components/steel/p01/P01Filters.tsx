"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  SteelPlanStage,
  SteelPlanOverallStatus,
  OrderPriority,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/services/steel.service";

const STATUS_OPTIONS: SteelPlanOverallStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "RELEASED", "CANCELLED"];
const PRIORITY_OPTIONS: OrderPriority[] = ["NORMAL", "URGENT", "EXPORT", "PROJECT", "STOCK_REPLENISHMENT"];

export interface P01FiltersState {
  search: string;
  stage: SteelPlanStage | "";
  status: SteelPlanOverallStatus | "";
  priority: OrderPriority | "";
  scheduledOnly: boolean;
  sortBy: "createdAt" | "plannedStartDate";
  sortOrder: "asc" | "desc";
}

interface Props {
  value: P01FiltersState;
  onChange: (next: P01FiltersState) => void;
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// The backend's search only matches plan number, customer name, and sales
// order number (apps/api/.../steel.service.ts getAll) — no product/grade
// search field exists, so that isn't claimed here. Priority, scheduled-only,
// and sort are all real, backend-supported query params (QuerySteelPlansDto)
// tucked into an advanced panel rather than cluttering the primary row.
export function P01Filters({ value, onChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const advancedActive = value.priority !== "" || value.scheduledOnly || value.sortBy !== "createdAt";

  function set<K extends keyof P01FiltersState>(key: K, v: P01FiltersState[K]) {
    onChange({ ...value, [key]: v });
  }

  function clearAdvanced() {
    onChange({ ...value, priority: "", scheduledOnly: false, sortBy: "createdAt", sortOrder: "desc" });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by plan number, customer, or sales order..."
          className="pl-9"
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          value={value.stage}
          onChange={(e) => set("stage", e.target.value as SteelPlanStage | "")}
        >
          <option value="">All stages</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={value.status}
          onChange={(e) => set("status", e.target.value as SteelPlanOverallStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <Button
          type="button"
          size="sm"
          variant={advancedActive ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters {advancedActive ? "•" : "+"}
        </Button>

        {advancedActive && (
          <button
            type="button"
            onClick={clearAdvanced}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
            Clear advanced
          </button>
        )}
      </div>

      {advancedOpen && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Priority</label>
            <select
              className={selectClass}
              value={value.priority}
              onChange={(e) => set("priority", e.target.value as OrderPriority | "")}
            >
              <option value="">Any</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={value.scheduledOnly}
              onChange={(e) => set("scheduledOnly", e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Scheduled plans only
          </label>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Sort by</label>
            <select
              className={selectClass}
              value={value.sortBy}
              onChange={(e) => set("sortBy", e.target.value as "createdAt" | "plannedStartDate")}
            >
              <option value="createdAt">Created date</option>
              <option value="plannedStartDate">Production schedule date</option>
            </select>
            <select
              className={selectClass}
              value={value.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value as "asc" | "desc")}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
