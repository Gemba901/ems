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
  UNDER_REVIEW: "Under Review",
  ON_HOLD: "On Hold",
  SELECTED_FOR_SGA: "Selected for SGA",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  REJECTED: "Rejected",
};

export const STATUS_DOTS: Record<SuggestionStatus, string> = {
  UNDER_REVIEW: "bg-slate-500",
  ON_HOLD: "bg-slate-400",
  SELECTED_FOR_SGA: "bg-blue-500",
  APPROVED_FOR_IMPLEMENTATION: "bg-slate-700",
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
