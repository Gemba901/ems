"use client";

import { PageHeader } from "@/components/patterns/PageHeader";
import { useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, OrgStatsResponse } from "@/services/employee.service";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Users, UserCheck, UserX, TrendingUp, Building2,
    ShieldCheck, Loader2, Calendar,
    CheckCircle2, Clock, AlertCircle,
} from "lucide-react";

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
                {ring && loading && <div className="h-9 w-9 rounded-full bg-card/40 animate-pulse" />}
            </div>
            <div>
                {loading || value === null ? (
                    <div className="h-8 w-20 rounded-lg bg-card/50 animate-pulse mb-1.5" />
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
                <span className="font-medium text-foreground truncate max-w-[200px]">{label}</span>
                <span className="shrink-0 ml-3 tabular-nums font-semibold text-muted-foreground">
                    {count.toLocaleString()} <span className="font-normal text-muted-foreground">· {pct}%</span>
                </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${track ?? "bg-muted"}`}>
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
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Account Activation</p>
            </div>

            {/* Donut */}
            <div className="relative flex items-center justify-center mx-auto" style={{ width: 140, height: 140 }}>
                {loading ? (
                    <div className="h-full w-full rounded-full bg-muted animate-pulse" />
                ) : (
                    <>
                        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
                            <circle cx="70" cy="70" r={r} fill="none" className="stroke-muted" strokeWidth="16" />
                            <circle cx="70" cy="70" r={r} fill="none" strokeWidth="16"
                                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                                className="stroke-success transition-all duration-1000" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-foreground leading-none">{pct}%</span>
                            <span className="text-[11px] text-muted-foreground font-medium mt-0.5">activated</span>
                        </div>
                    </>
                )}
            </div>

            {/* Legend */}
            {!loading && (
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full bg-success shrink-0" />
                            Active accounts
                        </span>
                        <span className="font-bold text-foreground tabular-nums">{active.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full bg-muted shrink-0" />
                            Pending setup
                        </span>
                        <span className="font-bold text-foreground tabular-nums">{pending.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-border flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total workforce</span>
                        <span className="font-bold text-foreground tabular-nums">{total.toLocaleString()}</span>
                    </div>
                </div>
            )}
            {loading && (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-4 rounded bg-muted animate-pulse" />)}
                </div>
            )}
        </div>
    );
}

function RecentHiresTable({ employees, loading }: { employees: OrgStatsResponse["recentEmployees"]; loading: boolean }) {
    return (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Recent Hires</p>
                <span className="ml-auto text-xs text-muted-foreground">Last 10 onboarded</span>
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                </div>
            ) : employees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No employees yet.</p>
            ) : (
                <div className="divide-y divide-border">
                    {employees.map((emp) => {
                        const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase();
                        const joined = new Date(emp.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                        });
                        return (
                            <div key={emp.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-muted/70 transition-colors">
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/10 to-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-primary">{initials}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{emp.firstName} {emp.lastName}</p>
                                    <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                                </div>
                                <div className="hidden sm:block text-xs text-muted-foreground shrink-0 min-w-[110px] text-right">
                                    {emp.department ?? <span className="text-muted-foreground">No dept</span>}
                                </div>
                                <div className="hidden md:block text-xs text-muted-foreground shrink-0 min-w-[90px] text-right tabular-nums">
                                    {joined}
                                </div>
                                <div className="shrink-0">
                                    {emp.hasActiveAccount ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success-subtle border border-success/20 px-2 py-0.5 rounded-full">
                                            <CheckCircle2 className="h-3 w-3" /> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-subtle border border-warning/20 px-2 py-0.5 rounded-full">
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
        queryKey: ["hr-reports", orgId],
        queryFn: () => EmployeeService.getOrgStats(orgId, accessToken!),
        enabled: !!accessToken && !!orgId,
    });

    const error = queryError ? queryError.message || "Failed to load reports" : null;

    const activePct = useMemo(() => stats && stats.total > 0
        ? Math.round((stats.withAccounts / stats.total) * 100) : 0, [stats]);
    const pendingPct = stats?.total ? 100 - activePct : 0;
    const newPct = useMemo(() => stats && stats.total > 0
        ? Math.round((stats.recentlyAdded / stats.total) * 100) : 0, [stats]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">

            <PageHeader
                title="HR Analytics"
                breadcrumbs={[{ label: "People", href: "/hr" }, { label: "Analytics" }]}
                description={stats
                    ? `${stats.total.toLocaleString()} employee${stats.total === 1 ? "" : "s"} across ${stats.byDepartment.length} department${stats.byDepartment.length === 1 ? "" : "s"}`
                    : "Workforce insights for your organization."}
            />

            {error && (
                <div role="alert" className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Employees"
                    value={stats?.total ?? null}
                    sub="Across all departments"
                    icon={Users}
                    gradient="from-muted to-muted/80"
                    border="border-border"
                    iconBg="bg-card shadow-sm"
                    iconColor="text-muted-foreground"
                    numColor="text-foreground"
                    labelColor="text-muted-foreground"
                    subColor="text-muted-foreground"
                    loading={loading}
                    ring={{ pct: 100, color: "stroke-muted-foreground", track: "stroke-muted" }}
                />
                <KpiCard
                    label="Active Accounts"
                    value={stats?.withAccounts ?? null}
                    sub={stats ? `${activePct}% of total workforce` : undefined}
                    icon={UserCheck}
                    gradient="from-success-subtle to-success-subtle/60"
                    border="border-success/20"
                    iconBg="bg-card shadow-sm"
                    iconColor="text-success"
                    numColor="text-success"
                    labelColor="text-success"
                    subColor="text-success"
                    loading={loading}
                    ring={{ pct: activePct, color: "stroke-success", track: "stroke-success-subtle" }}
                />
                <KpiCard
                    label="Pending Setup"
                    value={stats?.withoutAccounts ?? null}
                    sub="Password not yet set"
                    icon={UserX}
                    gradient="from-warning-subtle to-warning-subtle/60"
                    border="border-warning/20"
                    iconBg="bg-card shadow-sm"
                    iconColor="text-warning"
                    numColor="text-warning"
                    labelColor="text-warning"
                    subColor="text-warning"
                    loading={loading}
                    ring={{ pct: pendingPct, color: "stroke-warning", track: "stroke-warning-subtle" }}
                />
                <KpiCard
                    label="New This Month"
                    value={stats?.recentlyAdded ?? null}
                    sub="Onboarded last 30 days"
                    icon={TrendingUp}
                    gradient="from-primary/10 to-primary/10"
                    border="border-primary/20"
                    iconBg="bg-card shadow-sm"
                    iconColor="text-primary"
                    numColor="text-primary"
                    labelColor="text-primary"
                    subColor="text-primary"
                    loading={loading}
                    ring={{ pct: newPct, color: "stroke-primary", track: "stroke-primary/10" }}
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

                <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-5 xl:col-span-2">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Headcount by Department</p>
                        {stats && <span className="ml-auto text-xs text-muted-foreground">{stats.byDepartment.length} departments</span>}
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
                        </div>
                    ) : stats && stats.byDepartment.length > 0 ? (
                        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                            {stats.byDepartment.map((dept) => (
                                <BarRow key={dept.name} label={dept.name} count={dept.count} total={stats.total} color="bg-primary" />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">No department data available.</p>
                    )}
                </div>
            </div>

            {/* Role distribution */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">Role Distribution</p>
                    {stats && (
                        <span className="ml-auto text-xs text-muted-foreground">
                            Based on {stats.withAccounts.toLocaleString()} active accounts
                        </span>
                    )}
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
                    </div>
                ) : stats && stats.byRole.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
                        {stats.byRole.map((role) => {
                            const colorMap: Record<string, { bar: string; track: string }> = {
                                SUPER_ADMIN: { bar: "bg-primary", track: "bg-primary/10" },
                                ADMIN:       { bar: "bg-primary", track: "bg-primary/10" },
                                MANAGEMENT:  { bar: "bg-info",   track: "bg-info-subtle"   },
                                HR:          { bar: "bg-destructive",   track: "bg-destructive/10"   },
                                HOD:         { bar: "bg-warning",  track: "bg-warning-subtle"  },
                                EMPLOYEE:    { bar: "bg-muted-foreground",  track: "bg-muted"  },
                            };
                            const c = colorMap[role.name] ?? { bar: "bg-muted-foreground", track: "bg-muted" };
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
                    <p className="text-sm text-muted-foreground text-center py-8">No role data available.</p>
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
