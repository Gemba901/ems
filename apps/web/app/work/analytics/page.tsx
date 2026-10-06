"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnalytics, useTeam, useWorkContext } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { RANGE_PRESET_LABELS, formatDateOnly, formatMinutes, toDateRange, type RangePreset } from "@/lib/work/format";
import type { Analytics, AnalyticsQuery, AnalyticsScope, OnTimeCounts, ProjectOutcome } from "@/services/work.service";
import { EmptyState, ErrorNote, HelpTip, Loading, SprintHelp, Surface, SPRINT_TERM, errorMessage, inputClass } from "@/components/work/ui";

const SCOPE_LABELS: Record<AnalyticsScope, string> = {
  personal: "Personal",
  department: "Department",
  organisation: "Organisation",
};

// Validated (dataviz validate_palette, light surface): all checks pass.
// Absence is deliberately not shown: it assumes everyone clocks in through this module, which
// isn't true while teams are still adopting it, so the screens report only actual clock-ins.
const SERIES = {
  onTime: { label: "On time", color: "#047857" },
  late: { label: "Late", color: "#d97706" },
} as const;

function rate(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Tile({ label, value, note, help }: { label: string; value: string | number; note?: string; help?: string }) {
  return (
    <Surface className="p-4">
      <p className="flex items-center gap-1 text-sm text-slate-500">
        {label}
        {help && <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip>}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </Surface>
  );
}

type TrendRow = { label: string; from: string; onTime: number; late: number };

// Long ranges are summed by week so bars stay readable.
function trendRows(trend: Analytics["attendance"]["trend"]): TrendRow[] {
  const weekly = trend.length > 62;
  const rows: TrendRow[] = [];
  for (const point of trend) {
    const startsWeek = !weekly || rows.length === 0 || new Date(`${point.date}T00:00:00Z`).getUTCDay() === 1;
    if (startsWeek) {
      rows.push({
        label: formatDateOnly(point.date, { day: "numeric", month: "short" }),
        from: point.date,
        onTime: 0,
        late: 0,
      });
    }
    const row = rows[rows.length - 1];
    row.onTime += point.onTime;
    row.late += point.late;
  }
  return rows;
}

function AttendanceTrend({ data }: { data: Analytics }) {
  const rows = useMemo(() => trendRows(data.attendance.trend), [data.attendance.trend]);
  const weekly = data.attendance.trend.length > 62;
  const [showTable, setShowTable] = useState(false);
  const empty = rows.every((r) => r.onTime + r.late === 0);

  return (
    <Surface className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Clock-ins {weekly ? "by week" : "by day"}</h2>
          <p className="text-sm text-slate-500">On time or late against the work hours. Clock-ins on days off are left out.</p>
        </div>
        <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {empty ? (
        <p className="mt-6 text-sm text-slate-500">No clock-ins on working days in this period.</p>
      ) : showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">{weekly ? "Week of" : "Date"}</th>
                <th className="py-2 pr-4 text-right font-medium">On time</th>
                <th className="py-2 text-right font-medium">Late</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {rows.map((r) => (
                <tr key={r.from}>
                  <td className="py-1.5 pr-4">{r.label}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{r.onTime}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.late}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 min-w-0">
          {/* A fixed height and a non-zero first size stop recharts warning before it measures. */}
          <ResponsiveContainer width="100%" height={288} minWidth={0} initialDimension={{ width: 1, height: 288 }}>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} tick={{ fontSize: 12, fill: "#64748b" }} minTickGap={16} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13, color: "#0f172a" }}
                labelFormatter={(label) => (weekly ? `Week of ${label}` : String(label))}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: "#334155" }} />
              {(Object.keys(SERIES) as (keyof typeof SERIES)[]).map((key, i, all) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={SERIES[key].label}
                  stackId="days"
                  fill={SERIES[key].color}
                  stroke="#ffffff"
                  strokeWidth={1}
                  radius={i === all.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Surface>
  );
}

function OnTimeRow({ label, help, counts }: { label: string; help?: React.ReactNode; counts: OnTimeCounts }) {
  const judged = counts.onTime + counts.late;
  const onTimePct = judged === 0 ? 0 : Math.round((counts.onTime / judged) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1 font-medium text-slate-800">
          {label}
          {help}
        </span>
        <span className="text-slate-600">
          {judged === 0 ? "None with a deadline" : `${counts.onTime} on time · ${counts.late} late`}
          {counts.noDeadline > 0 && <span className="text-slate-400"> · {counts.noDeadline} without deadline</span>}
        </span>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {judged > 0 && (
          <>
            {counts.onTime > 0 && <div style={{ width: `${onTimePct}%`, background: SERIES.onTime.color }} />}
            {counts.late > 0 && <div style={{ width: `${100 - onTimePct}%`, background: SERIES.late.color }} />}
          </>
        )}
      </div>
    </div>
  );
}

function OutcomeList({ title, items, empty, overdue }: { title: string; items: ProjectOutcome[]; empty: string; overdue?: boolean }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{p.name}</span>
              <span className="text-slate-600">
                {p.targetDate && `Target ${formatDateOnly(p.targetDate, { day: "numeric", month: "short" })}`}
                {p.daysLate > 0 ? (
                  <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    {p.daysLate} day{p.daysLate === 1 ? "" : "s"} {overdue ? "overdue" : "late"}
                  </span>
                ) : (
                  p.targetDate && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">On time</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectsPanel({ data }: { data: Analytics }) {
  const p = data.projects;
  return (
    <Surface className="space-y-5 p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Delivery</h2>
        <p className="text-sm text-slate-500">Work finished in this period, against its deadline.</p>
      </div>
      <div className="space-y-4">
        <OnTimeRow label="Tasks" counts={p.tasksCompleted} />
        <OnTimeRow label={SPRINT_TERM} help={<SprintHelp />} counts={p.sprintsCompleted} />
        <OnTimeRow label="Projects" counts={p.projectsCompleted} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>
          <span className="font-semibold text-slate-900">{p.tasksOpen}</span> open tasks
        </span>
        <span>
          <span className={`font-semibold ${p.tasksOverdue > 0 ? "text-amber-700" : "text-slate-900"}`}>{p.tasksOverdue}</span> overdue now
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <OutcomeList title="Projects past their target date" items={p.projectsOverdue} empty="None." overdue />
        <OutcomeList title="Projects completed" items={p.projectsCompleted.items} empty="None in this period." />
      </div>
    </Surface>
  );
}

function Breakdown({ data }: { data: Analytics }) {
  if (data.breakdown.length === 0) return null;
  const byPerson = data.scope === "department";
  return (
    <Surface className="overflow-hidden">
      <h2 className="border-b border-slate-100 px-5 py-4 text-base font-semibold text-slate-900">By {byPerson ? "person" : "department"}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">{byPerson ? "Person" : "Department"}</th>
              {!byPerson && <th className="px-3 py-2.5 text-right font-medium">People</th>}
              <th className="px-3 py-2.5 text-right font-medium">Clock-ins</th>
              <th className="px-3 py-2.5 text-right font-medium">On time</th>
              <th className="px-3 py-2.5 text-right font-medium">Late</th>
              <th className="px-3 py-2.5 text-right font-medium">Outside location</th>
              <th className="px-3 py-2.5 text-right font-medium">Tasks on time</th>
              <th className="px-5 py-2.5 text-right font-medium">Overdue tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {data.breakdown.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-2.5 font-medium">{row.name}</td>
                {!byPerson && <td className="px-3 py-2.5 text-right tabular-nums">{row.headcount}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums">{row.attendance.presentDays}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rate(row.attendance.punctualityRate)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.attendance.lateDays}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.attendance.outsideLocationDays}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {row.tasksCompleted.onTime}/{row.tasksCompleted.onTime + row.tasksCompleted.late}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{row.tasksOverdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

function Report({ data }: { data: Analytics }) {
  const a = data.attendance;
  const tasks = data.projects.tasksCompleted;
  const judged = tasks.onTime + tasks.late;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Clock-ins"
          value={a.presentDays}
          note={`${formatMinutes(a.workedMinutes)} worked`}
          help="Working days with a clock-in. Clock-ins on days off and holidays are counted separately below."
        />
        <Tile
          label="On time"
          value={rate(a.punctualityRate)}
          note={`${a.onTimeDays} of ${a.presentDays} clock-ins`}
          help="Clock-ins within the grace period, against the work hours in force when the person clocked in."
        />
        <Tile
          label="Late arrivals"
          value={a.lateDays}
          note={a.lateDays > 0 ? `${formatMinutes(a.averageLateMinutes)} late on average` : "None"}
        />
        <Tile
          label="Tasks on time"
          value={judged === 0 ? "—" : `${Math.round((tasks.onTime / judged) * 100)}%`}
          note={`${tasks.onTime + tasks.late + tasks.noDeadline} completed`}
        />
      </div>
      <p className="text-xs text-slate-500">
        {data.scope !== "personal" && `${data.headcount} people · `}
        {a.leaveDays} days on leave
        {a.earlyLeaveDays > 0 && ` · ${a.earlyLeaveDays} early finishes`}
        {a.offDayWorkDays > 0 && ` · ${a.offDayWorkDays} days worked on a day off`}
        {a.outsideLocationDays > 0 && ` · ${a.outsideLocationDays} clock-ins outside approved locations`}
      </p>
      <AttendanceTrend data={data} />
      <ProjectsPanel data={data} />
      <Breakdown data={data} />
    </div>
  );
}

export default function AnalyticsPage() {
  const context = useWorkContext();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const scopes = context.data?.analyticsScopes ?? ["personal"];
  const [scope, setScope] = useState<AnalyticsScope>("personal");
  const [chosenDepartmentId, setDepartmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState(() => toDateRange("month", timeZone));
  const hasReports = (context.data?.directReportCount ?? 0) > 0;
  const team = useTeam(hasReports);

  // A HOD's department picker holds only their own department.
  const departments = useMemo(() => {
    if (!context.data) return [];
    return context.data.departments.length > 0 ? context.data.departments : context.data.department ? [context.data.department] : [];
  }, [context.data]);

  // Until someone picks one, start from their own department.
  const ownDepartmentId = context.data?.department?.id;
  const departmentId =
    chosenDepartmentId || (departments.some((d) => d.id === ownDepartmentId) ? ownDepartmentId! : (departments[0]?.id ?? ""));

  const query: AnalyticsQuery = {
    scope,
    from: range.from,
    to: range.to,
    ...(scope === "department" && departmentId ? { departmentId } : {}),
    ...(scope === "personal" && employeeId ? { employeeId } : {}),
  };
  const ready = Boolean(context.data) && (scope !== "department" || Boolean(departmentId)) && Boolean(range.from && range.to);
  const analytics = useAnalytics(query, ready);

  function choosePreset(next: RangePreset) {
    setPreset(next);
    if (next !== "custom") setRange(toDateRange(next, timeZone));
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Attendance, punctuality and on-time delivery.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        {scopes.length > 1 && (
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {scopes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${scope === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        )}
        {scope === "department" && departments.length > 1 && (
          <select aria-label="Department" className={`${inputClass} sm:w-56`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {scope === "personal" && hasReports && (
          <select aria-label="Person" className={`${inputClass} sm:w-56`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Me</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Period" className={`${inputClass} sm:w-44`} value={preset} onChange={(e) => choosePreset(e.target.value as RangePreset)}>
          {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((p) => (
            <option key={p} value={p}>
              {RANGE_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
        {preset === "custom" && (
          <>
            <input aria-label="From" type="date" className={`${inputClass} sm:w-44`} value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <input aria-label="To" type="date" className={`${inputClass} sm:w-44`} value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </>
        )}
      </div>

      {context.isError ? (
        <ErrorNote>{errorMessage(context.error)}</ErrorNote>
      ) : scope === "department" && departments.length === 0 && context.data ? (
        <Surface className="p-5">
          <EmptyState title="No department">You are not in a department yet.</EmptyState>
        </Surface>
      ) : analytics.isError ? (
        <ErrorNote>{errorMessage(analytics.error, "Could not load analytics.")}</ErrorNote>
      ) : !analytics.data ? (
        <Loading />
      ) : (
        <div className={analytics.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <Report data={analytics.data} />
        </div>
      )}
    </div>
  );
}
