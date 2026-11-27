"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnalytics, useTeam, useWorkContext } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { RANGE_PRESET_LABELS, formatDateOnly, formatMinutes, toDateRange, type RangePreset } from "@/lib/work/format";
import type { Analytics, AnalyticsQuery, AnalyticsScope, OnTimeCounts, ProjectOutcome } from "@/services/work.service";
import { HelpTip, SprintHelp, SPRINT_TERM, errorMessage } from "@/components/work/ui";

const SCOPE_LABELS: Record<AnalyticsScope, string> = {
  personal: "Personal",
  department: "Department",
  organisation: "Organisation",
};

// Absence is deliberately not shown: it assumes everyone clocks in through this module, which
// isn't true while teams are still adopting it, so the screens report only actual clock-ins.
const SERIES = {
  onTime: { label: "On time", color: "var(--success)" },
  late: { label: "Late", color: "var(--warning)" },
} as const;

function rate(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Tile({ label, value, note, help }: { label: string; value: string | number; note?: string; help?: string }) {
  return (
    <Card className="block p-4">
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {help && <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip>}
      </p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </Card>
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
    <Card className="block p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Clock-ins {weekly ? "by week" : "by day"}</h2>
          <p className="text-sm text-muted-foreground">On time or late against the work hours. Clock-ins on days off are left out.</p>
        </div>
        <Button variant="ghost" type="button" className="text-sm font-medium text-info hover:underline" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {empty ? (
        <p className="mt-6 text-sm text-muted-foreground">No clock-ins on working days in this period.</p>
      ) : showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <Table className="w-full text-sm">
            <TableHeader className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <TableRow>
                <TableHead className="py-2 pr-4 font-medium">{weekly ? "Week of" : "Date"}</TableHead>
                <TableHead className="py-2 pr-4 text-right font-medium">On time</TableHead>
                <TableHead className="py-2 text-right font-medium">Late</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border text-foreground">
              {rows.map((r) => (
                <TableRow key={r.from}>
                  <TableCell className="py-1.5 pr-4">{r.label}</TableCell>
                  <TableCell className="py-1.5 pr-4 text-right tabular-nums">{r.onTime}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{r.late}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-4 min-w-0">
          {/* A fixed height and a non-zero first size stop recharts warning before it measures. */}
          <ResponsiveContainer width="100%" height={288} minWidth={0} initialDimension={{ width: 1, height: 288 }}>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} minTickGap={16} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{ borderRadius: 8, background: "var(--popover)", borderColor: "var(--border)", fontSize: 13, color: "var(--popover-foreground)" }}
                labelFormatter={(label) => (weekly ? `Week of ${label}` : String(label))}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: "var(--foreground)" }} />
              {(Object.keys(SERIES) as (keyof typeof SERIES)[]).map((key, i, all) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={SERIES[key].label}
                  stackId="days"
                  fill={SERIES[key].color}
                  stroke="var(--card)"
                  strokeWidth={1}
                  radius={i === all.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={28}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function OnTimeRow({ label, help, counts }: { label: string; help?: React.ReactNode; counts: OnTimeCounts }) {
  const judged = counts.onTime + counts.late;
  const onTimePct = judged === 0 ? 0 : Math.round((counts.onTime / judged) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1 font-medium text-foreground">
          {label}
          {help}
        </span>
        <span className="text-muted-foreground">
          {judged === 0 ? "None with a deadline" : `${counts.onTime} on time · ${counts.late} late`}
          {counts.noDeadline > 0 && <span className="text-muted-foreground"> · {counts.noDeadline} without deadline</span>}
        </span>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
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
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="text-muted-foreground">
                {p.targetDate && `Target ${formatDateOnly(p.targetDate, { day: "numeric", month: "short" })}`}
                {p.daysLate > 0 ? (
                  <span className="ml-2 rounded bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-warning">
                    {p.daysLate} day{p.daysLate === 1 ? "" : "s"} {overdue ? "overdue" : "late"}
                  </span>
                ) : (
                  p.targetDate && <span className="ml-2 rounded bg-success-subtle px-1.5 py-0.5 text-xs font-medium text-success">On time</span>
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
    <Card className="block space-y-5 p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Delivery</h2>
        <p className="text-sm text-muted-foreground">Work finished in this period, against its deadline.</p>
      </div>
      <div className="space-y-4">
        <OnTimeRow label="Tasks" counts={p.tasksCompleted} />
        <OnTimeRow label={SPRINT_TERM} help={<SprintHelp />} counts={p.sprintsCompleted} />
        <OnTimeRow label="Projects" counts={p.projectsCompleted} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{p.tasksOpen}</span> open tasks
        </span>
        <span>
          <span className={`font-semibold ${p.tasksOverdue > 0 ? "text-warning" : "text-foreground"}`}>{p.tasksOverdue}</span> overdue now
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <OutcomeList title="Projects past their target date" items={p.projectsOverdue} empty="None." overdue />
        <OutcomeList title="Projects completed" items={p.projectsCompleted.items} empty="None in this period." />
      </div>
    </Card>
  );
}

function Breakdown({ data }: { data: Analytics }) {
  if (data.breakdown.length === 0) return null;
  const byPerson = data.scope === "department";
  return (
    <Card className="block overflow-hidden">
      <h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">By {byPerson ? "person" : "department"}</h2>
      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-muted text-left text-xs text-muted-foreground">
            <TableRow>
              <TableHead className="px-5 py-2.5 font-medium">{byPerson ? "Person" : "Department"}</TableHead>
              {!byPerson && <TableHead className="px-3 py-2.5 text-right font-medium">People</TableHead>}
              <TableHead className="px-3 py-2.5 text-right font-medium">Clock-ins</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-medium">On time</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-medium">Late</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-medium">Outside location</TableHead>
              <TableHead className="px-3 py-2.5 text-right font-medium">Tasks on time</TableHead>
              <TableHead className="px-5 py-2.5 text-right font-medium">Overdue tasks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border text-foreground">
            {data.breakdown.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="px-5 py-2.5 font-medium">{row.name}</TableCell>
                {!byPerson && <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.headcount}</TableCell>}
                <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.attendance.presentDays}</TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">{rate(row.attendance.punctualityRate)}</TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.attendance.lateDays}</TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">{row.attendance.outsideLocationDays}</TableCell>
                <TableCell className="px-3 py-2.5 text-right tabular-nums">
                  {row.tasksCompleted.onTime}/{row.tasksCompleted.onTime + row.tasksCompleted.late}
                </TableCell>
                <TableCell className="px-5 py-2.5 text-right tabular-nums">{row.tasksOverdue}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
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
      <p className="text-xs text-muted-foreground">
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
  const rangeValid = !!range.from && !!range.to && range.from <= range.to;
  const ready = Boolean(context.data) && (scope !== "department" || Boolean(departmentId)) && rangeValid;
  const analytics = useAnalytics(query, ready);

  function choosePreset(next: RangePreset) {
    setPreset(next);
    if (next !== "custom") setRange(toDateRange(next, timeZone));
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Attendance, punctuality and on-time delivery." />

      <div className="flex flex-wrap items-end gap-3">
        {scopes.length > 1 && (
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-border bg-card p-1">
            {scopes.map((s) => (
              <Button
                variant="ghost"
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${scope === s ? "bg-info text-info-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {SCOPE_LABELS[s]}
              </Button>
            ))}
          </div>
        )}
        {scope === "department" && departments.length > 1 && (
          <NativeSelect aria-label="Department" className="sm:w-56" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {scope === "personal" && hasReports && (
          <NativeSelect aria-label="Person" className="sm:w-56" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Me</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect aria-label="Period" className="sm:w-44" value={preset} onChange={(e) => choosePreset(e.target.value as RangePreset)}>
          {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((p) => (
            <option key={p} value={p}>
              {RANGE_PRESET_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        {preset === "custom" && (
          <>
            <Input aria-label="From" type="date" className="sm:w-44" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <Input aria-label="To" type="date" className="sm:w-44" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </>
        )}
      </div>

      {!rangeValid ? (
        <ErrorState title="Invalid date range" description="Choose a start date that is on or before the end date." />
      ) : context.isError ? (
        <ErrorState description={errorMessage(context.error)} onRetry={() => void context.refetch()} />
      ) : scope === "department" && departments.length === 0 && context.data ? (
        <Card className="block p-5">
          <EmptyState title="No department" description="You are not in a department yet." />
        </Card>
      ) : analytics.isError ? (
        <ErrorState description={errorMessage(analytics.error, "Could not load analytics.")} onRetry={() => void analytics.refetch()} />
      ) : !analytics.data ? (
        <LoadingState />
      ) : (
        <div className={analytics.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <Report data={analytics.data} />
        </div>
      )}
    </div>
  );
}
