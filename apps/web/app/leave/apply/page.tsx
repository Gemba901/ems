"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { LeaveService, LeaveType, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { ArrowLeft } from "lucide-react";
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
        <div className="p-6 max-w-lg mx-auto">
            <Link href="/leave" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to Leave
            </Link>

            <h1 className="text-lg font-bold text-slate-900 mb-6">Apply for Leave</h1>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                {/* Leave type */}
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Leave Type</label>
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value as LeaveType)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {LEAVE_TYPES.map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                    {remaining !== null && (
                        <p className="text-xs text-slate-400 mt-1">{remaining} day{remaining !== 1 ? "s" : ""} remaining</p>
                    )}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
                        <input
                            type="date"
                            min={today}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
                        <input
                            type="date"
                            min={startDate || today}
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {days > 0 && (
                    <p className="text-xs font-medium text-indigo-600">{days} working day{days !== 1 ? "s" : ""}</p>
                )}

                {/* Reason */}
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason <span className="text-slate-400">(optional)</span></label>
                    <textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Brief description..."
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                    {mutation.isPending ? "Submitting..." : "Submit Request"}
                </button>
            </form>
        </div>
    );
}
