"use client";

import { useEffect, useState, useMemo } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus } from "@/services/sims.service";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  Area, AreaChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Target, Zap, Award, AlertTriangle } from "lucide-react";

// ─── Colour palettes ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  QUALITY:    "#3b82f6",
  COST:       "#10b981",
  DELIVERY:   "#8b5cf6",
  SAFETY:     "#ef4444",
  MORALE:     "#f59e0b",
  TECHNOLOGY: "#6366f1",
};

const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  QUALITY: "Quality", COST: "Cost", DELIVERY: "Delivery",
  SAFETY: "Safety", MORALE: "Morale", TECHNOLOGY: "Technology",
};

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  SUBMITTED:           "#3b82f6",
  UNDER_REVIEW:        "#f59e0b",
  NEEDS_CLARIFICATION: "#f97316",
  APPROVED:            "#22c55e",
  REJECTED:            "#ef4444",
  IMPLEMENTED:         "#10b981",
  ARCHIVED:            "#94a3b8",
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review", NEEDS_CLARIFICATION: "Needs Clarification",
  APPROVED: "Approved", REJECTED: "Rejected", IMPLEMENTED: "Implemented", ARCHIVED: "Archived",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS) as SuggestionCategory[];
const ALL_STATUSES   = Object.keys(STATUS_COLORS)   as SuggestionStatus[];

// ─── Tooltip styles ─────────────────────────────────────────────────────────

const tooltipStyle = { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: "12px" };

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

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend, icon, accent }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "flat"; icon: React.ReactNode; accent: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400";
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
        {trend && <TrendIcon className={`h-4 w-4 ${trendColor}`} />}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Chart Card wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !role) return;
    const fetch = role === Role.HOD
      ? SimsService.getDepartment(accessToken, { limit: 1000 }).then((r) => r.data)
      : SimsService.getAll(accessToken, { limit: 1000 }).then((r) => r.data);
    fetch.then(setSuggestions).catch(console.error).finally(() => setLoading(false));
  }, [accessToken, role]);

  // ── Derived data ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total       = suggestions.length;
    const implemented = suggestions.filter((s) => s.status === "IMPLEMENTED").length;
    const approved    = suggestions.filter((s) => ["APPROVED","IMPLEMENTED"].includes(s.status)).length;
    const rejected    = suggestions.filter((s) => s.status === "REJECTED").length;
    const pending     = suggestions.filter((s) => ["SUBMITTED","UNDER_REVIEW"].includes(s.status)).length;
    const clarify     = suggestions.filter((s) => s.status === "NEEDS_CLARIFICATION").length;
    const impRate     = total > 0 ? Math.round((implemented / total) * 100) : 0;
    const approvalRate= total > 0 ? Math.round((approved / total) * 100)    : 0;
    const rejRate     = total > 0 ? Math.round((rejected / total) * 100)    : 0;
    return { total, implemented, approved, rejected, pending, clarify, impRate, approvalRate, rejRate };
  }, [suggestions]);

  const categoryData = useMemo(() =>
    ALL_CATEGORIES.map((cat) => ({
      name: CATEGORY_LABELS[cat],
      value: suggestions.filter((s) => s.category === cat).length,
      color: CATEGORY_COLORS[cat],
      implemented: suggestions.filter((s) => s.category === cat && s.status === "IMPLEMENTED").length,
      approved:    suggestions.filter((s) => s.category === cat && ["APPROVED","IMPLEMENTED"].includes(s.status)).length,
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
      if (s.status === "IMPLEMENTED") map[dept].implemented++;
      if (["APPROVED","IMPLEMENTED"].includes(s.status)) map[dept].approved++;
    });
    return Object.entries(map)
      .map(([dept, d]) => ({ dept, ...d, rate: d.total > 0 ? Math.round((d.implemented / d.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [suggestions]);

  const radarData = useMemo(() =>
    ALL_CATEGORIES.map((cat) => {
      const catSugs = suggestions.filter((s) => s.category === cat);
      const total   = catSugs.length;
      const impl    = catSugs.filter((s) => s.status === "IMPLEMENTED").length;
      return {
        category: CATEGORY_LABELS[cat],
        submissions: total,
        implemented: impl,
        successRate: total > 0 ? Math.round((impl / total) * 100) : 0,
      };
    }),
    [suggestions]
  );

  const priorityData = useMemo(() =>
    ["CRITICAL","HIGH","MEDIUM","LOW"].map((p) => ({
      name: p.charAt(0) + p.slice(1).toLowerCase(),
      value: suggestions.filter((s) => s.priority === p).length,
    })),
    [suggestions]
  );

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
        <div className="flex items-center justify-center h-96 text-slate-400 text-sm">Building analytics...</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === Role.HOD ? "Department performance insights." : "Organisation-wide suggestion intelligence."}
            {" "}<span className="font-medium text-slate-700">{kpis.total} total suggestions analysed.</span>
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          <ChartCard title="Priority Distribution" subtitle="Breakdown by impact priority">
            <div className="space-y-3 mt-2">
              {priorityData.map((p) => {
                const total = kpis.total || 1;
                const pct   = Math.round((p.value / total) * 100);
                const color = p.name === "Critical" ? "bg-red-500" : p.name === "High" ? "bg-amber-400" : p.name === "Medium" ? "bg-blue-400" : "bg-slate-300";
                return (
                  <div key={p.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-700">{p.name}</span>
                      <span className="text-slate-400">{p.value} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mini pie */}
            <ResponsiveContainer width="100%" height={140} className="mt-4">
              <PieChart>
                <Pie data={priorityData} cx="50%" cy="50%" outerRadius={55} dataKey="value" paddingAngle={2}>
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={["#ef4444","#f59e0b","#3b82f6","#94a3b8"][i]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
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
