import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SuggestionCategory, SuggestionStatus } from "@/services/sims.service";

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  QUALITY: "Quality",
  COST: "Cost",
  DELIVERY: "Delivery",
  SAFETY: "Safety",
  MORALE: "Morale",
  TECHNOLOGY: "Technology",
  UNKNOWN: "Unknown",
};

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW: "Waiting for Review",
  UNDER_REVIEW: "Under Review",
  ON_HOLD: "On Hold",
  SELECTED_FOR_SGA: "Selected for SGA",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  IMPLEMENTED: "Implemented",
  REJECTED: "Rejected",
};

export const STATUS_DOTS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW: "bg-slate-300",
  UNDER_REVIEW: "bg-slate-500",
  ON_HOLD: "bg-slate-400",
  SELECTED_FOR_SGA: "bg-blue-500",
  APPROVED_FOR_IMPLEMENTATION: "bg-slate-700",
  IMPLEMENTED: "bg-emerald-600",
  REJECTED: "bg-slate-300",
};

export const neutralPillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700";

export const categoryPillClass =
  "inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600";

export const weightPillClass =
  "inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white";

export function CategoryPill({ category }: { category: SuggestionCategory }) {
  return <span className={categoryPillClass}>{CATEGORY_LABELS[category] ?? category}</span>;
}

export function StatusPill({ status }: { status: SuggestionStatus }) {
  return (
    <span className={neutralPillClass}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status] ?? "bg-slate-300"}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function StatusInline({ status }: { status: SuggestionStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOTS[status] ?? "bg-slate-300"}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Chart color palettes (shared by Analytics + role dashboards) ──────────

export const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  QUALITY:    "#3b82f6",
  COST:       "#10b981",
  DELIVERY:   "#8b5cf6",
  SAFETY:     "#ef4444",
  MORALE:     "#f59e0b",
  TECHNOLOGY: "#6366f1",
  UNKNOWN:    "#94a3b8",
};

export const STATUS_COLORS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW:          "#94a3b8",
  UNDER_REVIEW:                "#f59e0b",
  ON_HOLD:                     "#f97316",
  SELECTED_FOR_SGA:            "#6366f1",
  APPROVED_FOR_IMPLEMENTATION: "#14b8a6",
  IMPLEMENTED:                 "#10b981",
  REJECTED:                    "#ef4444",
};

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "10px 14px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontSize: "12px",
};

// ─── KPI Card ───────────────────────────────────────────────────────────────

export function KpiCard({ label, value, sub, trend, icon, accent }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "flat"; icon: React.ReactNode; accent: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400";
  return (
    <div className="bg-white border border-slate-100 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between mb-1.5 sm:mb-3">
        <div className={`h-7 w-7 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
          <span className="scale-75 sm:scale-100">{icon}</span>
        </div>
        {trend && <TrendIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${trendColor}`} />}
      </div>
      <p className="text-lg sm:text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] sm:text-xs font-medium text-slate-500 mt-1 sm:mt-0.5 line-clamp-1">{label}</p>
      {sub && <p className="hidden sm:block text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Chart Card wrapper ──────────────────────────────────────────────────────

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
