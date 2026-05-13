"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService } from "@/services/employee.service";
import { SimsService, Suggestion, SuggestionStatus } from "@/services/sims.service";
import {
  AlertCircle,
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

type DepartmentMetric = {
  id: string;
  name: string;
  count: number;
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  UNDER_REVIEW: "Under Review",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  SELECTED_FOR_SGA: "Selected for SGA",
};

const STATUS_COLORS: Record<string, string> = {
  UNDER_REVIEW: "bg-amber-500",
  SELECTED_FOR_SGA: "bg-indigo-500",
  APPROVED_FOR_IMPLEMENTATION: "bg-emerald-500",
  REJECTED: "bg-red-500",
  ON_HOLD: "bg-orange-500",
};

const statStyles = {
  blue: {
    icon: "bg-blue-50 text-blue-600",
    trend: "text-blue-500",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    trend: "text-emerald-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    trend: "text-amber-500",
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
    accent: "bg-sky-50 text-sky-600",
  },
  {
    title: "Leave Utilization",
    description: "Leave balances, pending approvals, approved days, and absence patterns.",
    icon: ClipboardCheck,
    accent: "bg-amber-50 text-amber-600",
  },
  {
    title: "Payroll Overview",
    description: "Payroll totals, deductions, allowances, and monthly compensation trends.",
    icon: WalletCards,
    accent: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "Training & Skills",
    description: "Skill gaps, training attendance, certifications, and development progress.",
    icon: GraduationCap,
    accent: "bg-violet-50 text-violet-600",
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
  const [departments, setDepartments] = useState<DepartmentMetric[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = user?.organizationId;
  const role = user?.roleLevel;
  const isHod = role === Role.HOD;

  useEffect(() => {
    if (!accessToken || !orgId || !role) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const suggestionsRequest = isHod
      ? SimsService.getDepartment(accessToken, { limit: 1000 }).then((res) => res.data)
      : SimsService.getAll(accessToken, { limit: 1000 }).then((res) => res.data);

    Promise.all([
      EmployeeService.getDepartments(orgId, accessToken),
      suggestionsRequest,
    ])
      .then(([departmentResponse, suggestionResponse]) => {
        if (cancelled) return;
        setDepartments(
          departmentResponse.map((department) => ({
            id: department.id,
            name: department.name,
            count: department._count.employees,
          })),
        );
        setSuggestions(suggestionResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load reports.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, orgId, role, isHod]);

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
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics & Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              {isHod ? "Department-level" : "Organization-wide"} workforce and suggestion metrics from live system data.
            </p>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || !!error}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.style.icon}`}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <stat.icon className="h-5 w-5" />}
                </div>
                <TrendingUp className={`h-4 w-4 ${stat.style.trend} opacity-50`} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">{stat.value}</h3>
              <div className="flex items-center justify-between mt-1 gap-3">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-xs text-slate-400 text-right">{loading ? "Loading" : stat.trend}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6 gap-4">
              <h2 className="font-semibold text-slate-800">Headcount by Department</h2>
              {!loading && <span className="text-xs text-slate-400">{departmentData.length} active departments</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading department data...</span>
              </div>
            ) : departmentData.length > 0 ? (
              <div className="space-y-5 max-h-96 overflow-y-auto pr-1">
                {departmentData.map((department) => (
                  <div key={department.id}>
                    <div className="flex justify-between text-sm mb-2 gap-3">
                      <span className="font-medium text-slate-700 truncate">{department.name}</span>
                      <span className="text-slate-500 shrink-0">{department.count} employees</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-700"
                        style={{ width: `${department.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-12">No department headcount data available.</p>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6 gap-4">
              <h2 className="font-semibold text-slate-800">Suggestion Status Breakdown</h2>
              {!loading && <span className="text-xs text-slate-400">{suggestions.length} total</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading suggestion data...</span>
              </div>
            ) : statusData.length > 0 ? (
              <div className="space-y-5">
                {statusData.map((item) => (
                  <div key={item.status}>
                    <div className="flex justify-between text-sm mb-2 gap-3">
                      <span className="font-medium text-slate-700">{STATUS_LABELS[item.status as SuggestionStatus] ?? item.status}</span>
                      <span className="text-slate-500 shrink-0">{item.count} items</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${STATUS_COLORS[item.status] ?? "bg-slate-400"}`}
                        style={{ width: `${Math.max(6, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-12">No suggestion data available.</p>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Report Library</h2>
                <p className="text-xs text-slate-400 mt-1">Live reports available now, with planned report surfaces ready for future modules.</p>
              </div>
              <span className="text-xs text-slate-400">{plannedReports.length + 2} report areas</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-emerald-600 shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Workforce Snapshot</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Live</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Headcount and department distribution from employee records.
                    </p>
                    <p className="text-xs font-semibold text-emerald-700 mt-3">
                      {loading ? "Loading..." : `${metrics.totalHeadcount.toLocaleString()} employees - ${departments.length} departments`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-blue-600 shrink-0">
                    <Lightbulb className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">SIMS Performance</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Live</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Suggestion totals, open actions, and implementation progress.
                    </p>
                    <p className="text-xs font-semibold text-blue-700 mt-3">
                      {loading ? "Loading..." : `${suggestions.length.toLocaleString()} suggestions - ${metrics.implementationRate}% implemented`}
                    </p>
                  </div>
                </div>
              </div>

              {plannedReports.map((report) => (
                <div key={report.title} className="rounded-xl border border-slate-100 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${report.accent}`}>
                      <report.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Planned</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{report.description}</p>
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
