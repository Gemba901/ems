"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PageHeader } from "@/components/patterns/PageHeader";
import { buttonVariants } from "@/components/ui/button";

import { TenantImage } from "@/components/files/TenantImage";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { AdminService, AVAILABLE_MODULES } from "@/services/admin.service";
import { useQuery } from "@tanstack/react-query";
import {
    Building2, Users, Lightbulb, TrendingUp,
    ArrowUpRight, CircleDot, ChevronRight, Activity, Puzzle,
} from "lucide-react";

const STATUS_CONFIG = {
    ACTIVE:    { label: "Active",    dot: "bg-success", badge: "bg-success/10 text-success border-success/20" },
    SUSPENDED: { label: "Suspended", dot: "bg-warning",   badge: "bg-warning/10 text-warning border-warning/20" },
    INACTIVE:  { label: "Inactive",  dot: "bg-muted-foreground",   badge: "bg-muted-foreground/10 text-muted-foreground border-border/20" },
};

function StatCard({
    label, value, sub, icon: Icon, accent, delta,
}: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; accent: string; delta?: string;
}) {
    return (
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent}`}>
                    <Icon className="h-4.5 w-4.5" />
                </div>
                {delta && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success bg-success-subtle px-2 py-0.5 rounded-full">
                        <ArrowUpRight className="h-3 w-3" /> {delta}
                    </span>
                )}
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
        </div>
    );
}

export default function AdminDashboardPage() {
    const { accessToken } = useAuthStore();
    const router = useRouter();

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ["platform-stats"],
        queryFn: () => AdminService.getPlatformStats(accessToken!),
        enabled: !!accessToken,
    });

    const { data: orgsData, isLoading: orgsLoading } = useQuery({
        queryKey: ["organizations", 1, 5],
        queryFn: () => AdminService.listOrganizations(accessToken!, 1, 5),
        enabled: !!accessToken,
    });

    const loading = statsLoading || orgsLoading;
    const orgs = orgsData?.data ?? [];

    const today = new Date().toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    return (
        <div className="max-w-6xl mx-auto space-y-7">

            <PageHeader
                title="Platform Overview"
                description={today}
                actions={
                    <Link href="/admin/organizations" className={buttonVariants({ variant: "outline" })}>
                        All organizations <ChevronRight />
                    </Link>
                }
            />

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Organizations"
                    value={loading ? "—" : stats?.organizationCount ?? 0}
                    sub={loading ? undefined : `${stats?.byStatus.active ?? 0} active`}
                    delta={loading || !stats?.last30Days.newOrganizations ? undefined : `+${stats.last30Days.newOrganizations} this month`}
                    icon={Building2}
                    accent="bg-primary/10 text-primary"
                />
                <StatCard
                    label="Total Employees"
                    value={loading ? "—" : stats?.employeeCount ?? 0}
                    sub={loading ? undefined : `+${stats?.last30Days.newEmployees ?? 0} in last 30 days`}
                    icon={Users}
                    accent="bg-info-subtle text-info"
                />
                <StatCard
                    label="Suggestions"
                    value={loading ? "—" : stats?.suggestionCount ?? 0}
                    sub={loading ? undefined : `${stats?.suggestionsByStatus?.["APPROVED_FOR_IMPLEMENTATION"] ?? 0} approved`}
                    icon={Lightbulb}
                    accent="bg-warning-subtle text-warning"
                />
                <StatCard
                    label="Implementation Rate"
                    value={loading ? "—" : `${stats?.implementationRate ?? 0}%`}
                    sub="Across all organizations"
                    icon={TrendingUp}
                    accent="bg-success-subtle text-success"
                />
            </div>

            {/* Status breakdown + Suggestion pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Org health + module usage */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-5">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Organization Health</p>
                    </div>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
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
                                            <span className="flex items-center gap-2 font-medium text-foreground">
                                                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </span>
                                            <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${cfg.dot}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="pt-3 border-t border-border">
                                <div className="flex items-center gap-2 mb-3">
                                    <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
                                    <p className="text-xs font-semibold text-foreground">Module Usage</p>
                                </div>
                                <div className="space-y-2">
                                    {AVAILABLE_MODULES.map(({ key, label, description }) => {
                                        const count = stats?.moduleUsage?.[key] ?? 0;
                                        const total = stats?.organizationCount || 1;
                                        const pct   = Math.round((count / total) * 100);
                                        return (
                                            <div key={key}>
                                                <div className="flex items-center justify-between text-xs mb-1.5">
                                                    <span className="font-medium text-foreground">{label}
                                                        <span className="text-muted-foreground font-normal ml-1">— {description}</span>
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">{count} org{count !== 1 ? "s" : ""}</span>
                                                </div>
                                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Suggestion pipeline */}
                <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-5">
                        <Lightbulb className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Suggestion Pipeline</p>
                    </div>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                { label: "Under Review",  key: "UNDER_REVIEW",                color: "text-warning",   bg: "bg-warning-subtle"   },
                                { label: "On Hold",       key: "ON_HOLD",                     color: "text-warning",  bg: "bg-warning-subtle"  },
                                { label: "Sel. for SGA",  key: "SELECTED_FOR_SGA",            color: "text-primary",  bg: "bg-primary/10"  },
                                { label: "Approved",      key: "APPROVED_FOR_IMPLEMENTATION", color: "text-success", bg: "bg-success-subtle" },
                                { label: "Rejected",      key: "REJECTED",                    color: "text-danger",     bg: "bg-danger-subtle"     },
                            ].map(({ label, key, color, bg }) => (
                                <div key={key} className={`${bg} rounded-lg px-4 py-3`}>
                                    <p className={`text-xl font-bold tabular-nums ${color}`}>
                                        {stats?.suggestionsByStatus?.[key] ?? 0}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Recent organizations */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Recent Organizations</p>
                    <Link
                        href="/admin/organizations"
                        className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                        View all <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                <div className="overflow-x-auto">
                <Table className="w-full text-sm">
                    <TableHeader className="bg-muted border-b border-border">
                        <TableRow>
                            <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Organization</TableHead>
                            <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                            <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Employees</TableHead>
                            <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Departments</TableHead>
                            <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Joined</TableHead>
                            <TableHead className="px-6 py-3" />
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border">
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && orgs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                                    No organizations yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && orgs.map((org) => {
                            const sc = STATUS_CONFIG[org.status];
                            return (
                                <TableRow
                                    key={org.id}
                                    className="hover:bg-muted/60 cursor-pointer group transition-colors"
                                    onClick={() => router.push(`/admin/organizations/${org.id}`)}
                                >
                                    <TableCell className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {org.logoUrl ? (
                                                <TenantImage src={org.logoUrl} organizationId={org.id} alt={org.name} className="h-7 w-7 rounded-lg object-cover shrink-0" />
                                            ) : (
                                                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                                                    {org.name[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-semibold text-foreground text-sm">{org.name}</p>
                                                {org.industry && (
                                                    <p className="text-[11px] text-muted-foreground">{org.industry}</p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${sc.badge}`}>
                                            <CircleDot className="h-2.5 w-2.5" />
                                            {sc.label}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-muted-foreground tabular-nums">{org._count.employees}</TableCell>
                                    <TableCell className="px-6 py-4 text-muted-foreground tabular-nums">{org._count.departments}</TableCell>
                                    <TableCell className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                                        {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-right">
                                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                </div>
            </div>
        </div>
    );
}
