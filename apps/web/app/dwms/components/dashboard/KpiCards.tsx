import type { DwmsDashboardMetrics } from "@/services/dwms.service";

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
  const rate = stats.tasksPerformedTodayPercent ?? stats.completionRate;
  const remaining =
    total != null && completed != null
      ? Math.max(0, total - completed)
      : undefined;
  const cards = [
    {
      label: "Scheduled tasks",
      value: total,
      detail: "In the selected period",
    },
    { label: "Completed", value: completed, detail: "Recorded as completed" },
    {
      label: "Not completed",
      value: remaining,
      detail: "Includes work awaiting approval",
    },
    {
      label: "Overdue",
      value: stats.overdueTasks ?? stats.overdueCount,
      detail: "Past due and still open",
    },
    {
      label: "Open alerts",
      value: stats.openAlertsCount ?? stats.openAlerts,
      detail: "Unresolved alerts",
    },
    {
      label: "Completion rate",
      value:
        total === 0 || !Number.isFinite(rate) ? "—" : `${Math.round(rate)}%`,
      detail: "Completed / scheduled tasks",
    },
    {
      label: "Avg. acknowledgement",
      value: formatDuration(stats.avgAcknowledgeTimeMin),
      detail: "From assignment",
    },
    {
      label: "Avg. completion",
      value: formatDuration(stats.avgCloseTimeMin),
      detail: "From acknowledgement or creation",
    },
  ];
  return (
    <section
      aria-label={periodLabel}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-xs font-medium text-slate-500">{card.label}</p>
          <p className="my-1 text-2xl font-semibold tabular-nums text-slate-900">
            {card.value ?? "—"}
          </p>
          <p className="text-xs leading-4 text-slate-500">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}
