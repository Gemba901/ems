"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { LeaveService, LeaveType, LEAVE_TYPE_LABELS, LeaveOverlapEntry } from "@/services/leave.service";
import { ArrowLeft, CalendarDays, Info, AlertTriangle, UserCheck, Search, Loader2 } from "lucide-react";
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

function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function OverlapWarning({ entries }: { entries: LeaveOverlapEntry[] }) {
    if (entries.length === 0) return null;
    const approved = entries.filter((e) => e.status === "APPROVED");
    const pending  = entries.filter((e) => e.status === "PENDING");
    return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">
                    {entries.length} colleague{entries.length !== 1 ? "s" : ""} on leave during this period
                </p>
            </div>
            <div className="space-y-1">
                {approved.length > 0 && (
                    <p className="text-xs text-amber-700">
                        <span className="font-medium">Approved:</span>{" "}
                        {approved.map((e) => `${e.employee.firstName} ${e.employee.lastName}`).join(", ")}
                    </p>
                )}
                {pending.length > 0 && (
                    <p className="text-xs text-amber-700">
                        <span className="font-medium">Pending:</span>{" "}
                        {pending.map((e) => `${e.employee.firstName} ${e.employee.lastName}`).join(", ")}
                    </p>
                )}
            </div>
            <p className="text-xs text-amber-600">You can still submit — HR will review coverage before approving.</p>
        </div>
    );
}

export default function ApplyLeavePage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const [type, setType]             = useState<LeaveType>("ANNUAL");
    const [startDate, setStartDate]   = useState("");
    const [endDate, setEndDate]       = useState("");
    const [reason, setReason]         = useState("");
    const [handoverId, setHandoverId] = useState("");
    const [handoverNotes, setHandoverNotes] = useState("");
    const [handoverSearch, setHandoverSearch] = useState("");
    const [showHandoverList, setShowHandoverList] = useState(false);
    const [error, setError]           = useState("");
    const [submitted, setSubmitted]   = useState<{ overlapping: LeaveOverlapEntry[] } | null>(null);

    const handoverRef = useRef<HTMLDivElement>(null);
    const days = calcDays(startDate, endDate);
    const today = new Date().toISOString().split("T")[0];

    // Colleagues for handover
    const { data: colleagues = [], isLoading: colleaguesLoading } = useQuery({
        queryKey: ["leave-colleagues"],
        queryFn: () => LeaveService.getColleagues(accessToken),
        enabled: !!accessToken,
        staleTime: 5 * 60_000,
    });

    // Leave balance for sidebar
    const { data: balances = [] } = useQuery({
        queryKey: ["leave-balance"],
        queryFn: () => LeaveService.getMyBalance(accessToken),
        enabled: !!accessToken,
    });

    // Live overlap check — debounced, fires when both dates are set
    const { data: overlapData } = useQuery({
        queryKey: ["leave-overlap", startDate, endDate],
        queryFn: () => LeaveService.checkOverlap(accessToken, startDate, endDate),
        enabled: !!accessToken && !!startDate && !!endDate && days > 0,
        staleTime: 30_000,
    });

    const selectedBalance = balances.find((b) => b.type === type);
    const remaining = selectedBalance ? selectedBalance.allocated - selectedBalance.used : null;

    const filteredColleagues = colleagues.filter((c) => {
        if (!handoverSearch) return true;
        const q = handoverSearch.toLowerCase();
        return `${c.firstName} ${c.lastName} ${c.jobTitle ?? ""} ${c.department?.name ?? ""}`.toLowerCase().includes(q);
    });

    const selectedHandover = colleagues.find((c) => c.id === handoverId);

    // Close handover dropdown on outside click
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (handoverRef.current && !handoverRef.current.contains(e.target as Node)) {
                setShowHandoverList(false);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, []);

    const mutation = useMutation({
        mutationFn: () =>
            LeaveService.submitRequest(accessToken, {
                type, startDate, endDate, days,
                reason: reason || undefined,
                handoverEmployeeId: handoverId || undefined,
                handoverNotes: handoverNotes || undefined,
            }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            setSubmitted({ overlapping: data.overlapping });
        },
        onError: (e: Error) => setError(e.message),
    });

    if (submitted) {
        return (
            <div className="p-6 max-w-lg">
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CalendarDays className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900">Request submitted</p>
                            <p className="text-sm text-slate-500">Pending HR / HOD approval</p>
                        </div>
                    </div>
                    {submitted.overlapping.length > 0 && (
                        <OverlapWarning entries={submitted.overlapping} />
                    )}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={() => router.push("/leave")}
                            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
                        >
                            Back to Leave
                        </button>
                        <button
                            onClick={() => {
                                setSubmitted(null);
                                setStartDate(""); setEndDate(""); setReason("");
                                setHandoverId(""); setHandoverNotes(""); setError("");
                            }}
                            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
                        >
                            Apply again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <Link href="/leave" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Leave
                </Link>
                <h1 className="text-lg font-bold text-slate-900">Apply for Leave</h1>
                <p className="text-sm text-slate-500 mt-0.5">Submit a request for approval by HR or your HOD.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Form ── */}
                <div className="lg:col-span-2">
                    <form
                        onSubmit={(e) => { e.preventDefault(); setError(""); if (!startDate || !endDate) return setError("Please select both dates"); if (days < 1) return setError("End date must be on or after start date"); mutation.mutate(); }}
                        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
                    >
                        {/* Leave type */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Leave Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as LeaveType)}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {LEAVE_TYPES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                            </select>
                            {remaining !== null && (
                                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {remaining} day{remaining !== 1 ? "s" : ""} remaining
                                </p>
                            )}
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>
                                <input type="date" min={today} value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">End Date</label>
                                <input type="date" min={startDate || today} value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {days > 0 && (
                            <div className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                                <CalendarDays className="h-4 w-4 text-indigo-500 shrink-0" />
                                <p className="text-sm font-medium text-indigo-700">{days} working day{days !== 1 ? "s" : ""}</p>
                            </div>
                        )}

                        {/* Live overlap warning */}
                        {overlapData && overlapData.count > 0 && (
                            <OverlapWarning entries={overlapData.colleagues} />
                        )}

                        {/* Reason */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                Reason <span className="text-slate-400 normal-case font-normal">(optional)</span>
                            </label>
                            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                                placeholder="Brief description…"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Handover */}
                        <div className="border-t border-slate-100 pt-5 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                                    Handover Person <span className="text-slate-400 normal-case font-normal">(recommended)</span>
                                </label>
                                <p className="text-xs text-slate-400 mb-2">Who will cover your responsibilities while you're away?</p>

                                <div ref={handoverRef} className="relative">
                                    {selectedHandover ? (
                                        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50">
                                            <div className="flex items-center gap-2">
                                                <UserCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                                                <div>
                                                    <p className="text-sm font-medium text-indigo-800">
                                                        {selectedHandover.firstName} {selectedHandover.lastName}
                                                    </p>
                                                    {selectedHandover.jobTitle && (
                                                        <p className="text-xs text-indigo-500">{selectedHandover.jobTitle}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => { setHandoverId(""); setHandoverSearch(""); }}
                                                className="text-xs text-indigo-400 hover:text-indigo-700 transition-colors">
                                                Change
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    placeholder="Search by name or role…"
                                                    value={handoverSearch}
                                                    onChange={(e) => { setHandoverSearch(e.target.value); setShowHandoverList(true); }}
                                                    onFocus={() => setShowHandoverList(true)}
                                                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            {showHandoverList && (
                                                <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {colleaguesLoading ? (
                                                        <div className="px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                                                        </div>
                                                    ) : filteredColleagues.length === 0 ? (
                                                        <p className="px-4 py-3 text-sm text-slate-400">
                                                            {handoverSearch ? "No match found" : "No colleagues available"}
                                                        </p>
                                                    ) : filteredColleagues.slice(0, 8).map((c) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => { setHandoverId(c.id); setHandoverSearch(""); setShowHandoverList(false); }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors"
                                                        >
                                                            <p className="text-sm font-medium text-slate-800">{c.firstName} {c.lastName}</p>
                                                            <p className="text-xs text-slate-400">{[c.jobTitle, c.department?.name].filter(Boolean).join(" · ")}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {handoverId && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Handover Notes <span className="text-slate-400 normal-case font-normal">(optional)</span>
                                    </label>
                                    <textarea rows={2} value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)}
                                        placeholder="Key tasks, contacts, or instructions for your cover…"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            )}
                        </div>

                        {error && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
                        )}

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
                            No balances set yet. Contact HR.
                        </div>
                    ) : balances.map((b) => {
                        const rem = b.allocated - b.used;
                        const pct = b.allocated > 0 ? Math.round((b.used / b.allocated) * 100) : 0;
                        const isSelected = b.type === type;
                        return (
                            <button key={b.id} type="button" onClick={() => setType(b.type as LeaveType)}
                                className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${isSelected ? "border-indigo-300 ring-1 ring-indigo-200 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
                            >
                                <p className="text-xs font-medium text-slate-500 mb-1">{LEAVE_TYPE_LABELS[b.type as LeaveType]}</p>
                                <div className="flex items-end justify-between mb-2">
                                    <span className="text-2xl font-bold text-slate-900">{rem}</span>
                                    <span className="text-xs text-slate-400">/ {b.allocated} days</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-slate-100">
                                    <div className={`h-1.5 rounded-full transition-all ${isSelected ? "bg-indigo-500" : "bg-slate-300"}`}
                                        style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">{b.used} used</p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
