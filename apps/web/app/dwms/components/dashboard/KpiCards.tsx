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

export default function KpiCards({ stats, activeTab, periodLabel }: KpiCardsProps) {
  const total = stats.totalTasks ?? 0;
  const completionRates = stats.completionRateByCategory;
  const categoryTotals = stats.taskCategoryBreakdown;
  const categoryRate = (
    category: "GOOD_PRACTICE" | "JOB_RESPONSIBILITY" | "ASSIGNED_TASK",
  ) =>
    categoryTotals?.[category]?.total
      ? `${completionRates?.[category] ?? 0}%`
      : "—";
  const scopeAlertCards =
    activeTab === "department"
      ? [
          {
            label: "Departmental Alerts",
            value: stats.departmentAlertsCount,
            detail: "Alerts raised directly to the selected department",
          },
        ]
      : activeTab === "overview"
        ? [
            {
              label: "Departmental Alerts",
              value: stats.departmentAlertsCount,
              detail: "Alerts raised directly to departments in the organization",
            },
            {
              label: "Organisational Alerts",
              value: stats.organizationAlertsCount,
              detail: "Alerts raised directly to the entire organization",
            },
          ]
        : [];
  const cards = [
    {
      label: "Total Alerts",
      value: stats.alertsCount,
      detail: "Alerts raised in the selected period",
    },
    ...scopeAlertCards,
    {
      label: "Acknowledged Alerts",
      value: stats.acknowledgedAlertsCount,
      detail: "Selected-period alerts that were acknowledged",
    },
    {
      label: "Total Abnormalities",
      value: stats.abnormalitiesCount,
      detail: "Abnormalities raised in the selected period",
    },
    {
      label: "Avg. Assigned Task Acknowledgement",
      value: formatDuration(stats.avgAssignedTaskAcknowledgeTimeMin),
      detail: "Average time to acknowledge assigned tasks",
    },
    {
      label: "All Completion Rate",
      value: total === 0 ? "—" : `${getCompletionRate(stats)}%`,
      detail: "Completion rate across all task categories",
    },
    {
      label: "Good Practices Completion",
      value: categoryRate("GOOD_PRACTICE"),
      detail: "Good Practices completion rate",
    },
    {
      label: "Job Responsibility Completion",
      value: categoryRate("JOB_RESPONSIBILITY"),
      detail: "Job Responsibility completion rate",
    },
    {
      label: "Assigned Tasks Completion",
      value: categoryRate("ASSIGNED_TASK"),
      detail: "Assigned Tasks completion rate",
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
