"use client";

import { useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  Area, AreaChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Target, Zap, Award, AlertTriangle, FileSpreadsheet, Download } from "lucide-react";
import { CATEGORY_COLORS, STATUS_COLORS, CHART_TOOLTIP_STYLE, KpiCard, ChartCard } from "@/components/sims/sims-ui";

// ─── Chart-specific labels (shorter than the shared sims-ui labels, to fit axes) ──

const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  QUALITY: "Quality", COST: "Cost", DELIVERY: "Delivery",
  SAFETY: "Safety", MORALE: "Morale", TECHNOLOGY: "Technology", UNKNOWN: "Unknown",
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW: "Waiting for Review", UNDER_REVIEW: "Under Review", ON_HOLD: "On Hold",
  SELECTED_FOR_SGA: "Selected for SGA", APPROVED_FOR_IMPLEMENTATION: "Approved for Impl.",
  IMPLEMENTED: "Implemented", REJECTED: "Rejected",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS) as SuggestionCategory[];
const ALL_STATUSES   = Object.keys(STATUS_COLORS)   as SuggestionStatus[];

const tooltipStyle = CHART_TOOLTIP_STYLE;

// ─── Helper: group suggestions by month ─────────────────────────────────────

function byMonth(suggestions: Suggestion[]) {
  const map: Record<string, number> = {};
  suggestions.forEach((s) => {
    const d   = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key]  = (map[key] ?? 0) + 1;
  });
  const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  return sorted.map(([key, count]) => {
    const [yr, mo] = key.split("-");
    const label = new Date(Number(yr), Number(mo) - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return { month: label, submissions: count };
  });
}

// ─── Helper: last N months as { key: "YYYY-MM", label } options ────────────

function buildRecentMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
}

const REPORT_MONTHS = buildRecentMonths(12);

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: ["sims-analytics", role],
    queryFn: () => role === Role.HOD
      ? SimsService.getDepartment(accessToken!, { limit: 1000 }).then((r) => r.data)
      : SimsService.getAll(accessToken!, { limit: 1000 }).then((r) => r.data),
    enabled: !!accessToken && !!role,
  });

  // ── Derived data ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total       = suggestions.length;
    const approved    = suggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const rejected    = suggestions.filter((s) => s.status === "REJECTED").length;
    const pending     = suggestions.filter((s) => ["UNDER_REVIEW", "SELECTED_FOR_SGA"].includes(s.status)).length;
    const onHold      = suggestions.filter((s) => s.status === "ON_HOLD").length;
    const approvalRate= total > 0 ? Math.round((approved / total) * 100) : 0;
    const rejRate     = total > 0 ? Math.round((rejected / total) * 100) : 0;
    return { total, implemented: approved, approved, rejected, pending, clarify: onHold, impRate: approvalRate, approvalRate, rejRate };
  }, [suggestions]);

  const categoryData = useMemo(() =>
    ALL_CATEGORIES.map((cat) => ({
      name: CATEGORY_LABELS[cat],
      value: suggestions.filter((s) => s.categories.includes(cat)).length,
      color: CATEGORY_COLORS[cat],
      implemented: suggestions.filter((s) => s.categories.includes(cat) && s.status === "APPROVED_FOR_IMPLEMENTATION").length,
      approved:    suggestions.filter((s) => s.categories.includes(cat) && s.status === "APPROVED_FOR_IMPLEMENTATION").length,
    })),
    [suggestions]
  );

  const statusData = useMemo(() =>
    ALL_STATUSES
      .map((st) => ({ name: STATUS_LABELS[st], value: suggestions.filter((s) => s.status === st).length, color: STATUS_COLORS[st] }))
      .filter((d) => d.value > 0),
    [suggestions]
  );

  const trendData = useMemo(() => byMonth(suggestions), [suggestions]);

  const departmentData = useMemo(() => {
    const map: Record<string, { total: number; implemented: number; approved: number }> = {};
    suggestions.forEach((s) => {
      const dept = s.employee?.department?.name ?? "Unknown";
      if (!map[dept]) map[dept] = { total: 0, implemented: 0, approved: 0 };
      map[dept].total++;
      if (s.status === "APPROVED_FOR_IMPLEMENTATION") map[dept].implemented++;
      if (s.status === "APPROVED_FOR_IMPLEMENTATION") map[dept].approved++;
    });
    return Object.entries(map)
      .map(([dept, d]) => ({ dept, ...d, rate: d.total > 0 ? Math.round((d.implemented / d.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [suggestions]);

  const radarData = useMemo(() =>
    ALL_CATEGORIES.map((cat) => {
      const catSugs = suggestions.filter((s) => s.categories.includes(cat));
      const total   = catSugs.length;
      const impl    = catSugs.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
      return {
        category: CATEGORY_LABELS[cat],
        submissions: total,
        implemented: impl,
        successRate: total > 0 ? Math.round((impl / total) * 100) : 0,
      };
    }),
    [suggestions]
  );

  // ── Monthly report ──────────────────────────────────────────────────────

  const [reportMonth, setReportMonth]     = useState(REPORT_MONTHS[0].key);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const monthSuggestions = useMemo(() => {
    const [yr, mo] = reportMonth.split("-").map(Number);
    return suggestions.filter((s) => {
      const d = new Date(s.createdAt);
      return d.getFullYear() === yr && d.getMonth() + 1 === mo;
    });
  }, [suggestions, reportMonth]);

  // HOD's suggestion feed is already scoped server-side to their own department.
  const departmentName = useMemo(
    () => suggestions.find((s) => s.employee?.department?.name)?.employee?.department?.name ?? "My Department",
    [suggestions]
  );

  const reportScopeLabel = role === Role.HOD ? departmentName : (user?.organizationName || "Company-wide");

  async function handleDownloadReport() {
    setDownloadingReport(true);
    try {
      const XLSX = await import("xlsx");
      const monthLabel = REPORT_MONTHS.find((m) => m.key === reportMonth)?.label ?? reportMonth;

      const total    = monthSuggestions.length;
      const approved = monthSuggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
      const rejected = monthSuggestions.filter((s) => s.status === "REJECTED").length;
      const pending  = monthSuggestions.filter((s) => ["UNDER_REVIEW", "SELECTED_FOR_SGA", "WAITING_FOR_REVIEW"].includes(s.status)).length;
      const onHold   = monthSuggestions.filter((s) => s.status === "ON_HOLD").length;
      const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

      const summaryAoa: (string | number)[][] = [
        ["SIMS Monthly Report"],
        [`Scope: ${reportScopeLabel}`],
        [`Month: ${monthLabel}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ["Metric", "Value"],
        ["Total Suggestions", total],
        ["Approved for Implementation", approved],
        ["Rejected", rejected],
        ["Pending Review", pending],
        ["On Hold", onHold],
        ["Approval Rate", `${approvalRate}%`],
        [],
        ["Category", "Submissions", "Implemented"],
        ...ALL_CATEGORIES.map((cat) => [
          CATEGORY_LABELS[cat],
          monthSuggestions.filter((s) => s.categories.includes(cat)).length,
          monthSuggestions.filter((s) => s.categories.includes(cat) && s.status === "APPROVED_FOR_IMPLEMENTATION").length,
        ]),
        [],
        ["Status", "Count", "% of Month Total"],
        ...ALL_STATUSES.map((st) => {
          const count = monthSuggestions.filter((s) => s.status === st).length;
          return [STATUS_LABELS[st], count, total > 0 ? `${Math.round((count / total) * 100)}%` : "0%"];
        }),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }];

      const suggestionsAoa: (string | number)[][] = [
        ["Title", "Employee", "Department", "Categories", "Status", "Implementation Status", "Submitted On", "Reviewed By (HOD)"],
        ...monthSuggestions
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((s) => [
            s.title,
            s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Anonymous",
            s.employee?.department?.name ?? "-",
            s.categories.map((c) => CATEGORY_LABELS[c]).join(", "),
            STATUS_LABELS[s.status],
            s.implementationStatus ?? "-",
            new Date(s.createdAt).toLocaleDateString(),
            s.hod ? `${s.hod.firstName} ${s.hod.lastName}` : "-",
          ]),
      ];
      const suggestionsSheet = XLSX.utils.aoa_to_sheet(suggestionsAoa);
      suggestionsSheet["!cols"] = [
        { wch: 32 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 20 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
      XLSX.utils.book_append_sheet(workbook, suggestionsSheet, "Suggestions");

      const fileScope = reportScopeLabel.replace(/[^a-z0-9]+/gi, "-");
      const fileMonth = monthLabel.replace(/\s+/g, "-");
      XLSX.writeFile(workbook, `SIMS-Report-${fileScope}-${fileMonth}.xlsx`);
    } finally {
      setDownloadingReport(false);
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
        <div className="flex items-center justify-center h-96 text-slate-400 text-sm">Building analytics...</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="hidden sm:block text-sm text-slate-500 mt-1">
            {role === Role.HOD ? "Department performance insights." : "Organisation-wide suggestion intelligence."}
            {" "}<span className="font-medium text-slate-700">{kpis.total} total suggestions analysed.</span>
          </p>
        </div>

        {/* Monthly report */}
        <div className="bg-white border border-slate-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0 sm:hidden">
              <p className="text-sm font-bold text-slate-800">Monthly Report</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {role === Role.HOD ? `Department report for ${reportScopeLabel}` : `Company-wide report for ${reportScopeLabel}`}
              </p>
              <p className="text-xs text-slate-400">
                {monthSuggestions.length} suggestion{monthSuggestions.length !== 1 ? "s" : ""} in selected month
              </p>
            </div>
          </div>
          <div className="hidden sm:block flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Monthly Report</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {role === Role.HOD ? `Department report for ${reportScopeLabel}` : `Company-wide report for ${reportScopeLabel}`}
              {" · "}{monthSuggestions.length} suggestion{monthSuggestions.length !== 1 ? "s" : ""} in selected month
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:shrink-0">
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="w-full sm:w-auto text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {REPORT_MONTHS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={handleDownloadReport}
              disabled={downloadingReport}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <Download className="h-4 w-4 shrink-0" />
              {downloadingReport ? "Generating..." : "Download Report"}
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <KpiCard label="Total Suggestions"    value={kpis.total}         sub="All time"                                    trend="up"   accent="bg-blue-50"    icon={<Target className="h-5 w-5 text-blue-600" />} />
          <KpiCard label="Implementation Rate"  value={`${kpis.impRate}%`} sub={`${kpis.implemented} implemented`}          trend={kpis.impRate > 20 ? "up" : "down"} accent="bg-emerald-50" icon={<Award className="h-5 w-5 text-emerald-600" />} />
          <KpiCard label="Approval Rate"        value={`${kpis.approvalRate}%`} sub={`${kpis.approved} approved / implemented`} trend={kpis.approvalRate > 30 ? "up" : "flat"} accent="bg-indigo-50" icon={<Zap className="h-5 w-5 text-indigo-600" />} />
          <KpiCard label="Needs Attention"      value={kpis.pending + kpis.clarify} sub={`${kpis.pending} pending · ${kpis.clarify} need clarification`} trend={kpis.clarify > 0 ? "down" : "flat"} accent="bg-amber-50" icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} />
        </div>

        {/* Row 2 — Submission Trend + Status Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChartCard title="Submission Trend" subtitle="Monthly suggestion volume over the last 12 months">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="submissions" stroke="#3b82f6" strokeWidth={2.5} fill="url(#areaGrad)" dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 6 }} name="Submissions" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Status Distribution" subtitle="Current breakdown by status">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(val, name) => [val, name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 3 — QCDSMT Category + Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChartCard title="QCDSMT Category Performance" subtitle="Submissions vs implementations per category">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="value"       name="Submitted"   radius={[6,6,0,0]}>
                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.25} />)}
                  </Bar>
                  <Bar dataKey="implemented" name="Implemented" radius={[6,6,0,0]}>
                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Category Weightage" subtitle="Total weight score per QCDSMT category">
            <div className="space-y-3 mt-2">
              {categoryData.filter((c) => c.value > 0).map((c) => {
                const maxVal = Math.max(...categoryData.map((x) => x.value), 1);
                const pct    = Math.round((c.value / maxVal) * 100);
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700">{c.name}</span>
                      <span className="text-slate-400">{c.value} suggestion{c.value !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        {/* Row 4 — Department comparison + Radar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChartCard title="Department Comparison" subtitle="Suggestion volume and implementation by department">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={departmentData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="dept" width={90} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="total"       name="Total"       fill="#e0e7ff" radius={[0,6,6,0]} />
                  <Bar dataKey="approved"    name="Approved"    fill="#818cf8" radius={[0,6,6,0]} />
                  <Bar dataKey="implemented" name="Implemented" fill="#10b981" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="QCDSMT Radar" subtitle="Submission volume by category (normalised)">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} />
                <Radar name="Submissions"  dataKey="submissions"  stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Implemented"  dataKey="implemented"  stroke="#10b981" fill="#10b981" fillOpacity={0.2}  strokeWidth={2} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 5 — Cumulative trend + Category success rates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="QCDSMT Success Rates" subtitle="Percentage of submissions implemented per category">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData.map((c) => ({ ...c, rate: c.value > 0 ? Math.round((c.implemented / c.value) * 100) : 0 }))} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Success Rate"]} />
                <Bar dataKey="rate" name="Success Rate" radius={[6,6,0,0]}>
                  {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status Flow" subtitle="Distribution across the suggestion lifecycle">
            <div className="space-y-2.5 mt-2">
              {statusData.map((s) => {
                const pct = kpis.total > 0 ? Math.round((s.value / kpis.total) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="font-medium text-slate-700">{s.name}</span>
                      </div>
                      <span className="text-slate-400">{s.value} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

      </div>
    </ProtectedRoute>
  );
}
