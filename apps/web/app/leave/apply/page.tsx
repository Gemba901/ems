"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { LeaveService, LeaveType, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { ArrowLeft, CalendarDays, Info } from "lucide-react";
import Link from "next/link";

const LEAVE_TYPES = Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][];

function calcDays(start: string, end: string): number {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) return 0;
    const msPerDay = 86400000;
    let days = 0;
    const cur = new Date(s);
    while (cur <= e) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) days++;
        cur.setTime(cur.getTime() + msPerDay);
    }
    return Math.max(1, days);
}

export default function ApplyLeavePage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const [type, setType] = useState<LeaveType>("ANNUAL");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    const days = calcDays(startDate, endDate);

    const { data: balances = [] } = useQuery({
        queryKey: ["leave-balance"],
        queryFn: () => LeaveService.getMyBalance(accessToken),
        enabled: !!accessToken,
    });

    const selectedBalance = balances.find((b) => b.type === type);
    const remaining = selectedBalance ? selectedBalance.allocated - selectedBalance.used : null;

    const mutation = useMutation({
        mutationFn: () =>
            LeaveService.submitRequest(accessToken, { type, startDate, endDate, days, reason: reason || undefined }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            router.push("/leave");
        },
        onError: (e: Error) => setError(e.message),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!startDate || !endDate) return setError("Please select both start and end dates");
        if (days < 1) return setError("End date must be on or after start date");
        mutation.mutate();
    };

    const today = new Date().toISOString().split("T")[0];

    return (
        <div className="p-6 space-y-6">
            {/* Page header */}
            <div>
                <Link
                    href="/leave"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Leave
                </Link>
                <h1 className="text-lg font-bold text-slate-900">Apply for Leave</h1>
                <p className="text-sm text-slate-500 mt-0.5">Submit a leave request for approval by HR or your HOD.</p>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Form ── */}
                <div className="lg:col-span-2">
                    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

                        {/* Leave type */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                Leave Type
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as LeaveType)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {LEAVE_TYPES.map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                            {remaining !== null && (
                                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {remaining} day{remaining !== 1 ? "s" : ""} remaining for this type
                                </p>
                            )}
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    min={today}
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    min={startDate || today}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {/* Working days badge */}
                        {days > 0 && (
                            <div className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                                <CalendarDays className="h-4 w-4 text-indigo-500 shrink-0" />
                                <p className="text-sm font-medium text-indigo-700">
                                    {days} working day{days !== 1 ? "s" : ""}
                                </p>
                            </div>
                        )}

                        {/* Reason */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                Reason{" "}
                                <span className="text-slate-400 normal-case font-normal">(optional)</span>
                            </label>
                            <textarea
                                rows={3}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Brief description..."
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        {/* Submit — right-aligned, natural width */}
                        <div className="flex justify-end pt-1 border-t border-slate-100">
                            <button
                                type="submit"
                                disabled={mutation.isPending}
                                className="bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {mutation.isPending ? "Submitting…" : "Submit Request"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* ── Balance panel ── */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Leave Balance</p>
                    {balances.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-400">
                            No balances set yet. Contact HR to configure your allocations.
                        </div>
                    ) : (
                        balances.map((b) => {
                            const rem = b.allocated - b.used;
                            const pct = b.allocated > 0 ? Math.round((b.used / b.allocated) * 100) : 0;
                            const isSelected = b.type === type;
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setType(b.type as LeaveType)}
                                    className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${
                                        isSelected
                                            ? "border-indigo-300 ring-1 ring-indigo-200 shadow-sm"
                                            : "border-slate-200 hover:border-slate-300"
                                    }`}
                                >
                                    <p className="text-xs font-medium text-slate-500 mb-1">
                                        {LEAVE_TYPE_LABELS[b.type as LeaveType]}
                                    </p>
                                    <div className="flex items-end justify-between mb-2">
                                        <span className="text-2xl font-bold text-slate-900">{rem}</span>
                                        <span className="text-xs text-slate-400">/ {b.allocated} days</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100">
                                        <div
                                            className={`h-1.5 rounded-full transition-all ${isSelected ? "bg-indigo-500" : "bg-slate-300"}`}
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">{b.used} used</p>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
