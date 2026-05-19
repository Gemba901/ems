"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, OrgStatsResponse } from "@/services/employee.service";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Users, UserCheck, UserX, TrendingUp, Building2,
    ShieldCheck, Loader2, ArrowLeft, Calendar,
    CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import Link from "next/link";

const ROLE_COLORS: Record<string, string> = {
    SUPER_ADMIN: "bg-purple-500",
    ADMIN:       "bg-indigo-500",
    MANAGEMENT:  "bg-blue-500",
    HR:          "bg-rose-500",
    HOD:         "bg-amber-500",
    EMPLOYEE:    "bg-slate-400",
};

const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN:       "Admin",
    MANAGEMENT:  "Management",
    HR:          "HR",
    HOD:         "Head of Dept",
    EMPLOYEE:    "Employee",
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function MiniRing({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
    const r = 15;
    const circ = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(pct, 100));
    const dash = (clamped / 100) * circ;
    return (
        <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90 shrink-0">
            <circle cx="19" cy="19" r={r} fill="none" strokeWidth="4.5" className={trackColor} />
            <circle cx="19" cy="19" r={r} fill="none" strokeWidth="4.5"
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                className={`transition-all duration-700 ${color}`} />
        </svg>
    );
}

interface KpiCardProps {
    label: string;
    value: number | null;
    sub?: string;
    icon: React.ElementType;
    gradient: string;
    border: string;
    iconBg: string;
    iconColor: string;
    numColor: string;
    labelColor: string;
    subColor: string;
    loading: boolean;
    ring?: { pct: number; color: string; track: string };
}

function KpiCard({ label, value, sub, icon: Icon, gradient, border, iconBg, iconColor, numColor, labelColor, subColor, loading, ring }: KpiCardProps) {
    return (
        <div className={`rounded-2xl border ${border} bg-gradient-to-br ${gradient} p-5 flex flex-col gap-4`}>
            <div className="flex items-start justify-between">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                {ring && !loading && <MiniRing pct={ring.pct} color={ring.color} trackColor={ring.track} />}
                {ring && loading && <div className="h-9 w-9 rounded-full bg-white/40 animate-pulse" />}
            </div>
            <div>
                {loading || value === null ? (
                    <div className="h-8 w-20 rounded-lg bg-white/50 animate-pulse mb-1.5" />
                ) : (
                    <p className={`text-3xl font-bold tabular-nums leading-none ${numColor}`}>
                        {value.toLocaleString()}
                    </p>
                )}
                <p className={`text-sm font-semibold mt-2 ${labelColor}`}>{label}</p>
                {sub && !loading && value !== null && (
                    <p className={`text-xs mt-0.5 ${subColor}`}>{sub}</p>
                )}
            </div>
        </div>
    );
}

function BarRow({ label, count, total, color, track }: { label: string; count: number; total: number; color: string; track?: string }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 truncate max-w-[200px]">{label}</span>
                <span className="shrink-0 ml-3 tabular-nums font-semibold text-slate-500">
                    {count.toLocaleString()} <span className="font-normal text-slate-300">· {pct}%</span>
                </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${track ?? "bg-slate-100"}`}>
                <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function ActivationDonut({ pct, active, pending, total, loading }: {
    pct: number; active: number; pending: number; total: number; loading: boolean;
}) {
    const r = 54;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-800">Account Activation</p>
            </div>

            {/* Donut */}
            <div className="relative flex items-center justify-center mx-auto" style={{ width: 140, height: 140 }}>
                {loading ? (
                    <div className="h-full w-full rounded-full bg-slate-100 animate-pulse" />
                ) : (
                    <>
                        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
                            <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
                            <circle cx="70" cy="70" r={r} fill="none" stroke="#22c55e" strokeWidth="16"
                                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                                className="transition-all duration-1000" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-slate-900 leading-none">{pct}%</span>
                            <span className="text-[11px] text-slate-400 font-medium mt-0.5">activated</span>
                        </div>
                    </>
                )}
            </div>

            {/* Legend */}
            {!loading && (
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                            Active accounts
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">{active.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600">
                            <span className="h-2.5 w-2.5 rounded-full bg-slate-200 shrink-0" />
                            Pending setup
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">{pending.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Total workforce</span>
                        <span className="font-bold text-slate-900 tabular-nums">{total.toLocaleString()}</span>
                    </div>
                </div>
            )}
            {loading && (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-4 rounded bg-slate-100 animate-pulse" />)}
                </div>
            )}
        </div>
    );
}

function RecentHiresTable({ employees, loading }: { employees: OrgStatsResponse["recentEmployees"]; loading: boolean }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-800">Recent Hires</p>
                <span className="ml-auto text-xs text-slate-400">Last 10 onboarded</span>
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                </div>
            ) : employees.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No employees yet.</p>
            ) : (
                <div className="divide-y divide-slate-50">
                    {employees.map((emp) => {
                        const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase();
                        const joined = new Date(emp.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                        });
                        return (
                            <div key={emp.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/70 transition-colors">
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-indigo-700">{initials}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900 truncate">{emp.firstName} {emp.lastName}</p>
                                    <p className="text-xs text-slate-400 truncate">{emp.email}</p>
                                </div>
                                <div className="hidden sm:block text-xs text-slate-500 shrink-0 min-w-[110px] text-right">
                                    {emp.department ?? <span className="text-slate-300">No dept</span>}
                                </div>
                                <div className="hidden md:block text-xs text-slate-400 shrink-0 min-w-[90px] text-right tabular-nums">
                                    {joined}
                                </div>
                                <div className="shrink-0">
                                    {emp.hasActiveAccount ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                            <CheckCircle2 className="h-3 w-3" /> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                                            <Clock className="h-3 w-3" /> Pending
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ReportsContent() {
    const { user, accessToken } = useAuthStore();

    const orgId = user?.organizationId ?? "";

    const { data: stats, isLoading: loading, error: queryError } = useQuery({
        queryKey: ["hr-reports"],
        queryFn: () => EmployeeService.getOrgStats(orgId, accessToken!),
        enabled: !!accessToken && !!orgId,
    });

    const error = queryError ? (queryError as any).message || "Failed to load reports" : null;

    const activePct = useMemo(() => stats && stats.total > 0
        ? Math.round((stats.withAccounts / stats.total) * 100) : 0, [stats]);
    const pendingPct = useMemo(() => 100 - activePct, [activePct]);
    const newPct = useMemo(() => stats && stats.total > 0
        ? Math.round((stats.recentlyAdded / stats.total) * 100) : 0, [stats]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">

            {/* Header */}
            <div>
                <Link href="/hr" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-3">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to HR Dashboard
                </Link>
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">HR Analytics</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Workforce insights for your organization.</p>
                    </div>
                    {!loading && stats && (
                        <p className="hidden sm:block text-xs text-slate-400 pb-0.5">
                            {stats.total.toLocaleString()} employees across {stats.byDepartment.length} departments
                        </p>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Employees"
                    value={stats?.total ?? null}
                    sub="Across all departments"
                    icon={Users}
                    gradient="from-slate-50 to-slate-100/80"
                    border="border-slate-200"
                    iconBg="bg-white shadow-sm"
                    iconColor="text-slate-600"
                    numColor="text-slate-900"
                    labelColor="text-slate-600"
                    subColor="text-slate-400"
                    loading={loading}
                    ring={{ pct: 100, color: "stroke-slate-300", track: "stroke-slate-100" }}
                />
                <KpiCard
                    label="Active Accounts"
                    value={stats?.withAccounts ?? null}
                    sub={stats ? `${activePct}% of total workforce` : undefined}
                    icon={UserCheck}
                    gradient="from-emerald-50 to-emerald-100/60"
                    border="border-emerald-200"
                    iconBg="bg-white shadow-sm"
                    iconColor="text-emerald-600"
                    numColor="text-emerald-900"
                    labelColor="text-emerald-700"
                    subColor="text-emerald-500"
                    loading={loading}
                    ring={{ pct: activePct, color: "stroke-emerald-500", track: "stroke-emerald-100" }}
                />
                <KpiCard
                    label="Pending Setup"
                    value={stats?.withoutAccounts ?? null}
                    sub="Password not yet set"
                    icon={UserX}
                    gradient="from-amber-50 to-amber-100/60"
                    border="border-amber-200"
                    iconBg="bg-white shadow-sm"
                    iconColor="text-amber-600"
                    numColor="text-amber-900"
                    labelColor="text-amber-700"
                    subColor="text-amber-500"
                    loading={loading}
                    ring={{ pct: pendingPct, color: "stroke-amber-400", track: "stroke-amber-100" }}
                />
                <KpiCard
                    label="New This Month"
                    value={stats?.recentlyAdded ?? null}
                    sub="Onboarded last 30 days"
                    icon={TrendingUp}
                    gradient="from-indigo-50 to-indigo-100/60"
                    border="border-indigo-200"
                    iconBg="bg-white shadow-sm"
                    iconColor="text-indigo-600"
                    numColor="text-indigo-900"
                    labelColor="text-indigo-700"
                    subColor="text-indigo-400"
                    loading={loading}
                    ring={{ pct: newPct, color: "stroke-indigo-500", track: "stroke-indigo-100" }}
                />
            </div>

            {/* Activation donut + department breakdown */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <ActivationDonut
                    pct={activePct}
                    active={stats?.withAccounts ?? 0}
                    pending={stats?.withoutAccounts ?? 0}
                    total={stats?.total ?? 0}
                    loading={loading}
                />

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 xl:col-span-2">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Headcount by Department</p>
                        {stats && <span className="ml-auto text-xs text-slate-400">{stats.byDepartment.length} departments</span>}
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
                        </div>
                    ) : stats && stats.byDepartment.length > 0 ? (
                        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                            {stats.byDepartment.map((dept) => (
                                <BarRow key={dept.name} label={dept.name} count={dept.count} total={stats.total} color="bg-indigo-500" />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">No department data available.</p>
                    )}
                </div>
            </div>

            {/* Role distribution */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-800">Role Distribution</p>
                    {stats && (
                        <span className="ml-auto text-xs text-slate-400">
                            Based on {stats.withAccounts.toLocaleString()} active accounts
                        </span>
                    )}
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
                    </div>
                ) : stats && stats.byRole.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
                        {stats.byRole.map((role) => {
                            const colorMap: Record<string, { bar: string; track: string }> = {
                                SUPER_ADMIN: { bar: "bg-purple-500", track: "bg-purple-100" },
                                ADMIN:       { bar: "bg-indigo-500", track: "bg-indigo-100" },
                                MANAGEMENT:  { bar: "bg-blue-500",   track: "bg-blue-100"   },
                                HR:          { bar: "bg-rose-500",   track: "bg-rose-100"   },
                                HOD:         { bar: "bg-amber-500",  track: "bg-amber-100"  },
                                EMPLOYEE:    { bar: "bg-slate-400",  track: "bg-slate-100"  },
                            };
                            const c = colorMap[role.name] ?? { bar: "bg-slate-400", track: "bg-slate-100" };
                            return (
                                <BarRow
                                    key={role.name}
                                    label={ROLE_LABELS[role.name] ?? role.name.replace(/_/g, " ")}
                                    count={role.count}
                                    total={stats.withAccounts}
                                    color={c.bar}
                                    track={c.track}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-slate-400 text-center py-8">No role data available.</p>
                )}
            </div>

            {/* Recent hires */}
            <RecentHiresTable employees={stats?.recentEmployees ?? []} loading={loading} />
        </div>
    );
}

export default function HRReportsPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
            <ReportsContent />
        </ProtectedRoute>
    );
}
