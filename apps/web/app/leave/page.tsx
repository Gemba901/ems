"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveRequest, LeaveBalance,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";

function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function balanceBarColor(pct: number) {
    if (pct >= 70) return "bg-emerald-500";
    if (pct >= 40) return "bg-amber-400";
    return "bg-red-500";
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
    const remaining = balance.allocated - balance.used;
    const pct = balance.allocated > 0 ? Math.round((remaining / balance.allocated) * 100) : 0;
    const barColor = balanceBarColor(pct);
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-2">{LEAVE_TYPE_LABELS[balance.type as keyof typeof LEAVE_TYPE_LABELS] ?? balance.type}</p>
            <div className="flex items-baseline gap-1.5 mb-3">
                <span className="text-2xl font-semibold text-slate-900 tabular-nums">{remaining}</span>
                <span className="text-sm text-slate-400">/ {balance.allocated} days</span>
            </div>
            <div className="h-1 rounded-full bg-slate-100">
                <div
                    className={`h-1 rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
            <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-slate-400">{balance.used} used</p>
                {balance.accumulated !== undefined && (
                    <p className="text-xs text-slate-400" title="Pro-rata days accrued so far this year">
                        {balance.accumulated} accrued
                    </p>
                )}
            </div>
        </div>
    );
}

function RequestRow({ req, onCancel }: { req: LeaveRequest; onCancel: (id: string) => void }) {
    const notStarted = new Date(req.startDate) > new Date();
    const canCancel = req.status === "PENDING" || (req.status === "APPROVED" && notStarted);
    return (
        <div className="py-3.5 border-b border-slate-100 last:border-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{LEAVE_TYPE_LABELS[req.type as keyof typeof LEAVE_TYPE_LABELS] ?? req.type}</p>
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
                        <p className="text-xs mt-1 text-slate-500 italic">
                            &ldquo;{req.reviewNote}&rdquo;
                        </p>
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

export default function LeavePage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const user = useAuthStore((s) => s.user);
    const queryClient = useQueryClient();

    const isReviewer = ["SUPER_ADMIN", "ADMIN", "HR", "HOD"].includes(user?.roleLevel ?? "");

    const { data: balances = [], isLoading: balancesLoading } = useQuery({
        queryKey: ["leave-balance"],
        queryFn: () => LeaveService.getMyBalance(accessToken),
        enabled: !!accessToken,
    });

    const { data: requests = [], isLoading: requestsLoading } = useQuery({
        queryKey: ["leave-requests", "mine"],
        queryFn: () => LeaveService.listRequests(accessToken),
        enabled: !!accessToken,
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => LeaveService.cancelRequest(accessToken, id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leave-requests"] }),
    });

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900">Leave</h1>
                    <p className="text-sm text-slate-500 mt-0.5">{new Date().getFullYear()} overview</p>
                </div>
                <div className="flex items-center gap-4">
                    {isReviewer && (
                        <Link
                            href="/leave/manage"
                            className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors"
                        >
                            Manage <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    )}
                    <Link
                        href="/leave/apply"
                        className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> Apply
                    </Link>
                </div>
            </div>

            {/* Balance */}
            <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Balance</h2>
                {balancesLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 h-24 animate-pulse" />
                        ))}
                    </div>
                ) : balances.length === 0 ? (
                    <p className="text-sm text-slate-400">No allocations set yet — contact HR.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {balances.map((b) => <BalanceCard key={b.id} balance={b} />)}
                    </div>
                )}
            </section>

            {/* Requests */}
            <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">My Requests</h2>
                <div className="bg-white rounded-lg border border-slate-200">
                    {requestsLoading ? (
                        <div className="px-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="py-3.5 border-b border-slate-100 last:border-0">
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
