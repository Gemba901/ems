"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveRequest, LeaveStatus,
    LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS,
} from "@/services/leave.service";
function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
import { Check, X, ArrowLeft, Filter, Settings2, UserCheck, AlertTriangle } from "lucide-react";
import Link from "next/link";

const STATUS_FILTERS: { label: string; value: LeaveStatus | "ALL" }[] = [
    { label: "All", value: "ALL" },
    { label: "Pending", value: "PENDING" },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
];

function ReviewModal({
    req,
    allRequests,
    onClose,
    onSubmit,
    isPending,
}: {
    req: LeaveRequest;
    allRequests: LeaveRequest[];
    onClose: () => void;
    onSubmit: (status: "APPROVED" | "REJECTED", note: string) => void;
    isPending: boolean;
}) {
    const [note, setNote] = useState("");

    // Compute concurrent leaves from the already-fetched list (no extra API call)
    const reqStart = new Date(req.startDate);
    const reqEnd   = new Date(req.endDate);
    const concurrent = allRequests.filter((r) =>
        r.id !== req.id &&
        (r.status === "PENDING" || r.status === "APPROVED") &&
        new Date(r.startDate) <= reqEnd &&
        new Date(r.endDate)   >= reqStart,
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900">Review Leave Request</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {req.employee?.firstName} {req.employee?.lastName} · {LEAVE_TYPE_LABELS[req.type]} ·{" "}
                        {fmtShort(req.startDate)} – {fmt(req.endDate)} ({req.days} days)
                    </p>
                </div>

                {/* Handover info */}
                {req.handoverEmployee && (
                    <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                        <UserCheck className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-indigo-700">Handover assigned</p>
                            <p className="text-sm text-indigo-800">
                                {req.handoverEmployee.firstName} {req.handoverEmployee.lastName}
                                {req.handoverEmployee.jobTitle ? ` — ${req.handoverEmployee.jobTitle}` : ""}
                            </p>
                            {req.handoverNotes && (
                                <p className="text-xs text-indigo-600 mt-1 italic">"{req.handoverNotes}"</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Concurrent leave warning */}
                {concurrent.length > 0 && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-amber-700">
                                {concurrent.length} other colleague{concurrent.length !== 1 ? "s" : ""} on leave at the same time
                            </p>
                            <p className="text-xs text-amber-600 mt-0.5">
                                {concurrent.map((r) => `${r.employee?.firstName} ${r.employee?.lastName}`).join(", ")}
                            </p>
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Note <span className="text-slate-400">(optional)</span>
                    </label>
                    <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note for the employee…"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                <div className="flex gap-2">
                    <button onClick={() => onSubmit("REJECTED", note)} disabled={isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 text-sm font-medium py-2 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">
                        <X className="h-4 w-4" /> Reject
                    </button>
                    <button onClick={() => onSubmit("APPROVED", note)} disabled={isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors">
                        <Check className="h-4 w-4" /> Approve
                    </button>
                </div>
                <button onClick={onClose} className="w-full mt-2 text-sm text-slate-400 hover:text-slate-600 py-1.5 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    );
}

export default function ManageLeavePage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const [statusFilter, setStatusFilter] = useState<LeaveStatus | "ALL">("PENDING");
    const [reviewing, setReviewing] = useState<LeaveRequest | null>(null);

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["leave-requests", "manage", statusFilter],
        queryFn: () =>
            LeaveService.listRequests(accessToken, statusFilter !== "ALL" ? { status: statusFilter } : undefined),
        enabled: !!accessToken,
    });

    const reviewMutation = useMutation({
        mutationFn: ({ id, status, reviewNote }: { id: string; status: "APPROVED" | "REJECTED"; reviewNote: string }) =>
            LeaveService.reviewRequest(accessToken, id, { status, reviewNote: reviewNote || undefined }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            setReviewing(null);
        },
    });

    return (
        <div className="p-6">
            <Link href="/leave" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to Leave
            </Link>

            <div className="flex items-center justify-between mb-6">
                <h1 className="text-lg font-bold text-slate-900">Manage Leave Requests</h1>
                <div className="flex items-center gap-3">
                <Link
                    href="/leave/policy"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                    <Settings2 className="h-3.5 w-3.5" /> Leave Policy
                </Link>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
                    <Filter className="h-3.5 w-3.5 text-slate-400 ml-2" />
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                statusFilter === f.value
                                    ? "bg-indigo-600 text-white"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 flex justify-center">
                        <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-sm text-slate-400">No {statusFilter !== "ALL" ? statusFilter.toLowerCase() : ""} leave requests</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                                <th className="text-left px-4 py-3">Employee</th>
                                <th className="text-left px-4 py-3">Type</th>
                                <th className="text-left px-4 py-3">Dates</th>
                                <th className="text-left px-4 py-3">Days</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Applied</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((r) => {
                                const rStart = new Date(r.startDate);
                                const rEnd   = new Date(r.endDate);
                                const concurrentCount = requests.filter((other) =>
                                    other.id !== r.id &&
                                    (other.status === "PENDING" || other.status === "APPROVED") &&
                                    new Date(other.startDate) <= rEnd &&
                                    new Date(other.endDate)   >= rStart,
                                ).length;

                                return (
                                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {r.employee?.firstName} {r.employee?.lastName}
                                        {r.employee?.jobTitle && (
                                            <span className="block text-xs text-slate-400 font-normal">{r.employee.jobTitle}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{LEAVE_TYPE_LABELS[r.type]}</td>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                        {fmtShort(r.startDate)} – {fmtShort(r.endDate)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{r.days}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${LEAVE_STATUS_COLORS[r.status]}`}>
                                                {r.status}
                                            </span>
                                            {concurrentCount > 0 && (
                                                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                    <AlertTriangle className="h-2.5 w-2.5" />
                                                    {concurrentCount} overlap
                                                </span>
                                            )}
                                            {r.handoverEmployee && (
                                                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                                    <UserCheck className="h-2.5 w-2.5" />
                                                    cover
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                        {fmt(r.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {r.status === "PENDING" && (
                                            <button
                                                onClick={() => setReviewing(r)}
                                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                                            >
                                                Review
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {reviewing && (
                <ReviewModal
                    req={reviewing}
                    allRequests={requests}
                    onClose={() => setReviewing(null)}
                    onSubmit={(status, note) =>
                        reviewMutation.mutate({ id: reviewing.id, status, reviewNote: note })
                    }
                    isPending={reviewMutation.isPending}
                />
            )}
        </div>
    );
}
