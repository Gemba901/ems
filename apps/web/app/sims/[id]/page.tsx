"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService,
  Suggestion,
  SuggestionReview,
  SuggestionStatus,
  SuggestionCategory,
  calcWeight,
  CATEGORY_WEIGHTS,
} from "@/services/sims.service";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Archive,
  EyeOff,
  Info,
} from "lucide-react";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  SUBMITTED:           "Submitted",
  UNDER_REVIEW:        "Under Review",
  NEEDS_CLARIFICATION: "Needs Clarification",
  APPROVED:            "Approved",
  REJECTED:            "Rejected",
  IMPLEMENTED:         "Implemented",
  ARCHIVED:            "Archived",
};

const STATUS_BADGE: Record<SuggestionStatus, string> = {
  SUBMITTED:           "bg-blue-100 text-blue-700",
  UNDER_REVIEW:        "bg-amber-100 text-amber-700",
  NEEDS_CLARIFICATION: "bg-orange-100 text-orange-700",
  APPROVED:            "bg-green-100 text-green-700",
  REJECTED:            "bg-red-100 text-red-700",
  IMPLEMENTED:         "bg-emerald-100 text-emerald-700",
  ARCHIVED:            "bg-slate-100 text-slate-500",
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
  SUBMITTED:           ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW:        ["NEEDS_CLARIFICATION", "APPROVED", "REJECTED", "ARCHIVED"],
  NEEDS_CLARIFICATION: ["UNDER_REVIEW", "ARCHIVED"],
  APPROVED:            ["IMPLEMENTED", "ARCHIVED"],
  REJECTED:            ["ARCHIVED"],
  IMPLEMENTED:         ["ARCHIVED"],
  ARCHIVED:            [],
};

const REVIEWER_CONTEXT: Partial<Record<Role, { title: string; body: string; bg: string }>> = {
  [Role.SUPER_ADMIN]: { title: "Super Admin View", body: "You have full authority to approve, reject, or implement any suggestion across the organisation.", bg: "bg-blue-600" },
  [Role.ADMIN]:       { title: "Admin View",        body: "Your reviews are visible to department leads. Ensure a cost-benefit assessment is considered before final approval.", bg: "bg-blue-600" },
  [Role.MANAGEMENT]:  { title: "Management View",   body: "Review this suggestion with operational impact in mind. Coordinate with HODs before moving to Approved.", bg: "bg-slate-700" },
  [Role.HOD]:         { title: "HOD View",          body: "You are reviewing a suggestion from your department. Add your assessment before escalating to management.", bg: "bg-slate-700" },
};

function TimelineIcon({ status }: { status: SuggestionStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "APPROVED" || status === "IMPLEMENTED") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "REJECTED")            return <XCircle    className={`${cls} text-red-500`} />;
  if (status === "NEEDS_CLARIFICATION") return <AlertCircle className={`${cls} text-orange-500`} />;
  if (status === "ARCHIVED")            return <Archive    className={`${cls} text-slate-400`} />;
  return <Clock className={`${cls} text-slate-400`} />;
}

function ReviewTimeline({ suggestion, reviews }: { suggestion: Suggestion; reviews: SuggestionReview[] }) {
  // Synthetic initial submission entry
  const submitter = suggestion.isAnonymous
    ? "Anonymous"
    : suggestion.employee
      ? `${suggestion.employee.firstName} ${suggestion.employee.lastName}`
      : "—";

  return (
    <div className="space-y-1">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Review History</h3>
      <ol className="relative border-l border-slate-200 space-y-5 pl-6">

        {/* Synthetic "Submitted" entry */}
        <li className="relative">
          <div className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Submitted</span>
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
                Reviewer: <span className="font-medium text-slate-600">{r.reviewer.firstName} {r.reviewer.lastName}</span>
              </p>
              {r.reviewerCommittee && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                  {r.reviewerCommittee.name}
                </p>
              )}
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
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [newStatus, setNewStatus]   = useState<SuggestionStatus | "">("");
  const [note, setNote]             = useState("");
  const [reviewing, setReviewing]   = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const context = role ? REVIEWER_CONTEXT[role] : undefined;

  useEffect(() => {
    if (!accessToken || !id) return;
    SimsService.getById(id, accessToken)
      .then(setSuggestion)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newStatus || !suggestion) return;
    setReviewing(true);
    setReviewError(null);

    SimsService.review(suggestion.id, { statusChanged: newStatus, note: note || undefined }, accessToken)
      .then((review) => {
        setSuggestion((prev) =>
          prev ? { ...prev, status: newStatus, reviews: [...prev.reviews, review] } : prev
        );
        setNewStatus("");
        setNote("");
      })
      .catch((err) => setReviewError(err.message))
      .finally(() => setReviewing(false));
  };

  const allowedNext = suggestion ? ALLOWED_TRANSITIONS[suggestion.status] : [];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">

        {/* Back link */}
        <Link href="/sims" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Suggestions
        </Link>

        {loading && <p className="text-sm text-slate-400">Loading...</p>}
        {!loading && error && (
          <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl border border-red-100">{error}</p>
        )}

        {!loading && !error && suggestion && (
          <>
            {/* Title row */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
              <h1 className="text-2xl font-bold text-slate-900 leading-snug">{suggestion.title}</h1>
              <span className={`self-start shrink-0 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${STATUS_BADGE[suggestion.status]}`}>
                {STATUS_LABELS[suggestion.status]}
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* LEFT — Proposal + Timeline */}
              <div className="xl:col-span-2 space-y-5">

                {/* Proposal text */}
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Detailed Proposal</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{suggestion.description}</p>

                  {/* Metadata grid */}
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
                      {/* Weightage — visible to reviewers only */}
                      {context && (
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
                    <div className="border border-slate-100 rounded-xl p-3 sm:col-span-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Submitted At</p>
                      <p className="text-sm font-semibold text-slate-800">{formatDateTime(suggestion.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <ReviewTimeline suggestion={suggestion} reviews={suggestion.reviews} />
                </div>
              </div>

              {/* RIGHT — Review form + context card */}
              <div className="xl:col-span-1 space-y-4">

                <RoleGuard allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
                  {/* Review form */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm sticky top-6">
                    <h2 className="text-sm font-bold text-slate-800 mb-5">Add a Review</h2>

                    {allowedNext.length === 0 ? (
                      <div className="flex items-start gap-3 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        This suggestion is archived and cannot be updated further.
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

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Review Notes
                          </label>
                          <textarea
                            rows={4}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Enter your evaluation or next steps..."
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

                  {/* Role context card */}
                  {context && (
                    <div className={`${context.bg} rounded-2xl p-5 text-white`}>
                      <p className="text-sm font-bold mb-2">{context.title}</p>
                      <p className="text-xs leading-relaxed opacity-90">{context.body}</p>
                    </div>
                  )}
                </RoleGuard>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
