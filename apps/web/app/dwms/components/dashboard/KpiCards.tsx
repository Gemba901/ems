import type { DwmsDashboardMetrics } from "@/services/dwms.service";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getCompletionRate } from "./completionRate";

type KpiCardsProps = {
  stats: DwmsDashboardMetrics;
  activeTab: "overview" | "department" | "employee";
  periodLabel: string;
};

function formatDuration(minutes: number | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  return minutes >= 60
    ? `${(minutes / 60).toFixed(1)} hrs`
    : `${Math.round(minutes)} min`;
}

export default function KpiCards({ stats, periodLabel }: KpiCardsProps) {
  const completed = stats.completedTasks ?? stats.completedCount;
  const total = stats.totalTasks;
  const rate = getCompletionRate(stats);
  const remaining =
    total != null && completed != null
      ? Math.max(0, total - completed)
      : undefined;
  const cards = [
    {
      label: "All Tasks",
      value: total,
      detail: "In the selected period",
    },
    { label: "Completed", value: completed, detail: "Recorded as completed" },
    {
      label: "Not Completed",
      value: remaining,
      detail: "Includes work awaiting approval",
    },
    {
      label: "Overdue",
      value: stats.overdueTasks ?? stats.overdueCount,
      detail: "Past due and still open",
    },
    {
      label: "Alerts",
      value: stats.alertsCount,
      detail: "Raised for you",
    },
    {
      label: "Completion Rate",
      value: total === 0 ? "—" : `${rate}%`,
      detail: "Weighted by task status",
    },
    {
      label: "Completed on Time",
      value: `${stats.completedOnTimeRate ?? 0}%`,
      detail: "Of completed tasks",
    },
    {
      label: "Avg. Acknowledgement",
      value: formatDuration(stats.avgAcknowledgeTimeMin),
      detail: "From assignment",
    },
  ];
  return (
    <TooltipProvider>
      <section
        aria-label={periodLabel}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className="relative min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <p className="pr-5 text-xs font-medium text-slate-500">{card.label}</p>
            <Tooltip>
              <TooltipTrigger
                render={(triggerProps) => (
                  <button
                    {...triggerProps}
                    type="button"
                    aria-label={`About ${card.label}`}
                    className="absolute right-3 top-3 inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                )}
              />
              <TooltipContent>{card.detail}</TooltipContent>
            </Tooltip>
            <p className="mt-2 whitespace-nowrap text-2xl font-semibold tabular-nums text-slate-900">
              {card.value ?? "—"}
            </p>
          </div>
        ))}
      </section>
    </TooltipProvider>
  );
}
