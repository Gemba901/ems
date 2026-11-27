"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChartCard } from "@/components/patterns/ChartCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { SectionCard } from "@/components/patterns/PageSection";
import { StatCard } from "@/components/patterns/StatCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, type Kaizen, type KaizenStatus, type KaizenQcdsmtCategory } from "@/services/kaizen.service";
import { STATUS_LABELS, QCDSMT_LABELS, KAIZEN_TRIGGERS } from "@/components/kaizen/kaizen-ui";
import { FinancialImpact, toAmount, type FinancialEntry } from "@/components/ui/FinancialImpact";

type Scope = "organisation" | "department" | "mine";
type Period = "90d" | "12m" | "all";

const PERIODS: { value: Period; label: string; days: number | null }[] = [
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "12m", label: "Last 12 months", days: 365 },
  { value: "all", label: "All time", days: null },
];

const PIPELINE: KaizenStatus[] = [
  "DRAFT",
  "PENDING_HOD_PRE_REVIEW",
  "RETURNED_FOR_REVISION",
  "IN_IMPLEMENTATION",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
  "MOVED_TO_SGA",
  "REJECTED",
];

const ACTIVE_STATUSES = new Set<KaizenStatus>([
  "PENDING_HOD_PRE_REVIEW",
  "RETURNED_FOR_REVISION",
  "IN_IMPLEMENTATION",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
]);

const STATUS_BAR: Record<KaizenStatus, string> = {
  DRAFT: "bg-muted-foreground",
  PENDING_HOD_PRE_REVIEW: "bg-warning",
  RETURNED_FOR_REVISION: "bg-warning",
  REJECTED: "bg-danger",
  MOVED_TO_SGA: "bg-info",
  IN_IMPLEMENTATION: "bg-primary",
  PENDING_VERIFICATION: "bg-info",
  RETURNED_FOR_REWORK: "bg-warning",
  VERIFIED_CLOSED: "bg-success",
};

// Kaizens the HOD has approved to go ahead, so their estimated cost is committed.
const APPROVED_STATUSES = new Set<KaizenStatus>([
  "IN_IMPLEMENTATION",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
]);

const TRIGGER_LABELS = new Map(KAIZEN_TRIGGERS.map((t) => [t.value, t.label]));
const DAY_MS = 24 * 60 * 60 * 1000;

function closedAt(kaizen: Kaizen): Date | null {
  if (kaizen.status !== "VERIFIED_CLOSED") return null;
  const review = kaizen.reviews?.find((r) => r.statusChanged === "VERIFIED_CLOSED");
  return new Date(review?.createdAt ?? kaizen.updatedAt);
}

function isOverdue(kaizen: Kaizen, now: number) {
  return ACTIVE_STATUSES.has(kaizen.status) && !!kaizen.targetCompletionDate && new Date(kaizen.targetCompletionDate).getTime() < now;
}

// Benefit is the amount Finance verified on closed kaizens; cost is the estimate on approved ones.
// They are separate entries because each can be in its own currency.
function financialEntries(kaizen: Kaizen): FinancialEntry[] {
  const base = {
    id: kaizen.id,
    title: kaizen.title || kaizen.conditionDescription || "Untitled kaizen",
    department: kaizen.department?.name ?? "No department",
  };
  const entries: FinancialEntry[] = [];
  const finance = kaizen.verifications?.find((v) => v.stage === "FINANCE");
  const benefit = kaizen.status === "VERIFIED_CLOSED" ? toAmount(finance?.verifiedBenefitAmount) : null;
  if (benefit != null) entries.push({ ...base, currency: finance?.verifiedBenefitCurrency ?? "", benefit, cost: null });
  const cost = APPROVED_STATUSES.has(kaizen.status) ? toAmount(kaizen.estimatedCost) : null;
  if (cost != null) entries.push({ ...base, currency: kaizen.estimatedCostCurrency ?? "", benefit: null, cost });
  return entries;
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

function BarList({ rows, empty }: { rows: { label: string; value: number; color?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) {
    return <EmptyState title={empty} />;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{row.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className={`h-2 rounded-full ${row.color ?? "bg-primary"}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function KaizenReportsRoute() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <KaizenReportsPage />
    </ProtectedRoute>
  );
}

function KaizenReportsPage() {
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const isHod = role === Role.HOD && !!user?.departmentId;

  const scopes = [
    ...(isPrivileged ? [{ key: "organisation" as const, label: "Organisation" }] : []),
    ...(isHod ? [{ key: "department" as const, label: "My department" }] : []),
    { key: "mine" as const, label: "My Kaizens" },
  ];
  const [selectedScope, setScope] = useState<Scope | null>(null);
  const scope = selectedScope ?? scopes[0].key;
  const [period, setPeriod] = useState<Period>("12m");
  const [now] = useState(() => Date.now());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["kaizen-reports", scope, user?.departmentId],
    queryFn: () => {
      if (scope === "organisation") return KaizenService.getAll(accessToken!);
      if (scope === "department") return KaizenService.getByDepartment(user!.departmentId!, accessToken!);
      return KaizenService.getMine(accessToken!);
    },
    enabled: !!accessToken && !!user,
  });

  const report = useMemo(() => {
    const days = PERIODS.find((p) => p.value === period)?.days;
    const kaizens = (data ?? []).filter((s) => !days || now - new Date(s.createdAt).getTime() <= days * DAY_MS);
    const submitted = kaizens.filter((s) => s.status !== "DRAFT");
    const closed = kaizens.filter((s) => s.status === "VERIFIED_CLOSED");
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
      const name = s.department?.name ?? "No department";
      const row = departments.get(name) ?? { name, total: 0, active: 0, closed: 0, overdue: 0 };
      row.total += 1;
      if (ACTIVE_STATUSES.has(s.status)) row.active += 1;
      if (s.status === "VERIFIED_CLOSED") row.closed += 1;
      if (isOverdue(s, now)) row.overdue += 1;
      departments.set(name, row);
    }

    return {
      movedToSga: kaizens.filter((s) => s.status === "MOVED_TO_SGA").length,
      total: submitted.length,
      drafts: kaizens.length - submitted.length,
      active: kaizens.filter((s) => ACTIVE_STATUSES.has(s.status)).length,
      closed: closed.length,
      overdue: kaizens.filter((s) => isOverdue(s, now)).length,
      closureRate: submitted.length ? Math.round((closed.length / submitted.length) * 100) : null,
      avgCloseDays: closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null,
      pipeline: PIPELINE.map((status) => ({
        label: STATUS_LABELS[status],
        value: kaizens.filter((s) => s.status === status).length,
        color: STATUS_BAR[status],
      })),
      focus: countBy(submitted.flatMap((s) => [...new Set(s.qcdsmtImpacts.map((i) => i.category))]) as KaizenQcdsmtCategory[]).map(
        ([category, value]) => ({ label: QCDSMT_LABELS[category], value }),
      ),
      reasons: countBy(submitted.flatMap((s) => (s.trigger ? [s.trigger] : [])))
        .slice(0, 5)
        .map(([trigger, value]) => ({ label: TRIGGER_LABELS.get(trigger) ?? trigger, value })),
      financial: kaizens.flatMap(financialEntries),
      months,
      departments: [...departments.values()].sort((a, b) => b.total - a.total),
    };
  }, [data, period, now]);

  return (
    <div className="space-y-section">
      <PageHeader
        title="Kaizen Reports"
        description="Track Kaizen submissions, progress, and closures."
        actions={
          <div role="group" aria-label="Reporting period" className="flex flex-wrap gap-1">
            {PERIODS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={period === option.value ? "default" : "outline"}
                aria-pressed={period === option.value}
                onClick={() => setPeriod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      />

      {scopes.length > 1 && (
        <div role="group" aria-label="Report scope" className="flex flex-wrap gap-1 border-b border-border pb-3">
          {scopes.map((option) => (
            <Button
              key={option.key}
              type="button"
              variant={scope === option.key ? "secondary" : "ghost"}
              aria-pressed={scope === option.key}
              onClick={() => setScope(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState
          title="Unable to load Kaizen reports"
          description={error.message}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <LoadingState label="Loading reports…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Submitted" value={report.total} description={`${report.drafts} still in draft`} />
            <StatCard label="Active" value={report.active} description="Awaiting review, being done or in verification" />
            <StatCard label="Closed" value={report.closed} description="Verified and closed" />
            <StatCard label="Closure rate" value={report.closureRate == null ? "—" : `${report.closureRate}%`} description="Closed out of submitted" />
            <StatCard label="Avg. time to close" value={report.avgCloseDays == null ? "—" : `${report.avgCloseDays} days`} description="From creation to verification" />
            <StatCard label="Overdue" value={report.overdue} description={`Active and past target date · ${report.movedToSga} moved to SGA`} />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ChartCard
              title="Raised vs closed"
              description="Submitted and closed Kaizens per month, last 6 months"
              categoryKey="label"
              data={report.months}
              series={[
                { key: "raised", label: "Raised", token: "chart-2" },
                { key: "closed", label: "Closed", token: "chart-4" },
              ]}
            />
            <SectionCard title="Where kaizens are now" description="Current stage of every kaizen in the period">
              <BarList rows={report.pipeline} empty="No kaizens in this period." />
            </SectionCard>
            <SectionCard title="What people are improving" description="Kaizens targeting each QCDSMT area">
              <BarList rows={report.focus} empty="No improvement targets recorded yet." />
            </SectionCard>
            <SectionCard title="Top reasons for starting" description="The five most common reasons">
              <BarList rows={report.reasons} empty="No reasons recorded yet." />
            </SectionCard>
          </div>

          <SectionCard title="Financial impact" description="Money saved by closed kaizens against what approved kaizens were expected to cost">
            <FinancialImpact
              entries={report.financial}
              benefitLabel="Verified benefit"
              benefitDetail="Confirmed by Finance on closed kaizens"
              costLabel="Estimated cost"
              costDetail="Approved kaizens"
              linkBase="/kaizen"
              emptyText="No costs or verified benefits recorded in this period."
            />
          </SectionCard>

          {scope !== "mine" && (
            <SectionCard title="By department" description="Submitted kaizens grouped by department">
              {report.departments.length === 0 ? (
                <EmptyState title="No submitted Kaizens in this period" />
              ) : (
                <Table className="min-w-[480px]">
                  <caption className="sr-only">Kaizen totals by department</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Department</TableHead>
                      <TableHead scope="col" className="text-right">Submitted</TableHead>
                      <TableHead scope="col" className="text-right">Active</TableHead>
                      <TableHead scope="col" className="text-right">Closed</TableHead>
                      <TableHead scope="col" className="text-right">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.departments.map((d) => (
                      <TableRow key={d.name}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.active}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">{d.closed}</TableCell>
                        <TableCell className={`text-right tabular-nums ${d.overdue ? "font-semibold text-danger" : ""}`}>{d.overdue}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          )}

          <p className="text-xs text-muted-foreground">
            Not sure what a number means? See{" "}
            <Link href="/docs/kaizen/reports" className="font-medium text-primary hover:underline">
              the Reports guide
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
