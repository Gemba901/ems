// apps/web/app/leave/manage/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveRequest, LeaveStatus, LeaveBalance, YearlyAnalytics,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
import {
    Check, X, ArrowLeft, Settings2, UserCheck, AlertTriangle,
    Search, BarChart2, History, FileText, Bell,
} from "lucide-react";
import Link from "next/link";

function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function fmtDateTime(d: string) {
    return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(d: string) {
    const diffMs = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return fmtShort(d);
}
function initials(first?: string, last?: string) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

const LIST_FILTERS: { label: string; value: "PENDING" | "ALL" }[] = [
    { label: "Pending", value: "PENDING" },
    { label: "All", value: "ALL" },
];

function YearlyAnalyticsPanel({ data }: { data: YearlyAnalytics[] }) {
    if (data.length === 0) return <p className="text-sm text-slate-400 py-4">No leave data yet.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="text-left px-4 py-3 font-medium">Year</th>
                        <th className="text-left px-4 py-3 font-medium">Pending</th>
                        <th className="text-left px-4 py-3 font-medium">Approved</th>
                        <th className="text-left px-4 py-3 font-medium">Rejected</th>
                        <th className="text-left px-4 py-3 font-medium">Total Days Taken</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.year} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-3 font-semibold text-slate-800">{row.year}</td>
                            <td className="px-4 py-3 text-amber-600 tabular-nums">{row.pending}</td>
                            <td className="px-4 py-3 text-emerald-600 tabular-nums">{row.approved}</td>
                            <td className="px-4 py-3 text-red-500 tabular-nums">{row.rejected}</td>
                            <td className="px-4 py-3 text-slate-700 tabular-nums font-medium">{row.totalDays}</td>
                        </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</td>
                        <td className="px-4 py-3 font-semibold text-amber-600 tabular-nums">{data.reduce((s, r) => s + r.pending, 0)}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-600 tabular-nums">{data.reduce((s, r) => s + r.approved, 0)}</td>
                        <td className="px-4 py-3 font-semibold text-red-500 tabular-nums">{data.reduce((s, r) => s + r.rejected, 0)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">{data.reduce((s, r) => s + r.totalDays, 0)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

// ── Left rail: request list ─────────────────────────────────────────────────

function RequestListItem({
    req, active, onClick,
}: { req: LeaveRequest; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                active ? "border-l-indigo-600 bg-indigo-50/60" : "border-l-transparent hover:bg-slate-50"
            }`}
        >
            <div className="flex items-start gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">
                    {initials(req.employee?.firstName, req.employee?.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">
                            {req.employee?.firstName} {req.employee?.lastName}
                        </p>
                        <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(req.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{LEAVE_TYPE_LABELS[req.type] ?? req.type}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-400">
                            {fmtShort(req.startDate)} – {fmtShort(req.endDate)}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">{req.days}d</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${LEAVE_STATUS_COLORS[req.status]}`}>
                            {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
}

// ── Right pane: detail / review workspace ───────────────────────────────────

function DetailPanel({
    req, allRequests, balances, onReview, isPending, reviewError,
}: {
    req: LeaveRequest;
    allRequests: LeaveRequest[];
    balances: LeaveBalance[];
    onReview: (status: "APPROVED" | "REJECTED", note: string) => void;
    isPending: boolean;
    reviewError: string | null;
}) {
    const [note, setNote] = useState("");
    useEffect(() => setNote(""), [req.id]);

    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    const concurrent = allRequests.filter((r) =>
        r.id !== req.id &&
        r.employeeId !== req.employeeId &&
        (r.status === "PENDING" || r.status === "APPROVED") &&
        new Date(r.startDate) <= reqEnd &&
        new Date(r.endDate) >= reqStart,
    );

    return (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-slate-800 text-white text-sm font-bold flex items-center justify-center">
                        {initials(req.employee?.firstName, req.employee?.lastName)}
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            {req.employee?.firstName} {req.employee?.lastName}
                        </h2>
                        {req.employee?.jobTitle && <p className="text-sm text-slate-500">{req.employee.jobTitle}</p>}
                    </div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${LEAVE_STATUS_COLORS[req.status]}`}>
                    {req.status === "PENDING" ? "Pending Approval" : req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Request details */}
                    <div className="lg:col-span-2 space-y-4">
                        <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Leave Request Details</h3>
                            <div className="bg-slate-50 rounded-lg border border-slate-100 divide-y divide-slate-100">
                                <div className="px-4 py-2.5 flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Leave Type</span>
                                    <span className="font-medium text-slate-800">{LEAVE_TYPE_LABELS[req.type] ?? req.type}</span>
                                </div>
                                <div className="px-4 py-2.5 flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Duration</span>
                                    <span className="font-medium text-slate-800">
                                        {fmt(req.startDate)} – {fmt(req.endDate)} ({req.days} day{req.days !== 1 ? "s" : ""})
                                    </span>
                                </div>
                            </div>
                        </div>

                        {req.reason && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Reason for Absence</h3>
                                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">{req.reason}</p>
                            </div>
                        )}
                    </div>

                    {/* Right column: balances + team availability */}
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Remaining Leave Balance</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {balances.slice(0, 4).map((b) => (
                                    <div key={b.id} className="bg-slate-50 rounded-lg border border-slate-100 p-3 text-center">
                                        <p className="text-xl font-bold text-slate-900 tabular-nums">{b.allocated - b.used}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">{LEAVE_TYPE_LABELS[b.type] ?? b.type} Left</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Team Availability</h3>
                            {concurrent.length > 0 ? (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3">
                                    <p className="text-xs font-medium text-red-700 mb-1.5">
                                        {concurrent.length} colleague{concurrent.length !== 1 ? "s" : ""} already on leave this period
                                    </p>
                                    <ul className="space-y-1">
                                        {concurrent.slice(0, 4).map((r) => (
                                            <li key={r.id} className="text-xs text-red-600 flex items-center justify-between">
                                                <span>{r.employee?.firstName} {r.employee?.lastName}</span>
                                                <span className="text-red-400">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3 text-xs text-emerald-700">
                                    No overlapping leave in the team.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Manager comments */}
                {req.status === "PENDING" && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Manager Comments
                        </label>
                        <textarea
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Provide details for approval or reason for rejection… (visible to employee)"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {reviewError && (
                            <p className="text-xs text-red-600 mt-1.5">{reviewError}</p>
                        )}
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => onReview("REJECTED", note)}
                                disabled={isPending}
                                className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 text-sm font-medium py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                                <X className="h-4 w-4" /> Reject Request
                            </button>
                            <button
                                onClick={() => onReview("APPROVED", note)}
                                disabled={isPending}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                <Check className="h-4 w-4" /> Approve Request
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom info cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                            <p className="text-xs font-semibold text-slate-600">Handover Status</p>
                        </div>
                        {req.handoverEmployee ? (
                            <p className="text-xs text-slate-500">
                                Cover: {req.handoverEmployee.firstName} {req.handoverEmployee.lastName}
                                {req.handoverEmployee2 ? `, ${req.handoverEmployee2.firstName} ${req.handoverEmployee2.lastName}` : ""}
                            </p>
                        ) : (
                            <p className="text-xs text-slate-400">No cover assigned.</p>
                        )}
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Bell className="h-3.5 w-3.5 text-slate-400" />
                            <p className="text-xs font-semibold text-slate-600">Auto-Notification</p>
                        </div>
                        <p className="text-xs text-slate-500">HR and the reporting line will be notified upon a decision.</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <p className="text-xs font-semibold text-slate-600">Audit Trail</p>
                        </div>
                        <p className="text-xs text-slate-500">
                            Created by {req.employee?.firstName} {req.employee?.lastName} on {fmtDateTime(req.createdAt)}
                        </p>
                        {req.reviewedBy && req.reviewedAt && (
                            <p className="text-xs text-slate-500 mt-1">
                                Reviewed by {req.reviewedBy.name} on {fmtDateTime(req.reviewedAt)}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ManageLeavePage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const currentYear = new Date().getFullYear();
    const [pageTab, setPageTab] = useState<"workspace" | "analytics">("workspace");
    const [listFilter, setListFilter] = useState<"PENDING" | "ALL">("PENDING");
    const [yearFilter, setYearFilter] = useState<number>(currentYear);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [reviewError, setReviewError] = useState<string | null>(null);

    const { data: summary } = useQuery({
        queryKey: ["leave-summary", yearFilter],
        queryFn: () => LeaveService.getSummary(accessToken, yearFilter),
        enabled: !!accessToken,
    });

    const { data: yearlyData = [] } = useQuery({
        queryKey: ["leave-yearly-analytics"],
        queryFn: () => LeaveService.getYearlyAnalytics(accessToken),
        enabled: !!accessToken && pageTab === "analytics",
    });

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["leave-requests", "manage", yearFilter],
        queryFn: () => LeaveService.listRequests(accessToken, { year: yearFilter }),
        enabled: !!accessToken,
    });

    const listSource = listFilter === "PENDING" ? requests.filter((r) => r.status === "PENDING") : requests;
    const filteredList = search.trim()
        ? listSource.filter((r) => `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase()))
        : listSource;

    const selected = filteredList.find((r) => r.id === selectedId) ?? filteredList[0] ?? null;

    const { data: selectedBalances = [] } = useQuery({
        queryKey: ["leave-balance", selected?.employeeId],
        queryFn: () => LeaveService.getEmployeeBalance(accessToken, selected!.employeeId),
        enabled: !!accessToken && !!selected,
    });

    const reviewMutation = useMutation({
        mutationFn: ({ id, status, reviewNote }: { id: string; status: "APPROVED" | "REJECTED"; reviewNote: string }) =>
            LeaveService.reviewRequest(accessToken, id, { status, reviewNote: reviewNote || undefined }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            queryClient.invalidateQueries({ queryKey: ["leave-summary"] });
            setSelectedId(null);
            setReviewError(null);
        },
        onError: (e: Error) => setReviewError(e.message),
    });

    return (
        <div className="p-6 flex flex-col h-[calc(100vh-56px)]">
            <Link href="/leave" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4" /> Leave
            </Link>

            <div className="flex items-center justify-between mb-4 shrink-0">
                <h1 className="text-xl font-semibold text-slate-900">Leave Approval Workspace</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setPageTab("workspace"); setListFilter("ALL"); }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        <History className="h-3.5 w-3.5" /> View History
                    </button>
                    <Link
                        href="/leave/policy"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        <Settings2 className="h-3.5 w-3.5" /> Policy Guidelines
                    </Link>
                </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4 shrink-0">
                <button
                    onClick={() => setPageTab("workspace")}
                    className={`text-xs font-medium px-4 py-1.5 rounded-md transition-colors ${
                        pageTab === "workspace" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    Workspace
                </button>
                <button
                    onClick={() => setPageTab("analytics")}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-md transition-colors ${
                        pageTab === "analytics" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <BarChart2 className="h-3.5 w-3.5" /> All Years
                </button>
            </div>

            {pageTab === "analytics" ? (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-800">Leave Analytics — All Years</p>
                        <p className="text-xs text-slate-400 mt-0.5">Combined totals across every year on record.</p>
                    </div>
                    <YearlyAnalyticsPanel data={yearlyData} />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 flex-1 min-h-0">
                    {/* Left: request list */}
                    <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
                        <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
                            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                                {LIST_FILTERS.map((f) => (
                                    <button
                                        key={f.value}
                                        onClick={() => setListFilter(f.value)}
                                        className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                                            listFilter === f.value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                        }`}
                                    >
                                        {f.label}
                                        {f.value === "PENDING" && summary?.pending ? ` (${summary.pending})` : ""}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Search employee…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <select
                                    value={yearFilter}
                                    onChange={(e) => setYearFilter(Number(e.target.value))}
                                    className="text-xs border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {isLoading ? (
                                <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
                            ) : filteredList.length === 0 ? (
                                <div className="p-6 text-center text-sm text-slate-400">
                                    {search ? `No results for "${search}"` : "Nothing here."}
                                </div>
                            ) : (
                                filteredList.map((r) => (
                                    <RequestListItem
                                        key={r.id}
                                        req={r}
                                        active={selected?.id === r.id}
                                        onClick={() => setSelectedId(r.id)}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: detail panel */}
                    <div className="min-h-0">
                        {selected ? (
                            <DetailPanel
                                req={selected}
                                allRequests={requests}
                                balances={selectedBalances}
                                onReview={(status, note) =>
                                    reviewMutation.mutate({ id: selected.id, status, reviewNote: note })
                                }
                                isPending={reviewMutation.isPending}
                                reviewError={reviewError}
                            />
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 h-full flex items-center justify-center">
                                <p className="text-sm text-slate-400">Select a request to review.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
