// apps/web/app/leave/page.tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
    LeaveService, LeaveRequest, LeaveBalance, LeaveCoverageAlert,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
import Link from "next/link";
import {
    Plus, ChevronRight, ClipboardList, Clock, CheckCircle2,
    XCircle, Users, Wallet, Info,
} from "lucide-react";

function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function barColor(remaining: number, allocated: number) {
    if (allocated === 0) return "bg-slate-200";
    const pct = remaining / allocated;
    if (pct >= 0.5) return "bg-emerald-500";
    if (pct >= 0.25) return "bg-amber-400";
    return "bg-red-500";
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
    const label = LEAVE_TYPE_LABELS[balance.type] ?? balance.type.replace(/_/g, " ");
    const remaining = balance.allocated - balance.used;
    const pct = balance.allocated > 0 ? (remaining / balance.allocated) * 100 : 0;
    const color = barColor(remaining, balance.allocated);

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-2 min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
            <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">{remaining}</span>
                <span className="text-xs text-slate-400 leading-none">/ {balance.allocated}</span>
            </div>
            <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-1 rounded-full ${color}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{balance.used} used</span>
                {balance.accumulated !== undefined && (
                    <span title="Pro-rata accrued so far">{balance.accumulated} accrued</span>
                )}
            </div>
        </div>
    );
}

function RequestRow({ req, onCancel }: { req: LeaveRequest; onCancel: (id: string) => void }) {
    const notStarted = new Date(req.startDate) > new Date();
    const canCancel = req.status === "PENDING" || (req.status === "APPROVED" && notStarted);
    return (
        <div className="py-3 border-b border-slate-100 last:border-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">
                            {LEAVE_TYPE_LABELS[req.type] ?? req.type.replace(/_/g, " ")}
                        </p>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${LEAVE_STATUS_COLORS[req.status]}`}>
                            {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {fmtShort(req.startDate)} – {fmt(req.endDate)} &middot; {req.days} day{req.days !== 1 ? "s" : ""}
                    </p>
                    {req.reason && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{req.reason}</p>
                    )}
                    {req.reviewNote && (req.status === "REJECTED" || req.status === "APPROVED") && (
                        <p className="text-xs mt-1 text-slate-500 italic">&ldquo;{req.reviewNote}&rdquo;</p>
                    )}
                </div>
                {canCancel && (
                    <button
                        onClick={() => onCancel(req.id)}
                        className="shrink-0 text-xs text-slate-400 hover:text-red-500 transition-colors mt-0.5"
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Reviewer-only dashboard pieces ──────────────────────────────────────────

function StatCard({
    label, value, sublabel, icon: Icon, tone = "slate",
}: {
    label: string;
    value: string | number;
    sublabel?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "slate" | "emerald" | "red" | "amber" | "indigo";
}) {
    const toneText: Record<string, string> = {
        slate: "text-slate-900", emerald: "text-emerald-600", red: "text-red-500",
        amber: "text-amber-600", indigo: "text-indigo-600",
    };
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
                <Icon className={`h-4 w-4 ${toneText[tone]}`} />
            </div>
            <p className={`text-2xl font-bold tabular-nums leading-none ${toneText[tone]}`}>{value}</p>
            {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
        </div>
    );
}

function AdminRequestRow({ req }: { req: LeaveRequest }) {
    return (
        <div className="py-3 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800">
                        {req.employee?.firstName} {req.employee?.lastName}
                    </p>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${LEAVE_STATUS_COLORS[req.status]}`}>
                        {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                    </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                    {LEAVE_TYPE_LABELS[req.type] ?? req.type} &middot; {fmtShort(req.startDate)} – {fmt(req.endDate)} &middot; {req.days} day{req.days !== 1 ? "s" : ""}
                </p>
            </div>
        </div>
    );
}

function PersonalBalancePanel({ balances }: { balances: LeaveBalance[] }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Personal Leave Balance</h3>
            <div className="space-y-4">
                {balances.map((b) => {
                    const label = LEAVE_TYPE_LABELS[b.type] ?? b.type.replace(/_/g, " ");
                    const remaining = b.allocated - b.used;
                    const pct = b.allocated > 0 ? (remaining / b.allocated) * 100 : 0;
                    return (
                        <div key={b.id}>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-slate-500">{label}</span>
                                <span className="font-medium text-slate-700 tabular-nums">{remaining} / {b.allocated} days</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-1.5 rounded-full ${barColor(remaining, b.allocated)}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            <Link
                href="/leave/apply"
                className="mt-5 flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
            >
                <Plus className="h-4 w-4" /> Request Leave
            </Link>
        </div>
    );
}

function TeamNoticeCard({ alerts, isLoading }: { alerts: LeaveCoverageAlert[]; isLoading: boolean }) {
    return (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-900">Team Notice</h3>
            </div>
            {isLoading ? (
                <p className="text-sm text-slate-500">Checking department coverage…</p>
            ) : alerts.length === 0 ? (
                <p className="text-sm text-slate-600">All departments are at or above their minimum coverage today.</p>
            ) : (
                <ul className="space-y-1.5">
                    {alerts.map((a) => (
                        <li key={a.departmentId} className="text-sm text-slate-600">
                            <span className="font-medium text-slate-800">{a.departmentName}</span>{" "}
                            is at {a.remaining}/{a.total}, below its minimum of {a.minLeaveHeadcount}.
                        </li>
                    ))}
                </ul>
            )}
            <Link href="/leave/calendar" className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 inline-block transition-colors">
                View Team Calendar &rarr;
            </Link>
        </div>
    );
}

export default function LeavePage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const user = useAuthStore((s) => s.user);
    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();

    const isReviewer = !!user?.roleLevel &&
        [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD].includes(user.roleLevel);

    const { data: balances = [], isLoading: balancesLoading } = useQuery({
        queryKey: ["leave-balance"],
        queryFn: () => LeaveService.getMyBalance(accessToken),
        enabled: !!accessToken,
    });

    // Personal requests - employees only.
    const { data: requests = [], isLoading: requestsLoading } = useQuery({
        queryKey: ["leave-requests", "mine"],
        queryFn: () => LeaveService.listRequests(accessToken),
        enabled: !!accessToken && !isReviewer,
    });

    // Org-wide requests + summary - reviewers only.
    const { data: summary } = useQuery({
        queryKey: ["leave-summary", currentYear],
        queryFn: () => LeaveService.getSummary(accessToken, currentYear),
        enabled: !!accessToken && isReviewer,
    });

    const { data: orgRequests = [], isLoading: orgLoading } = useQuery({
        queryKey: ["leave-requests", "org"],
        queryFn: () => LeaveService.listRequests(accessToken),
        enabled: !!accessToken && isReviewer,
    });

    const { data: balanceSummary } = useQuery({
        queryKey: ["leave-balance-summary", currentYear],
        queryFn: () => LeaveService.getBalanceSummary(accessToken, currentYear),
        enabled: !!accessToken && isReviewer,
    });

    const { data: coverageAlerts = [], isLoading: coverageLoading } = useQuery({
        queryKey: ["leave-coverage"],
        queryFn: () => LeaveService.getCoverageAlerts(accessToken),
        enabled: !!accessToken && isReviewer,
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => LeaveService.cancelRequest(accessToken, id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leave-requests"] }),
    });

    if (isReviewer) {
        const today = new Date();
        const onLeaveNow = orgRequests.filter(
            (r) => r.status === "APPROVED" && new Date(r.startDate) <= today && new Date(r.endDate) >= today,
        ).length;
        const pendingPreview = orgRequests
            .filter((r) => r.status === "PENDING")
            .slice(0, 8);

        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Leave Management</h1>
                        <p className="text-sm text-slate-500">Monitor employee availability and manage request workflows.</p>
                    </div>
                    <Link
                        href="/leave/manage"
                        className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        Manage Requests <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <StatCard label="Total Requests" value={orgRequests.length} icon={ClipboardList} />
                    <StatCard label="Pending" value={summary?.pending ?? "—"} sublabel="Action required" icon={Clock} tone="amber" />
                    <StatCard label="Approved" value={summary?.approved ?? "—"} icon={CheckCircle2} tone="emerald" />
                    <StatCard label="Rejected" value={summary?.rejected ?? "—"} icon={XCircle} tone="red" />
                    <StatCard label="On Leave Now" value={onLeaveNow} sublabel="Active today" icon={Users} tone="indigo" />
                    <StatCard label="Balance Rem." value={balanceSummary?.remaining ?? "—"} sublabel="Org-wide, this year" icon={Wallet} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                    <section className="bg-white rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between px-4 pt-4">
                            <h2 className="text-sm font-semibold text-slate-900">Leave Requests</h2>
                            <span className="text-xs text-slate-400">
                                Showing {pendingPreview.length} of {summary?.pending ?? 0} pending
                            </span>
                        </div>
                        <div className="px-4">
                            {orgLoading ? (
                                <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
                            ) : pendingPreview.length === 0 ? (
                                <div className="py-8 text-center text-sm text-slate-400">No pending requests.</div>
                            ) : (
                                pendingPreview.map((r) => <AdminRequestRow key={r.id} req={r} />)
                            )}
                        </div>
                        <Link
                            href="/leave/manage"
                            className="block text-center text-sm text-indigo-600 hover:text-indigo-800 py-3 border-t border-slate-100 transition-colors"
                        >
                            View All Requests
                        </Link>
                    </section>

                    <div className="space-y-4">
                        <PersonalBalancePanel balances={balances} />
                        <TeamNoticeCard alerts={coverageAlerts} isLoading={coverageLoading} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Employee (non-reviewer) view — unchanged from before ──
    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Leave</h1>
                    <p className="text-sm text-slate-500">{currentYear} overview</p>
                </div>
                <Link
                    href="/leave/apply"
                    className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="h-4 w-4" /> Apply
                </Link>
            </div>

            <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">By Leave Type</h2>
                {balancesLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 h-20 animate-pulse" />
                        ))}
                    </div>
                ) : balances.length === 0 ? (
                    <p className="text-sm text-slate-400">No allocations set yet — contact HR.</p>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                        {balances.map((b) => <BalanceCard key={b.id} balance={b} />)}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">My Requests</h2>
                <div className="bg-white rounded-xl border border-slate-200">
                    {requestsLoading ? (
                        <div className="px-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="py-3 border-b border-slate-100 last:border-0">
                                    <div className="h-3.5 w-32 bg-slate-100 rounded animate-pulse mb-2" />
                                    <div className="h-3 w-48 bg-slate-100 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <p className="text-sm text-slate-400">No requests yet.</p>
                            <Link href="/leave/apply" className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors mt-1 inline-block">
                                Apply for leave
                            </Link>
                        </div>
                    ) : (
                        <div className="px-4">
                            {requests.map((r) => (
                                <RequestRow key={r.id} req={r} onCancel={(id) => cancelMutation.mutate(id)} />
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
