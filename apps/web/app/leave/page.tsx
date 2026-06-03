"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveRequest, LeaveBalance,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
import Link from "next/link";
import { Palmtree, Plus, X, ChevronRight } from "lucide-react";
function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
    const remaining = balance.allocated - balance.used;
    const pct = balance.allocated > 0 ? Math.round((balance.used / balance.allocated) * 100) : 0;
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">{LEAVE_TYPE_LABELS[balance.type]}</p>
            <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-bold text-slate-900">{remaining}</span>
                <span className="text-xs text-slate-400">/ {balance.allocated} days</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
                <div
                    className="h-1.5 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
            <p className="text-xs text-slate-400 mt-1">{balance.used} used</p>
        </div>
    );
}

function RequestRow({ req, onCancel }: { req: LeaveRequest; onCancel: (id: string) => void }) {
    const canCancel = req.status === "PENDING";
    return (
        <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{LEAVE_TYPE_LABELS[req.type]}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                    {fmtShort(req.startDate)} – {fmt(req.endDate)} · {req.days} day{req.days !== 1 ? "s" : ""}
                </p>
                {req.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.reason}</p>}
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${LEAVE_STATUS_COLORS[req.status]}`}>
                {req.status}
            </span>
            {canCancel && (
                <button
                    onClick={() => onCancel(req.id)}
                    className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Cancel request"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
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
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                        <Palmtree className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Leave Management</h1>
                        <p className="text-xs text-slate-500">{new Date().getFullYear()} leave overview</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isReviewer && (
                        <Link
                            href="/leave/manage"
                            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                            Manage requests <ChevronRight className="h-4 w-4" />
                        </Link>
                    )}
                    <Link
                        href="/leave/apply"
                        className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> Apply
                    </Link>
                </div>
            </div>

            {/* Balance cards */}
            <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Leave Balance</h2>
                {balancesLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse" />
                        ))}
                    </div>
                ) : balances.length === 0 ? (
                    <p className="text-sm text-slate-400">No leave balances set yet. Contact HR to configure your allocations.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {balances.map((b) => <BalanceCard key={b.id} balance={b} />)}
                    </div>
                )}
            </section>

            {/* My requests */}
            <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">My Requests</h2>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {requestsLoading ? (
                        <div className="p-8 flex justify-center">
                            <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="p-8 text-center">
                            <Palmtree className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">No leave requests yet</p>
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
