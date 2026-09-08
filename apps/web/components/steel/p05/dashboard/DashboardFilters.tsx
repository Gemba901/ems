"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { FurnaceService } from "@/services/steel-furnace.service";
import type { MeltingDashboardRange } from "@/services/steel-melting.service";

export interface DashboardFiltersState {
  range: MeltingDashboardRange;
  furnaceId: string;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersState = { range: "TODAY", furnaceId: "" };

const RANGE_OPTIONS: { value: MeltingDashboardRange; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "7D", label: "Last 7 Days" },
  { value: "30D", label: "Last 30 Days" },
];

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

// Compact, shop-floor-friendly filter bar — range + furnace only, applied
// across every dashboard section server-side (GET /steel/melting/dashboard).
export function DashboardFilters({ value, onChange }: { value: DashboardFiltersState; onChange: (next: DashboardFiltersState) => void }) {
  const { accessToken } = useAuthStore();
  const { data: furnaces } = useQuery({
    queryKey: ["furnaces", "all"],
    queryFn: () => FurnaceService.getAll(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className={selectClass}
        value={value.range}
        onChange={(e) => onChange({ ...value, range: e.target.value as MeltingDashboardRange })}
      >
        {RANGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <select
        className={selectClass}
        value={value.furnaceId}
        onChange={(e) => onChange({ ...value, furnaceId: e.target.value })}
      >
        <option value="">All Furnaces</option>
        {(furnaces ?? []).map((f) => (
          <option key={f.id} value={f.id}>{f.code} — {f.name}</option>
        ))}
      </select>
    </div>
  );
}
