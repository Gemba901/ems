"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type {
  DwmsDashboardMetrics,
  DwmsTaskCategory,
} from "@/services/dwms.service";

type Breakdown = NonNullable<DwmsDashboardMetrics["taskCategoryBreakdown"]>;
type StatusItem = Breakdown[DwmsTaskCategory]["statuses"][number];

const CATEGORY_LABELS: Record<DwmsTaskCategory, string> = {
  GOOD_PRACTICE: "Good Practices",
  JOB_RESPONSIBILITY: "Job Responsibility",
  ASSIGNED_TASK: "Assigned Tasks",
};

const STATUS_COLORS: Record<StatusItem["key"], string> = {
  NOT_ACKNOWLEDGED: "#d97706",
  PENDING: "#64748b",
  APPROVAL_PENDING: "#7c3aed",
  OVERDUE: "#e11d48",
  OVERDUE_COMPLETED: "#db2777",
  COMPLETED: "#059669",
};

function PercentageTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: StatusItem }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-800">{item.label}</p>
      <p className="mt-0.5 text-xs tabular-nums text-slate-500">
        {item.percentage}% · {item.count} {item.count === 1 ? "task" : "tasks"}
      </p>
    </div>
  );
}

export default function TaskCategoryPieCharts({
  breakdown,
  periodLabel,
}: {
  breakdown: Breakdown;
  periodLabel: string;
}) {
  return (
    <section aria-labelledby="task-status-breakdown-heading">
      <div className="mb-3">
        <h2
          id="task-status-breakdown-heading"
          className="font-semibold text-text-app"
        >
          Task Status by Category
        </h2>
        <p className="mt-1 text-xs text-muted-app">
          Percentage of applicable tasks in {periodLabel.toLowerCase()}. Each
          task appears in one status only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(Object.keys(CATEGORY_LABELS) as DwmsTaskCategory[]).map(
          (category) => {
            const categoryData = breakdown[category];
            const chartData = categoryData.statuses.filter(
              (status) => status.count > 0,
            );

            return (
              <article
                key={category}
                className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border-app pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-app">
                      {CATEGORY_LABELS[category]}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-app">
                      Status distribution
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                    {categoryData.total} total
                  </span>
                </div>

                {chartData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-center text-xs italic text-muted-app">
                    No applicable tasks in this period.
                  </div>
                ) : (
                  <>
                    <div className="relative h-52" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            dataKey="count"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={54}
                            outerRadius={82}
                            paddingAngle={2}
                            stroke="#ffffff"
                            strokeWidth={2}
                          >
                            {chartData.map((status) => (
                              <Cell
                                key={status.key}
                                fill={STATUS_COLORS[status.key]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<PercentageTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold tabular-nums text-slate-900">
                          {categoryData.total}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Tasks
                        </span>
                      </div>
                    </div>

                    <ul className="space-y-2" aria-label={`${CATEGORY_LABELS[category]} status percentages`}>
                      {chartData.map((status) => (
                        <li
                          key={status.key}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-slate-600">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{
                                backgroundColor: STATUS_COLORS[status.key],
                              }}
                            />
                            <span className="truncate">{status.label}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                            {status.percentage}%
                            <span className="ml-1 font-normal text-slate-400">
                              ({status.count})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}
