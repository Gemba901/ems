"use client";

import { Button } from "@/components/ui/button";

import { PageHeader } from "@/components/patterns/PageHeader";
import { ErrorState } from "@/components/patterns/ErrorState";

import { useMemo } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService } from "@/services/employee.service";
import { SimsService, Suggestion, SuggestionStatus } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  ClipboardCheck,
  Download,
  GraduationCap,
  Loader2,
  Lightbulb,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";

const EMPTY_SUGGESTIONS: Suggestion[] = [];
const EMPTY_DEPARTMENTS: Awaited<ReturnType<typeof EmployeeService.getDepartments>> = [];

type DepartmentMetric = {
  id: string;
  name: string;
  count: number;
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW: "Waiting for Review",
  UNDER_REVIEW: "Under Review",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  IMPLEMENTED: "Implemented",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  SELECTED_FOR_SGA: "Selected for SGA",
};

const STATUS_COLORS: Record<string, string> = {
  WAITING_FOR_REVIEW: "bg-muted-foreground",
  UNDER_REVIEW: "bg-warning",
  SELECTED_FOR_SGA: "bg-primary",
  APPROVED_FOR_IMPLEMENTATION: "bg-success",
  IMPLEMENTED: "bg-success",
  REJECTED: "bg-danger",
  ON_HOLD: "bg-warning",
};

const statStyles = {
  blue: {
    icon: "bg-info-subtle text-info",
    trend: "text-info",
  },
  emerald: {
    icon: "bg-success-subtle text-success",
    trend: "text-success",
  },
  amber: {
    icon: "bg-warning-subtle text-warning",
    trend: "text-warning",
  },
};

function toCsvValue(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const plannedReports = [
  {
    title: "Attendance Summary",
    description: "Daily attendance, absenteeism, late arrivals, and department punctuality.",
    icon: CalendarDays,
    accent: "bg-info-subtle text-info",
  },
  {
    title: "Leave Utilization",
    description: "Leave balances, pending approvals, approved days, and absence patterns.",
    icon: ClipboardCheck,
    accent: "bg-warning-subtle text-warning",
  },
  {
    title: "Payroll Overview",
    description: "Payroll totals, deductions, allowances, and monthly compensation trends.",
    icon: WalletCards,
    accent: "bg-success-subtle text-success",
  },
  {
    title: "Training & Skills",
    description: "Skill gaps, training attendance, certifications, and development progress.",
    icon: GraduationCap,
    accent: "bg-primary/10 text-primary",
  },
  {
    title: "Compliance Audit",
    description: "Policy acknowledgements, required documents, incidents, and compliance checks.",
    icon: ShieldCheck,
    accent: "bg-rose-50 text-rose-600",
  },
];

export default function ReportsPage() {
  const { user, accessToken } = useAuthStore();

  const orgId = user?.organizationId;
  const role = user?.roleLevel;
  const isHod = role === Role.HOD;

  const { data: departmentRaw = EMPTY_DEPARTMENTS, isLoading: deptsLoading, error: deptsError } = useQuery({
    queryKey: ["departments", orgId],
    queryFn: () => EmployeeService.getDepartments(orgId!, accessToken!),
    enabled: !!accessToken && !!orgId,
  });

  const { data: suggestionRaw, isLoading: simsLoading, error: simsError } = useQuery({
    queryKey: ["reports", orgId, role],
    queryFn: () => isHod
      ? SimsService.getDepartment(accessToken!, { limit: 1000 }).then((res) => res.data)
      : SimsService.getAll(accessToken!, { limit: 1000 }).then((res) => res.data),
    enabled: !!accessToken && !!orgId && !!role,
  });

  const departments: DepartmentMetric[] = useMemo(() =>
    departmentRaw.map((d) => ({ id: d.id, name: d.name, count: d._count.employees })),
  [departmentRaw]);

  const suggestions: Suggestion[] = suggestionRaw ?? EMPTY_SUGGESTIONS;
  const loading = deptsLoading || simsLoading;
  const errorMsg = deptsError || simsError
    ? (deptsError || simsError)?.message || "Failed to load reports."
    : null;
  const error = errorMsg;

  const metrics = useMemo(() => {
    const totalHeadcount = departments.reduce((sum, department) => sum + department.count, 0);
    const pendingSuggestions = suggestions.filter((suggestion) =>
      ["UNDER_REVIEW", "SELECTED_FOR_SGA", "ON_HOLD"].includes(suggestion.status),
    ).length;
    const implemented = suggestions.filter((suggestion) => suggestion.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const implementationRate = suggestions.length > 0 ? Math.round((implemented / suggestions.length) * 100) : 0;

    return {
      totalHeadcount,
      pendingSuggestions,
      implementationRate,
      implemented,
    };
  }, [departments, suggestions]);

  const departmentData = useMemo(() => {
    const max = Math.max(...departments.map((department) => department.count), 1);
    return departments
      .filter((department) => department.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((department) => ({
        ...department,
        percentage: Math.max(6, Math.round((department.count / max) * 100)),
      }));
  }, [departments]);

  const statusData = useMemo(() => {
    const totals = suggestions.reduce<Record<string, number>>((acc, suggestion) => {
      acc[suggestion.status] = (acc[suggestion.status] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([status, count]) => ({
        status,
        count,
        percentage: suggestions.length > 0 ? Math.round((count / suggestions.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [suggestions]);

  const stats = [
    {
      label: "Total Headcount",
      value: loading ? "..." : metrics.totalHeadcount.toLocaleString(),
      trend: `${departments.length} departments`,
      icon: Users,
      style: statStyles.blue,
    },
    {
      label: isHod ? "Department Suggestions" : "Organization Suggestions",
      value: loading ? "..." : suggestions.length.toLocaleString(),
      trend: `${metrics.implementationRate}% implementation`,
      icon: Lightbulb,
      style: statStyles.emerald,
    },
    {
      label: "Open Suggestion Items",
      value: loading ? "..." : metrics.pendingSuggestions.toLocaleString(),
      trend: metrics.pendingSuggestions > 0 ? "Needs review" : "All clear",
      icon: Clock,
      style: statStyles.amber,
    },
  ];

  const exportCsv = () => {
    const rows = [
      ["Report", user?.organizationName ?? "Workspace"],
      ["Scope", isHod ? "Department" : "Organization"],
      ["Generated At", new Date().toISOString()],
      [],
      ["Metric", "Value"],
      ["Total Headcount", metrics.totalHeadcount],
      ["Departments", departments.length],
      ["Suggestions", suggestions.length],
      ["Implemented Suggestions", metrics.implemented],
      ["Implementation Rate", `${metrics.implementationRate}%`],
      ["Open Suggestion Items", metrics.pendingSuggestions],
      [],
      ["Department", "Headcount"],
      ...departmentData.map((department) => [department.name, department.count]),
      [],
      ["Suggestion Status", "Count", "Percentage"],
      ...statusData.map((item) => [STATUS_LABELS[item.status as SuggestionStatus] ?? item.status, item.count, `${item.percentage}%`]),
    ];

    const csv = rows.map((row) => row.map((cell) => toCsvValue(cell ?? "")).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${user?.organizationName ?? "organization"}-reports.csv`.replace(/\s+/g, "-").toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader
          className="mb-8"
          title="Analytics & Reports"
          description={`${isHod ? "Department-level" : "Organization-wide"} workforce and suggestion metrics from live system data.`}
          actions={<Button variant="outline" type="button" onClick={exportCsv} disabled={loading || !!error}><Download /> Export CSV</Button>}
        />

        {error && <ErrorState title="Could not load reports" description={error} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.style.icon}`}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <stat.icon className="h-5 w-5" />}
                </div>
                <TrendingUp className={`h-4 w-4 ${stat.style.trend} opacity-50`} />
              </div>
              <h3 className="text-2xl font-bold text-foreground">{stat.value}</h3>
              <div className="flex items-center justify-between mt-1 gap-3">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-xs text-muted-foreground text-right">{loading ? "Loading" : stat.trend}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6 gap-4">
              <h2 className="font-semibold text-foreground">Headcount by Department</h2>
              {!loading && <span className="text-xs text-muted-foreground">{departmentData.length} active departments</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading department data...</span>
              </div>
            ) : departmentData.length > 0 ? (
              <div className="space-y-5 max-h-96 overflow-y-auto pr-1">
                {departmentData.map((department) => (
                  <div key={department.id}>
                    <div className="flex justify-between text-sm mb-2 gap-3">
                      <span className="font-medium text-foreground truncate">{department.name}</span>
                      <span className="text-muted-foreground shrink-0">{department.count} employees</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-info rounded-full transition-all duration-700"
                        style={{ width: `${department.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No department headcount data available.</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6 gap-4">
              <h2 className="font-semibold text-foreground">Suggestion Status Breakdown</h2>
              {!loading && <span className="text-xs text-muted-foreground">{suggestions.length} total</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading suggestion data...</span>
              </div>
            ) : statusData.length > 0 ? (
              <div className="space-y-5">
                {statusData.map((item) => (
                  <div key={item.status}>
                    <div className="flex justify-between text-sm mb-2 gap-3">
                      <span className="font-medium text-foreground">{STATUS_LABELS[item.status as SuggestionStatus] ?? item.status}</span>
                      <span className="text-muted-foreground shrink-0">{item.count} items</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${STATUS_COLORS[item.status] ?? "bg-muted-foreground"}`}
                        style={{ width: `${Math.max(6, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No suggestion data available.</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Report Library</h2>
                <p className="text-xs text-muted-foreground mt-1">Live reports available now, with planned report surfaces ready for future modules.</p>
              </div>
              <span className="text-xs text-muted-foreground">{plannedReports.length + 2} report areas</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-success/20 bg-success-subtle/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-card flex items-center justify-center text-success shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Workforce Snapshot</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success bg-success-subtle px-2 py-0.5 rounded-full">Live</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Headcount and department distribution from employee records.
                    </p>
                    <p className="text-xs font-semibold text-success mt-3">
                      {loading ? "Loading..." : `${metrics.totalHeadcount.toLocaleString()} employees - ${departments.length} departments`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-info/20 bg-info-subtle/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-card flex items-center justify-center text-info shrink-0">
                    <Lightbulb className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">SIMS Performance</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-info bg-info-subtle px-2 py-0.5 rounded-full">Live</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Suggestion totals, open actions, and implementation progress.
                    </p>
                    <p className="text-xs font-semibold text-info mt-3">
                      {loading ? "Loading..." : `${suggestions.length.toLocaleString()} suggestions - ${metrics.implementationRate}% implemented`}
                    </p>
                  </div>
                </div>
              </div>

              {plannedReports.map((report) => (
                <div key={report.title} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${report.accent}`}>
                      <report.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{report.title}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Planned</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
