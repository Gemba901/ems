"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveRequest, LeaveStatus, YearlyAnalytics,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
import {
    Check, X, ArrowLeft, Settings2, UserCheck, AlertTriangle,
    ChevronDown, ChevronUp, Search, BarChart2,
} from "lucide-react";
import Link from "next/link";

function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const STATUS_FILTERS: { label: string; value: LeaveStatus | "ALL" }[] = [
    { label: "All",      value: "ALL" },
    { label: "Pending",  value: "PENDING" },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
];

function ReviewModal({
    req,
    allRequests,
    onClose,
    onSubmit,
    isPending,
    reviewError,
}: {
    req: LeaveRequest;
    allRequests: LeaveRequest[];
    onClose: () => void;
    onSubmit: (status: "APPROVED" | "REJECTED", note: string) => void;
    isPending: boolean;
    reviewError: string | null;
}) {
    const [note, setNote] = useState("");

    const reqStart = new Date(req.startDate);
    const reqEnd   = new Date(req.endDate);
    const concurrent = allRequests.filter((r) =>
        r.id !== req.id &&
        (r.status === "PENDING" || r.status === "APPROVED") &&
        new Date(r.startDate) <= reqEnd &&
        new Date(r.endDate)   >= reqStart,
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Review request</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {req.employee?.firstName} {req.employee?.lastName} &middot; {LEAVE_TYPE_LABELS[req.type] ?? req.type} &middot;{" "}
                        {fmtShort(req.startDate)} – {fmt(req.endDate)} ({req.days} day{req.days !== 1 ? "s" : ""})
                    </p>
                </div>

                {req.reason && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                        <p className="text-xs text-slate-400 mb-0.5">Reason</p>
                        <p className="text-sm text-slate-700">{req.reason}</p>
                    </div>
                )}

                {req.handoverEmployee && (
                    <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                        <UserCheck className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 w-full">
                            <p className="text-xs text-slate-500 mb-0.5">Cover persons</p>
                            <p className="text-sm text-slate-800">
                                1. {req.handoverEmployee.firstName} {req.handoverEmployee.lastName}
                                {req.handoverEmployee.jobTitle ? ` — ${req.handoverEmployee.jobTitle}` : ""}
                            </p>
                            {req.handoverEmployee2 && (
                                <p className="text-sm text-slate-800">
                                    2. {req.handoverEmployee2.firstName} {req.handoverEmployee2.lastName}
                                    {req.handoverEmployee2.jobTitle ? ` — ${req.handoverEmployee2.jobTitle}` : ""}
                                </p>
                            )}
                            {req.handoverNotes && (
                                <p className="text-xs text-slate-500 italic">&ldquo;{req.handoverNotes}&rdquo;</p>
                            )}
                        </div>
                    </div>
                )}

                {concurrent.length > 0 && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-medium text-amber-700">
                                {concurrent.length} other colleague{concurrent.length !== 1 ? "s" : ""} on leave at the same time
                            </p>
                            <p className="text-xs text-amber-600 mt-0.5">
                                {concurrent.map((r) => `${r.employee?.firstName} ${r.employee?.lastName}`).join(", ")}
                            </p>
                        </div>
                    </div>
                )}

                {reviewError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{reviewError}</p>
                    </div>
                )}

                <div>
                    <label className="block text-xs text-slate-500 mb-1.5">
                        Note <span className="text-slate-400">(optional — shown to employee)</span>
                    </label>
                    <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add context for the employee…"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => onSubmit("REJECTED", note)}
                        disabled={isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors"
                    >
                        <X className="h-4 w-4" /> Reject
                    </button>
                    <button
                        onClick={() => onSubmit("APPROVED", note)}
                        disabled={isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                        <Check className="h-4 w-4" /> Approve
                    </button>
                </div>
                <button onClick={onClose} className="w-full text-sm text-slate-400 hover:text-slate-600 py-1 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    );
}

function ExpandedDetail({ req }: { req: LeaveRequest }) {
    return (
        <tr className="bg-slate-50 border-b border-slate-100">
            <td colSpan={7} className="px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    {req.reason ? (
                        <div>
                            <p className="text-xs text-slate-400 mb-0.5">Reason</p>
                            <p className="text-slate-700">{req.reason}</p>
                        </div>
                    ) : null}
                    {(req.handoverEmployee || req.handoverEmployee2) ? (
                        <div>
                            <p className="text-xs text-slate-400 mb-0.5">Cover persons</p>
                            {req.handoverEmployee && (
                                <p className="text-slate-700">
                                    1. {req.handoverEmployee.firstName} {req.handoverEmployee.lastName}
                                    {req.handoverEmployee.jobTitle ? ` — ${req.handoverEmployee.jobTitle}` : ""}
                                </p>
                            )}
                            {req.handoverEmployee2 && (
                                <p className="text-slate-700 mt-0.5">
                                    2. {req.handoverEmployee2.firstName} {req.handoverEmployee2.lastName}
                                    {req.handoverEmployee2.jobTitle ? ` — ${req.handoverEmployee2.jobTitle}` : ""}
                                </p>
                            )}
                            {req.handoverNotes && (
                                <p className="text-xs text-slate-500 mt-0.5 italic">&ldquo;{req.handoverNotes}&rdquo;</p>
                            )}
                        </div>
                    ) : null}
                    {req.reviewNote ? (
                        <div>
                            <p className="text-xs text-slate-400 mb-0.5">Review note</p>
                            <p className="text-slate-700 italic">&ldquo;{req.reviewNote}&rdquo;</p>
                        </div>
                    ) : null}
                    {req.reviewedBy ? (
                        <div>
                            <p className="text-xs text-slate-400 mb-0.5">Reviewed by</p>
                            <p className="text-slate-700">{req.reviewedBy.name}</p>
                            {req.reviewedAt && <p className="text-xs text-slate-400 mt-0.5">{fmt(req.reviewedAt)}</p>}
                        </div>
                    ) : null}
                    {!req.reason && !req.handoverEmployee && !req.reviewNote && !req.reviewedBy && (
                        <p className="text-xs text-slate-400 col-span-3">No additional details.</p>
                    )}
                </div>
            </td>
        </tr>
    );
}

function YearlyAnalyticsPanel({ data }: { data: YearlyAnalytics[] }) {
    if (data.length === 0) return (
        <p className="text-sm text-slate-400 py-4">No leave data yet.</p>
    );
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
                        <td className="px-4 py-3 font-semibold text-amber-600 tabular-nums">
                            {data.reduce((s, r) => s + r.pending, 0)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-600 tabular-nums">
                            {data.reduce((s, r) => s + r.approved, 0)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-red-500 tabular-nums">
                            {data.reduce((s, r) => s + r.rejected, 0)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">
                            {data.reduce((s, r) => s + r.totalDays, 0)}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default function ManageLeavePage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const currentYear = new Date().getFullYear();
    const [tab, setTab]               = useState<"requests" | "analytics">("requests");
    const [statusFilter, setStatusFilter] = useState<LeaveStatus | "ALL">("PENDING");
    const [yearFilter, setYearFilter]     = useState<number>(currentYear);
    const [reviewing, setReviewing]       = useState<LeaveRequest | null>(null);
    const [reviewError, setReviewError]   = useState<string | null>(null);
    const [expandedId, setExpandedId]     = useState<string | null>(null);
    const [search, setSearch]             = useState("");

    const { data: summary } = useQuery({
        queryKey: ["leave-summary", yearFilter],
        queryFn: () => LeaveService.getSummary(accessToken, yearFilter),
        enabled: !!accessToken,
    });

    const { data: yearlyData = [] } = useQuery({
        queryKey: ["leave-yearly-analytics"],
        queryFn: () => LeaveService.getYearlyAnalytics(accessToken),
        enabled: !!accessToken && tab === "analytics",
    });

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["leave-requests", "manage", statusFilter, yearFilter],
        queryFn: () =>
            LeaveService.listRequests(accessToken, {
                ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
                year: yearFilter,
            }),
        enabled: !!accessToken,
    });

    const reviewMutation = useMutation({
        mutationFn: ({ id, status, reviewNote }: { id: string; status: "APPROVED" | "REJECTED"; reviewNote: string }) =>
            LeaveService.reviewRequest(accessToken, id, { status, reviewNote: reviewNote || undefined }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            queryClient.invalidateQueries({ queryKey: ["leave-summary"] });
            setReviewing(null);
            setReviewError(null);
        },
        onError: (e: Error) => setReviewError(e.message),
    });

    const filtered = search.trim()
        ? requests.filter((r) => {
            const q = search.toLowerCase();
            return `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.toLowerCase().includes(q);
        })
        : requests;

    const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

    return (
        <div className="p-6">
            <Link href="/leave" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Leave
            </Link>

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-semibold text-slate-900">Manage Requests</h1>
                <Link
                    href="/leave/policy"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    <Settings2 className="h-3.5 w-3.5" /> Leave Policy
                </Link>
            </div>

            {/* Summary strip */}
            {summary && (
                <div className="flex items-center gap-6 mb-6 pb-5 border-b border-slate-200">
                    <div>
                        <p className="text-2xl font-semibold text-slate-900 tabular-nums">{summary.pending}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Pending</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div>
                        <p className="text-2xl font-semibold text-emerald-600 tabular-nums">{summary.approved}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Approved</p>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div>
                        <p className="text-2xl font-semibold text-red-500 tabular-nums">{summary.rejected}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Rejected</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
                <button
                    onClick={() => setTab("requests")}
                    className={`text-xs font-medium px-4 py-1.5 rounded-md transition-colors ${
                        tab === "requests" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    Requests
                </button>
                <button
                    onClick={() => setTab("analytics")}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-md transition-colors ${
                        tab === "analytics" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <BarChart2 className="h-3.5 w-3.5" /> All Years
                </button>
            </div>

            {tab === "analytics" ? (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-800">Leave Analytics — All Years</p>
                        <p className="text-xs text-slate-400 mt-0.5">Combined totals across every year on record.</p>
                    </div>
                    <YearlyAnalyticsPanel data={yearlyData} />
                </div>
            ) : (
                <>
                    {/* Filters + search */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                            {STATUS_FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    onClick={() => setStatusFilter(f.value)}
                                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                                        statusFilter === f.value
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-500 hover:text-slate-800"
                                    }`}
                                >
                                    {f.label}
                                    {f.value === "PENDING" && summary?.pending ? (
                                        <span className="ml-1.5 text-[10px] font-semibold bg-white/20 rounded-full px-1.5 py-0.5 tabular-nums">
                                            {summary.pending}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>

                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(Number(e.target.value))}
                            className="text-xs border border-slate-200 rounded-lg bg-white px-2.5 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>

                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search employee…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        {isLoading ? (
                            <div className="p-10 flex justify-center">
                                <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-sm text-slate-400">
                                    {search ? `No results for "${search}"` : `No ${statusFilter !== "ALL" ? statusFilter.toLowerCase() : ""} requests`}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                                        <th className="text-left px-4 py-3 font-medium">Employee</th>
                                        <th className="text-left px-4 py-3 font-medium">Type</th>
                                        <th className="text-left px-4 py-3 font-medium">Dates</th>
                                        <th className="text-left px-4 py-3 font-medium">Days</th>
                                        <th className="text-left px-4 py-3 font-medium">Status</th>
                                        <th className="text-left px-4 py-3 font-medium">Applied</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((r) => {
                                        const rStart = new Date(r.startDate);
                                        const rEnd   = new Date(r.endDate);
                                        const concurrentCount = requests.filter((other) =>
                                            other.id !== r.id &&
                                            (other.status === "PENDING" || other.status === "APPROVED") &&
                                            new Date(other.startDate) <= rEnd &&
                                            new Date(other.endDate)   >= rStart,
                                        ).length;
                                        const isExpanded = expandedId === r.id;
                                        const hasDetail = r.reason || r.handoverEmployee || r.reviewNote || r.reviewedBy;
                                        const coverCount = [r.handoverEmployee, r.handoverEmployee2].filter(Boolean).length;

                                        return [
                                            <tr
                                                key={r.id}
                                                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                                            >
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-slate-800">
                                                        {r.employee?.firstName} {r.employee?.lastName}
                                                    </p>
                                                    {r.employee?.jobTitle && (
                                                        <p className="text-xs text-slate-400 font-normal mt-0.5">{r.employee.jobTitle}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                                    {fmtShort(r.startDate)} – {fmtShort(r.endDate)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 tabular-nums">{r.days}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${LEAVE_STATUS_COLORS[r.status]}`}>
                                                            {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                                                        </span>
                                                        {concurrentCount > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                                {concurrentCount} overlap
                                                            </span>
                                                        )}
                                                        {coverCount > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                                <UserCheck className="h-2.5 w-2.5" />
                                                                {coverCount} cover
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                                    {fmt(r.createdAt)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        {r.status === "PENDING" && (
                                                            <button
                                                                onClick={() => { setReviewing(r); setReviewError(null); }}
                                                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                                                            >
                                                                Review
                                                            </button>
                                                        )}
                                                        {hasDetail && (
                                                            <button
                                                                onClick={() => toggleExpand(r.id)}
                                                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                                                title={isExpanded ? "Collapse" : "Expand"}
                                                            >
                                                                {isExpanded
                                                                    ? <ChevronUp className="h-3.5 w-3.5" />
                                                                    : <ChevronDown className="h-3.5 w-3.5" />
                                                                }
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>,
                                            isExpanded && <ExpandedDetail key={`${r.id}-detail`} req={r} />,
                                        ];
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {reviewing && (
                <ReviewModal
                    req={reviewing}
                    allRequests={requests}
                    onClose={() => { setReviewing(null); setReviewError(null); }}
                    onSubmit={(status, note) =>
                        reviewMutation.mutate({ id: reviewing.id, status, reviewNote: note })
                    }
                    isPending={reviewMutation.isPending}
                    reviewError={reviewError}
                />
            )}
        </div>
    );
}
