"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SgaService, type Sga, type SgaStatus, type SgaQcdsmtCategory } from "@/services/sga.service";
import { STATUS_LABELS, QCDSMT_LABELS, STARTING_REASONS } from "@/components/sga/sga-ui";

type Scope = "organisation" | "department" | "mine";
type Period = "90d" | "12m" | "all";

const PERIODS: { value: Period; label: string; days: number | null }[] = [
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "12m", label: "Last 12 months", days: 365 },
  { value: "all", label: "All time", days: null },
];

const PIPELINE: SgaStatus[] = [
  "DRAFT",
  "PENDING_HOD_APPROVAL",
  "RETURNED_FOR_REVISION",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
  "REJECTED",
];

const ACTIVE_STATUSES = new Set<SgaStatus>([
  "PENDING_HOD_APPROVAL",
  "RETURNED_FOR_REVISION",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
]);

const STATUS_BAR: Record<SgaStatus, string> = {
  DRAFT: "bg-slate-300",
  PENDING_HOD_APPROVAL: "bg-amber-400",
  RETURNED_FOR_REVISION: "bg-orange-400",
  REJECTED: "bg-rose-400",
  IN_PROGRESS: "bg-indigo-400",
  PENDING_VERIFICATION: "bg-purple-400",
  RETURNED_FOR_REWORK: "bg-orange-500",
  VERIFIED_CLOSED: "bg-emerald-500",
};

const REASON_LABELS = new Map(STARTING_REASONS.map((r) => [r.value, r.label]));
const DAY_MS = 24 * 60 * 60 * 1000;

function closedAt(sga: Sga): Date | null {
  if (sga.status !== "VERIFIED_CLOSED") return null;
  const review = sga.reviews?.find((r) => r.statusChanged === "VERIFIED_CLOSED");
  return new Date(review?.createdAt ?? sga.updatedAt);
}

function isOverdue(sga: Sga, now: number) {
  return ACTIVE_STATUSES.has(sga.status) && !!sga.targetCompletionDate && new Date(sga.targetCompletionDate).getTime() < now;
}

function countBy<T extends string>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }) };
  });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="my-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function BarList({ rows, color = "bg-indigo-400", empty }: { rows: { label: string; value: number; color?: string }[]; color?: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) {
    return <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">{empty}</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-slate-700">{row.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{row.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${row.color ?? color}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MonthlyChart({ months }: { months: { label: string; raised: number; closed: number }[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.raised, m.closed]));
  return (
    <div>
      <div className="flex h-44 items-end gap-2 sm:gap-3">
        {months.map((m) => (
          <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5 sm:gap-1">
              <div
                className="w-full max-w-4 rounded-t bg-[#52618a]"
                style={{ height: `${(m.raised / max) * 100}%` }}
                title={`${m.label}: ${m.raised} raised`}
              />
              <div
                className="w-full max-w-4 rounded-t bg-emerald-500"
                style={{ height: `${(m.closed / max) * 100}%` }}
                title={`${m.label}: ${m.closed} closed`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2 sm:gap-3">
        {months.map((m) => (
          <span key={m.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-500">{m.label}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#52618a]" /> Raised</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Closed</span>
      </div>
    </div>
  );
}

export default function SgaReportsRoute() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <SgaReportsPage />
    </ProtectedRoute>
  );
}

function SgaReportsPage() {
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const isHod = role === Role.HOD && !!user?.departmentId;

  const scopes = [
    ...(isPrivileged ? [{ key: "organisation" as const, label: "Organisation" }] : []),
    ...(isHod ? [{ key: "department" as const, label: "My department" }] : []),
    { key: "mine" as const, label: "My SGAs" },
  ];
  const [selectedScope, setScope] = useState<Scope | null>(null);
  const scope = selectedScope ?? scopes[0].key;
  const [period, setPeriod] = useState<Period>("12m");
  const [now] = useState(() => Date.now());

  const { data, isLoading, error } = useQuery({
    queryKey: ["sga-reports", scope, user?.departmentId],
    queryFn: () => {
      if (scope === "organisation") return SgaService.getAll(accessToken!);
      if (scope === "department") return SgaService.getByDepartment(user!.departmentId!, accessToken!);
      return SgaService.getMine(accessToken!);
    },
    enabled: !!accessToken && !!user,
  });

  const report = useMemo(() => {
    const days = PERIODS.find((p) => p.value === period)?.days;
    const sgas = (data ?? []).filter((s) => !days || now - new Date(s.createdAt).getTime() <= days * DAY_MS);
    const submitted = sgas.filter((s) => s.status !== "DRAFT");
    const closed = sgas.filter((s) => s.status === "VERIFIED_CLOSED");
    const closeDays = closed
      .map((s) => (closedAt(s)!.getTime() - new Date(s.createdAt).getTime()) / DAY_MS)
      .filter((d) => d >= 0);

    const months = lastMonths(6).map((m) => ({ ...m, raised: 0, closed: 0 }));
    const byMonth = new Map(months.map((m) => [m.key, m]));
    for (const s of data ?? []) {
      const raised = byMonth.get(monthKey(new Date(s.createdAt)));
      if (raised && s.status !== "DRAFT") raised.raised += 1;
      const done = closedAt(s);
      const closedMonth = done && byMonth.get(monthKey(done));
      if (closedMonth) closedMonth.closed += 1;
    }

    const departments = new Map<string, { name: string; total: number; active: number; closed: number; overdue: number }>();
    for (const s of submitted) {
      const name = s.mainDepartment?.name ?? "No department";
      const row = departments.get(name) ?? { name, total: 0, active: 0, closed: 0, overdue: 0 };
      row.total += 1;
      if (ACTIVE_STATUSES.has(s.status)) row.active += 1;
      if (s.status === "VERIFIED_CLOSED") row.closed += 1;
      if (isOverdue(s, now)) row.overdue += 1;
      departments.set(name, row);
    }

    return {
      total: submitted.length,
      drafts: sgas.length - submitted.length,
      active: sgas.filter((s) => ACTIVE_STATUSES.has(s.status)).length,
      closed: closed.length,
      overdue: sgas.filter((s) => isOverdue(s, now)).length,
      closureRate: submitted.length ? Math.round((closed.length / submitted.length) * 100) : null,
      avgCloseDays: closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null,
      pipeline: PIPELINE.map((status) => ({
        label: STATUS_LABELS[status],
        value: sgas.filter((s) => s.status === status).length,
        color: STATUS_BAR[status],
      })),
      focus: countBy(submitted.flatMap((s) => [...new Set(s.qcdsmtImpacts.map((i) => i.category))]) as SgaQcdsmtCategory[]).map(
        ([category, value]) => ({ label: QCDSMT_LABELS[category], value }),
      ),
      reasons: countBy(submitted.flatMap((s) => (s.startingReason ? [s.startingReason] : [])))
        .slice(0, 5)
        .map(([reason, value]) => ({ label: reason === "OTHER" ? "Other" : REASON_LABELS.get(reason) ?? reason, value })),
      months,
      departments: [...departments.values()].sort((a, b) => b.total - a.total),
    };
  }, [data, period, now]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">SGA Reports</h1>
          <p className="mt-0.5 text-xs text-slate-500">How many SGAs are being raised, where they are stuck and how many get closed.</p>
        </div>
        <div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                period === p.value ? "bg-[#52618a] text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {scopes.length > 1 && (
        <div className="flex gap-6 overflow-x-auto whitespace-nowrap border-b border-slate-200">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              className={`border-b-2 pb-3 text-sm font-semibold transition duration-150 ${
                scope === s.key ? "border-indigo-500 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error instanceof Error ? error.message : "Unable to load SGA reports."}
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-24 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reports...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Submitted" value={report.total} detail={`${report.drafts} still in draft`} />
            <Metric label="Active" value={report.active} detail="Awaiting approval, running or in verification" />
            <Metric label="Closed" value={report.closed} detail="Verified and closed" />
            <Metric label="Closure rate" value={report.closureRate == null ? "—" : `${report.closureRate}%`} detail="Closed out of submitted" />
            <Metric label="Avg. time to close" value={report.avgCloseDays == null ? "—" : `${report.avgCloseDays} days`} detail="From creation to verification" />
            <Metric label="Overdue" value={report.overdue} detail="Active and past target date" />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title="Raised vs closed" subtitle="Submitted and closed SGAs per month, last 6 months">
              <MonthlyChart months={report.months} />
            </Card>
            <Card title="Where SGAs are now" subtitle="Current stage of every SGA in the period">
              <BarList rows={report.pipeline} empty="No SGAs in this period." />
            </Card>
            <Card title="What teams are improving" subtitle="SGAs targeting each QCDSMT area">
              <BarList rows={report.focus} empty="No improvement targets recorded yet." />
            </Card>
            <Card title="Top reasons for starting" subtitle="The five most common reasons">
              <BarList rows={report.reasons} color="bg-[#52618a]" empty="No reasons recorded yet." />
            </Card>
          </div>

          {scope !== "mine" && (
            <Card title="By department" subtitle="Submitted SGAs grouped by main department">
              {report.departments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">No submitted SGAs in this period.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                        <th className="px-5 pb-2 font-medium">Department</th>
                        <th className="px-3 pb-2 text-right font-medium">Submitted</th>
                        <th className="px-3 pb-2 text-right font-medium">Active</th>
                        <th className="px-3 pb-2 text-right font-medium">Closed</th>
                        <th className="px-5 pb-2 text-right font-medium">Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.departments.map((d) => (
                        <tr key={d.name} className="border-b border-slate-50 last:border-0">
                          <td className="px-5 py-2.5 font-medium text-slate-800">{d.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{d.total}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{d.active}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{d.closed}</td>
                          <td className={`px-5 py-2.5 text-right tabular-nums ${d.overdue ? "font-semibold text-rose-600" : "text-slate-700"}`}>{d.overdue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <p className="text-xs text-slate-500">
            Not sure what a number means? See{" "}
            <Link href="/docs/sga/reports" className="font-medium text-indigo-700 hover:underline">
              the Reports guide
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
