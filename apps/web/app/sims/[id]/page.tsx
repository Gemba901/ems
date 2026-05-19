"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService,
  Suggestion,
  SuggestionReview,
  SuggestionStatus,
  ImplementationStatus,
  SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  EyeOff,
  Info,
  TrendingUp,
  User,
} from "lucide-react";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  UNDER_REVIEW:                "Under Review",
  ON_HOLD:                     "On Hold",
  SELECTED_FOR_SGA:            "Selected for SGA",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  REJECTED:                    "Rejected",
};

const STATUS_BADGE: Record<SuggestionStatus, string> = {
  UNDER_REVIEW:                "bg-amber-100 text-amber-700",
  ON_HOLD:                     "bg-orange-100 text-orange-700",
  SELECTED_FOR_SGA:            "bg-indigo-100 text-indigo-700",
  APPROVED_FOR_IMPLEMENTATION: "bg-emerald-100 text-emerald-700",
  REJECTED:                    "bg-red-100 text-red-700",
};

const IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  WORK_IN_PROGRESS: "Work in Progress",
  VERY_SLOW_WORK_IN_PROGRESS: "Very Slow Work in Progress",
  GOOD_WORK_IN_PROGRESS: "Good Work in Progress",
  SLOW_PROGRESS: "Slow Progress",
  IMPLEMENTED: "Implemented",
  SHIFTED_TO_SGA: "Shifted to SGA",
  PREVIOUSLY_IMPLEMENTED: "Previously Implemented",
  UNDER_CONSULTATION: "Under Consultation",
  IMPRACTICAL: "Impractical",
  SAVED_FOR_LATER: "Saved for Later",
};

const IMPLEMENTATION_STATUS_BADGE: Record<ImplementationStatus, string> = {
  WORK_IN_PROGRESS: "bg-blue-100 text-blue-700",
  VERY_SLOW_WORK_IN_PROGRESS: "bg-rose-100 text-rose-700",
  GOOD_WORK_IN_PROGRESS: "bg-emerald-100 text-emerald-700",
  SLOW_PROGRESS: "bg-orange-100 text-orange-700",
  IMPLEMENTED: "bg-green-100 text-green-700",
  SHIFTED_TO_SGA: "bg-purple-100 text-purple-700",
  PREVIOUSLY_IMPLEMENTED: "bg-slate-100 text-slate-700",
  UNDER_CONSULTATION: "bg-indigo-100 text-indigo-700",
  IMPRACTICAL: "bg-red-100 text-red-700",
  SAVED_FOR_LATER: "bg-amber-100 text-amber-700",
};

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; badge: string }> = {
  QUALITY:    { label: "Quality",    badge: "bg-blue-100 text-blue-700" },
  COST:       { label: "Cost",       badge: "bg-emerald-100 text-emerald-700" },
  DELIVERY:   { label: "Delivery",   badge: "bg-purple-100 text-purple-700" },
  SAFETY:     { label: "Safety",     badge: "bg-red-100 text-red-700" },
  MORALE:     { label: "Morale",     badge: "bg-amber-100 text-amber-700" },
  TECHNOLOGY: { label: "Technology", badge: "bg-indigo-100 text-indigo-700" },
  UNKNOWN:    { label: "Unknown",    badge: "bg-slate-100 text-slate-500" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  UNDER_REVIEW:               ["ON_HOLD", "SELECTED_FOR_SGA", "APPROVED_FOR_IMPLEMENTATION", "REJECTED"],
  ON_HOLD:                    ["UNDER_REVIEW", "SELECTED_FOR_SGA", "APPROVED_FOR_IMPLEMENTATION", "REJECTED"],
  SELECTED_FOR_SGA:           ["UNDER_REVIEW", "ON_HOLD", "APPROVED_FOR_IMPLEMENTATION", "REJECTED"],
  APPROVED_FOR_IMPLEMENTATION: ["REJECTED", "SELECTED_FOR_SGA"],
  REJECTED:                   [],
};


function TimelineIcon({ status }: { status: SuggestionStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "APPROVED_FOR_IMPLEMENTATION") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "REJECTED")                    return <XCircle      className={`${cls} text-red-500`} />;
  if (status === "ON_HOLD")                     return <AlertCircle  className={`${cls} text-orange-500`} />;
  if (status === "SELECTED_FOR_SGA")            return <AlertCircle  className={`${cls} text-indigo-500`} />;
  return <Clock className={`${cls} text-slate-400`} />;
}

function ReviewTimeline({ suggestion, reviews }: { suggestion: Suggestion; reviews: SuggestionReview[] }) {
  const submitter = suggestion.isAnonymous
    ? "Anonymous"
    : suggestion.employee
      ? `${suggestion.employee.firstName} ${suggestion.employee.lastName}`
      : "—";

  return (
    <div className="space-y-1">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Review History</h3>
      <ol className="relative border-l border-slate-200 space-y-5 pl-6">
        <li className="relative">
          <div className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Under Review</span>
              <span className="text-xs text-slate-400">{formatDateTime(suggestion.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Originator: <span className="font-medium text-slate-600">{submitter}</span></p>
          </div>
        </li>

        {reviews.map((r) => (
          <li key={r.id} className="relative">
            <div className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200">
              <TimelineIcon status={r.statusChanged} />
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[r.statusChanged]}`}>
                  {STATUS_LABELS[r.statusChanged]}
                </span>
                <span className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                By: <span className="font-medium text-slate-600">{r.reviewer.firstName} {r.reviewer.lastName}</span>
              </p>
              {r.note && (
                <blockquote className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-600 italic leading-relaxed">
                  "{r.note}"
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function SuggestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: authUser, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = authUser?.roleLevel;

  // Review form state
  const [newStatus, setNewStatus]     = useState<SuggestionStatus | "">("");
  const [note, setNote]               = useState("");
  const [implStatus, setImplStatus]   = useState<ImplementationStatus | "">("");
  const [implNote, setImplNote]       = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Implementation status update
  const [showImplUpdate, setShowImplUpdate] = useState(false);
  const [implUpdateError, setImplUpdateError] = useState<string | null>(null);

  const { data: suggestion, isLoading: suggestionLoading, error: suggestionErr } = useQuery({
    queryKey: ["sims-detail", id],
    queryFn: () => SimsService.getById(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const loading = suggestionLoading;
  const error = suggestionErr ? (suggestionErr as any).message : null;

  const isSuperAdmin = role === Role.SUPER_ADMIN;
  const isReviewerRole = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const isHODOfDept = role === Role.HOD && suggestion?.employee?.department?.id === currentUser?.departmentId;
  const isAssignedHOD = suggestion?.hodId === currentUser?.id;

  const canReview = isReviewerRole || isHODOfDept;
  const canUpdateImplementation = isReviewerRole || isHODOfDept;

  const reviewMutation = useMutation({
    mutationFn: (payload: { statusChanged: SuggestionStatus; note?: string; implementationStatus?: ImplementationStatus; implementationNote?: string }) =>
      SimsService.review(suggestion!.id, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sims-detail", id] });
      setNewStatus("");
      setNote("");
      setImplStatus("");
      setImplNote("");
    },
    onError: (err: any) => setReviewError(err.message),
  });

  const implMutation = useMutation({
    mutationFn: (payload: { implementationStatus: ImplementationStatus; implementationNote?: string }) =>
      SimsService.updateImplementation(suggestion!.id, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sims-detail", id] });
      setShowImplUpdate(false);
      setImplStatus("");
      setImplNote("");
    },
    onError: (err: any) => setImplUpdateError(err.message),
  });

  const reviewing = reviewMutation.isPending;
  const updatingImpl = implMutation.isPending;

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatus || !suggestion) return;
    setReviewError(null);
    reviewMutation.mutate({
      statusChanged: newStatus,
      note: note || undefined,
      implementationStatus: implStatus || undefined,
      implementationNote: implNote || undefined,
    });
  };

  const handleUpdateImplementation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!implStatus || !suggestion) return;
    setImplUpdateError(null);
    implMutation.mutate({
      implementationStatus: implStatus as ImplementationStatus,
      implementationNote: implNote || undefined,
    });
  };

  const allowedNext = suggestion ? ALLOWED_TRANSITIONS[suggestion.status] : [];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">

        <Link href="/sims" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Suggestions
        </Link>

        {loading && <p className="text-sm text-slate-400">Loading...</p>}
        {!loading && error && (
          <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl border border-red-100">{error}</p>
        )}

        {!loading && !error && suggestion && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-snug mb-2">{suggestion.title}</h1>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${STATUS_BADGE[suggestion.status]}`}>
                    {STATUS_LABELS[suggestion.status]}
                  </span>
                  {suggestion.implementationStatus && (
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${IMPLEMENTATION_STATUS_BADGE[suggestion.implementationStatus]}`}>
                      {IMPLEMENTATION_STATUS_LABELS[suggestion.implementationStatus]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* LEFT — Proposal + Timeline */}
              <div className="xl:col-span-2 space-y-5">
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Detailed Proposal</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{suggestion.description}</p>
                  {suggestion.imageUrl && (
                    <div className="mt-5 rounded-xl overflow-hidden border border-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={suggestion.imageUrl}
                        alt="Supporting image"
                        className="w-full max-h-96 object-contain bg-slate-50"
                      />
                    </div>
                  )}

                  <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        {suggestion.categories.length > 1 ? "Categories" : "Category"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.categories.map((c) => {
                          const cfg = CATEGORY_CONFIG[c as SuggestionCategory];
                          return cfg ? (
                            <span key={c} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                      {calcWeight(suggestion.categories) > 0 && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Weight: <span className="font-bold text-slate-600">{calcWeight(suggestion.categories).toFixed(1)}</span>
                        </p>
                      )}
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Submitted By</p>
                      {suggestion.employee ? (
                        <p className="text-sm font-semibold text-slate-800">
                          {suggestion.employee.firstName} {suggestion.employee.lastName}
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <EyeOff className="h-3.5 w-3.5" />
                          <span className="text-sm italic">Anonymous</span>
                        </div>
                      )}
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Assigned HOD</p>
                      {suggestion.hod ? (
                        <p className="text-sm font-semibold text-slate-800">{suggestion.hod.firstName} {suggestion.hod.lastName}</p>
                      ) : (
                        <p className="text-sm italic text-slate-400">Pending assignment</p>
                      )}
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Submitted At</p>
                      <p className="text-sm font-semibold text-slate-800">{formatDateTime(suggestion.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {suggestion.implementationNote && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest">Implementation Direction</h3>
                    </div>
                    <p className="text-sm text-emerald-800 leading-relaxed whitespace-pre-wrap italic">"{suggestion.implementationNote}"</p>
                  </div>
                )}

                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <ReviewTimeline suggestion={suggestion} reviews={suggestion.reviews} />
                </div>
              </div>

              {/* RIGHT — Actions */}
              <div className="xl:col-span-1 space-y-4">

                {/* ── Implementation Progress (HOD/Admin) ── */}
                {canUpdateImplementation && suggestion.status === "APPROVED_FOR_IMPLEMENTATION" && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-800">Implementation</h2>
                      </div>
                      <button 
                        onClick={() => setShowImplUpdate(!showImplUpdate)}
                        className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1"
                      >
                        {showImplUpdate ? "Cancel" : "Update Status"}
                      </button>
                    </div>

                    {!showImplUpdate ? (
                      <div className="space-y-3">
                        {suggestion.implementationStatus ? (
                          <div className={`text-xs font-bold px-3 py-2 rounded-xl text-center ${IMPLEMENTATION_STATUS_BADGE[suggestion.implementationStatus]}`}>
                            {IMPLEMENTATION_STATUS_LABELS[suggestion.implementationStatus]}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No implementation updates yet.</p>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleUpdateImplementation} className="space-y-3">
                        <select
                          required
                          value={implStatus}
                          onChange={(e) => setImplStatus(e.target.value as ImplementationStatus)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        >
                          <option value="">Select status...</option>
                          {Object.entries(IMPLEMENTATION_STATUS_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                        <textarea
                          rows={3}
                          value={implNote}
                          onChange={(e) => setImplNote(e.target.value)}
                          placeholder="Implementation notes..."
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                        />
                        {implUpdateError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{implUpdateError}</p>
                        )}
                        <button
                          type="submit"
                          disabled={updatingImpl || !implStatus}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {updatingImpl ? "Updating..." : "Update Progress"}
                        </button>
                      </form>
                    )}
                  </div>
                )}


                {/* ── Review Form (HODs and Admins) ── */}
                {canReview && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm sticky top-6">
                    <div className="flex items-center gap-2 mb-5">
                      <h2 className="text-sm font-bold text-slate-800">Add a Review</h2>
                      {isAssignedHOD && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                          <User className="h-2.5 w-2.5" /> Assigned HOD
                        </span>
                      )}
                    </div>

                    {allowedNext.length === 0 ? (
                      <div className="flex items-start gap-3 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        Final status reached.
                      </div>
                    ) : (
                      <form onSubmit={handleReview} className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Move to Status
                          </label>
                          <select
                            required
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value as SuggestionStatus)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                          >
                            <option value="">Select status...</option>
                            {allowedNext.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </div>

                        {newStatus !== "" && (
                          <div className="space-y-4 pt-2 border-t border-slate-100">
                             <div>
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                {newStatus === "REJECTED" ? "Reason for Rejection" : 
                                 newStatus === "ON_HOLD" ? "Reason for Holding" : 
                                 "Implementation Status / Reason"}
                              </label>
                              <select
                                value={implStatus}
                                onChange={(e) => setImplStatus(e.target.value as ImplementationStatus)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                              >
                                <option value="">Select (optional)...</option>
                                {Object.entries(IMPLEMENTATION_STATUS_LABELS)
                                  .filter(([val]) => {
                                    if (newStatus === "REJECTED" && val === "IMPLEMENTED") return false;
                                    return true;
                                  })
                                  .map(([val, label]) => (
                                  <option key={val} value={val}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                {newStatus === "REJECTED" ? "Rejection Details" : 
                                 newStatus === "ON_HOLD" ? "Hold Details" : 
                                 "Implementation Direction / Note"}
                              </label>
                              <textarea
                                rows={3}
                                value={implNote}
                                onChange={(e) => setImplNote(e.target.value)}
                                placeholder={
                                  newStatus === "REJECTED" ? "Why is this being rejected?" :
                                  newStatus === "ON_HOLD" ? "What is needed to proceed?" :
                                  "Give direction or notes for implementation..."
                                }
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Review Notes
                          </label>
                          <textarea
                            rows={4}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Enter evaluation notes..."
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                          />
                        </div>

                        {reviewError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{reviewError}</p>
                        )}

                        <button
                          type="submit"
                          disabled={reviewing || !newStatus}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {reviewing ? "Saving..." : "Submit Review"}
                        </button>
                      </form>
                    )}
                  </div>
                )}

              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
