import { StatusBadge } from "@/components/patterns/StatusBadge";
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
  WAITING_FOR_REVIEW: "bg-muted-foreground",
  UNDER_REVIEW: "bg-muted-foreground",
  ON_HOLD: "bg-muted-foreground",
  SELECTED_FOR_SGA: "bg-info",
  APPROVED_FOR_IMPLEMENTATION: "bg-muted-foreground",
  IMPLEMENTED: "bg-success",
  REJECTED: "bg-muted-foreground",
};

export const neutralPillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground";

export const categoryPillClass =
  "inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

export const weightPillClass =
  "inline-flex items-center rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground";

export function CategoryPill({ category }: { category: SuggestionCategory }) {
  return <span className={categoryPillClass}>{CATEGORY_LABELS[category] ?? category}</span>;
}

export function StatusPill({ status }: { status: SuggestionStatus }) {
  return <StatusBadge status={status} label={STATUS_LABELS[status] ?? status} />;
}

export function StatusInline({ status }: { status: SuggestionStatus }) {
  return <StatusPill status={status} />;
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
  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted-foreground";
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground line-clamp-1">{label}</p>
        <span className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex [&_svg]:h-4 [&_svg]:w-4 ${accent}`}>
          {icon}
        </span>
      </div>
      <div className="my-1 flex items-center gap-1.5">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {trend && <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${trendColor}`} />}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

// ─── Chart Card wrapper ──────────────────────────────────────────────────────

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-5">
      <div className="mb-5">
        <p className="text-sm font-bold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
