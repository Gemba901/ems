"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { AdminService, PlatformStats, Organization } from "@/services/admin.service";
import {
    Building2, Users, Lightbulb, TrendingUp,
    ArrowUpRight, CircleDot, ChevronRight, Activity,
} from "lucide-react";

const STATUS_CONFIG = {
    ACTIVE:    { label: "Active",    dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    SUSPENDED: { label: "Suspended", dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    INACTIVE:  { label: "Inactive",  dot: "bg-slate-500",   badge: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

function StatCard({
    label, value, sub, icon: Icon, accent, delta,
}: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; accent: string; delta?: string;
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent}`}>
                    <Icon className="h-4.5 w-4.5" />
                </div>
                {delta && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <ArrowUpRight className="h-3 w-3" /> {delta}
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
            {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
        </div>
    );
}

export default function AdminDashboardPage() {
    const { accessToken } = useAuthStore();
    const router = useRouter();

    const [stats, setStats]   = useState<PlatformStats | null>(null);
    const [orgs, setOrgs]     = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!accessToken) return;
        Promise.all([
            AdminService.getPlatformStats(accessToken),
            AdminService.listOrganizations(accessToken, 1, 5),
        ])
            .then(([s, o]) => { setStats(s); setOrgs(o.data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessToken]);

    const today = new Date().toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    return (
        <div className="max-w-6xl mx-auto space-y-7">

            {/* Page header */}
            <div className="flex items-end justify-between">
                <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">{today}</p>
                    <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
                </div>
                <Link
                    href="/admin/organizations"
                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                    All organizations <ChevronRight className="h-4 w-4" />
                </Link>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Organizations"
                    value={loading ? "—" : stats?.organizationCount ?? 0}
                    sub={loading ? undefined : `${stats?.byStatus.active ?? 0} active`}
                    delta={loading || !stats?.last30Days.newOrganizations ? undefined : `+${stats.last30Days.newOrganizations} this month`}
                    icon={Building2}
                    accent="bg-indigo-50 text-indigo-600"
                />
                <StatCard
                    label="Total Employees"
                    value={loading ? "—" : stats?.employeeCount ?? 0}
                    sub={loading ? undefined : `+${stats?.last30Days.newEmployees ?? 0} in last 30 days`}
                    icon={Users}
                    accent="bg-sky-50 text-sky-600"
                />
                <StatCard
                    label="Suggestions"
                    value={loading ? "—" : stats?.suggestionCount ?? 0}
                    sub={loading ? undefined : `${stats?.suggestionsByStatus?.["IMPLEMENTED"] ?? 0} implemented`}
                    icon={Lightbulb}
                    accent="bg-amber-50 text-amber-600"
                />
                <StatCard
                    label="Implementation Rate"
                    value={loading ? "—" : `${stats?.implementationRate ?? 0}%`}
                    sub="Across all organizations"
                    icon={TrendingUp}
                    accent="bg-emerald-50 text-emerald-600"
                />
            </div>

            {/* Status breakdown + Suggestion pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Org health */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-5">
                        <Activity className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Organization Health</p>
                    </div>
                    {loading ? (
                        <p className="text-sm text-slate-400">Loading...</p>
                    ) : (
                        <div className="space-y-4">
                            {(["active", "suspended", "inactive"] as const).map((key) => {
                                const count = stats?.byStatus[key] ?? 0;
                                const total = stats?.organizationCount || 1;
                                const pct   = Math.round((count / total) * 100);
                                const cfg   = STATUS_CONFIG[key.toUpperCase() as keyof typeof STATUS_CONFIG];
                                return (
                                    <div key={key}>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-2 font-medium text-slate-700">
                                                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </span>
                                            <span className="text-slate-400 tabular-nums">{count} ({pct}%)</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${cfg.dot}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Suggestion pipeline */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-5">
                        <Lightbulb className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Suggestion Pipeline</p>
                    </div>
                    {loading ? (
                        <p className="text-sm text-slate-400">Loading...</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                { label: "Submitted",    key: "SUBMITTED",           color: "text-sky-600",     bg: "bg-sky-50" },
                                { label: "Under Review", key: "UNDER_REVIEW",        color: "text-amber-600",   bg: "bg-amber-50" },
                                { label: "Needs Input",  key: "NEEDS_CLARIFICATION", color: "text-orange-600",  bg: "bg-orange-50" },
                                { label: "Approved",     key: "APPROVED",            color: "text-indigo-600",  bg: "bg-indigo-50" },
                                { label: "Implemented",  key: "IMPLEMENTED",         color: "text-emerald-600", bg: "bg-emerald-50" },
                                { label: "Rejected",     key: "REJECTED",            color: "text-red-500",     bg: "bg-red-50" },
                            ].map(({ label, key, color, bg }) => (
                                <div key={key} className={`${bg} rounded-lg px-4 py-3`}>
                                    <p className={`text-xl font-bold tabular-nums ${color}`}>
                                        {stats?.suggestionsByStatus?.[key] ?? 0}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Recent organizations */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">Recent Organizations</p>
                    <Link
                        href="/admin/organizations"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                        View all <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Organization</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Employees</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Departments</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading && (
                            <tr>
                                <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                                    Loading...
                                </td>
                            </tr>
                        )}
                        {!loading && orgs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">
                                    No organizations yet.
                                </td>
                            </tr>
                        )}
                        {!loading && orgs.map((org) => {
                            const sc = STATUS_CONFIG[org.status];
                            return (
                                <tr
                                    key={org.id}
                                    className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                                    onClick={() => router.push(`/admin/organizations/${org.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {org.logoUrl ? (
                                                <img src={org.logoUrl} alt={org.name} className="h-7 w-7 rounded-lg object-cover shrink-0" />
                                            ) : (
                                                <div className="h-7 w-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                                                    {org.name[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-semibold text-slate-900 text-sm">{org.name}</p>
                                                {org.industry && (
                                                    <p className="text-[11px] text-slate-400">{org.industry}</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sc.badge}`}>
                                            <CircleDot className="h-2.5 w-2.5" />
                                            {sc.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 tabular-nums">{org._count.employees}</td>
                                    <td className="px-6 py-4 text-slate-600 tabular-nums">{org._count.departments}</td>
                                    <td className="px-6 py-4 text-slate-400 text-xs whitespace-nowrap">
                                        {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-auto" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
