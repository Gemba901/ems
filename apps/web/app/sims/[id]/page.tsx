"use client";

import { useEffect, useState } from "react";
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
  SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import { CommitteeService, SteeringCommittee } from "@/services/committee.service";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Archive,
  EyeOff,
  Info,
  Users,
  MessageSquare,
} from "lucide-react";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  UNDER_REVIEW:        "Under Review",
  NEEDS_CLARIFICATION: "Needs Clarification",
  APPROVED:            "Approved",
  REJECTED:            "Rejected",
  IMPLEMENTED:         "Implemented",
  ARCHIVED:            "Archived",
};

const STATUS_BADGE: Record<SuggestionStatus, string> = {
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
  UNDER_REVIEW:        ["NEEDS_CLARIFICATION", "APPROVED", "REJECTED", "ARCHIVED"],
  NEEDS_CLARIFICATION: ["UNDER_REVIEW", "ARCHIVED"],
  APPROVED:            ["IMPLEMENTED", "ARCHIVED"],
  REJECTED:            ["ARCHIVED"],
  IMPLEMENTED:         ["ARCHIVED"],
  ARCHIVED:            [],
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

  const [suggestion, setSuggestion]   = useState<Suggestion | null>(null);
  const [committees, setCommittees]   = useState<SteeringCommittee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Review form
  const [newStatus, setNewStatus]     = useState<SuggestionStatus | "">("");
  const [note, setNote]               = useState("");
  const [reviewing, setReviewing]     = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Committee assignment
  const [assignCommitteeId, setAssignCommitteeId] = useState("");
  const [assigning, setAssigning]                 = useState(false);
  const [assignError, setAssignError]             = useState<string | null>(null);

  // Clarification response
  const [clarifyNote, setClarifyNote]   = useState("");
  const [clarifying, setClarifying]     = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  const canAssignCommittee = role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.MANAGEMENT;
  const isEmployee = role === Role.EMPLOYEE;

  const reload = () => {
    if (!accessToken || !id) return;
    SimsService.getById(id, accessToken).then(setSuggestion).catch(() => {});
  };

  useEffect(() => {
    if (!accessToken || !id) return;
    const fetches: Promise<any>[] = [
      SimsService.getById(id, accessToken).then(setSuggestion),
    ];
    if (canAssignCommittee) {
      fetches.push(CommitteeService.list(accessToken).then(setCommittees));
    }
    Promise.all(fetches)
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

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !assignCommitteeId || !suggestion) return;
    setAssigning(true);
    setAssignError(null);
    SimsService.assignCommittee(suggestion.id, assignCommitteeId, accessToken)
      .then((updated) => {
        setSuggestion(updated);
        setAssignCommitteeId("");
      })
      .catch((err) => setAssignError(err.message))
      .finally(() => setAssigning(false));
  };

  const handleClarify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !clarifyNote.trim() || !suggestion) return;
    setClarifying(true);
    setClarifyError(null);
    SimsService.clarify(suggestion.id, clarifyNote, accessToken)
      .then((review) => {
        setSuggestion((prev) =>
          prev ? { ...prev, status: "UNDER_REVIEW", reviews: [...prev.reviews, review] } : prev
        );
        setClarifyNote("");
      })
      .catch((err) => setClarifyError(err.message))
      .finally(() => setClarifying(false));
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
              <h1 className="text-2xl font-bold text-slate-900 leading-snug">{suggestion.title}</h1>
              <span className={`self-start shrink-0 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${STATUS_BADGE[suggestion.status]}`}>
                {STATUS_LABELS[suggestion.status]}
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* LEFT — Proposal + Timeline */}
              <div className="xl:col-span-2 space-y-5">
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Detailed Proposal</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{suggestion.description}</p>

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
                    <div className="border border-slate-100 rounded-xl p-3 sm:col-span-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Submitted At</p>
                      <p className="text-sm font-semibold text-slate-800">{formatDateTime(suggestion.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <ReviewTimeline suggestion={suggestion} reviews={suggestion.reviews} />
                </div>
              </div>

              {/* RIGHT — Actions */}
              <div className="xl:col-span-1 space-y-4">

                {/* ── Committee Assignment (Admin / Management) ── */}
                {canAssignCommittee && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="h-4 w-4 text-slate-400" />
                      <h2 className="text-sm font-bold text-slate-800">Assigned Committee</h2>
                    </div>

                    {suggestion.committee ? (
                      <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                        <span className="text-xs font-semibold text-blue-700">{suggestion.committee.name}</span>
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-blue-400 bg-blue-100 px-2 py-0.5 rounded">
                          {suggestion.committee.type}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic mb-4">No committee assigned — this suggestion is pending assignment.</p>
                    )}

                    {suggestion.status !== "ARCHIVED" && (
                      <form onSubmit={handleAssign} className="space-y-3">
                        <select
                          required
                          value={assignCommitteeId}
                          onChange={(e) => setAssignCommitteeId(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        >
                          <option value="">{suggestion.committee ? "Reassign to..." : "Select committee..."}</option>
                          {committees.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                          ))}
                        </select>
                        {assignError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{assignError}</p>
                        )}
                        <button
                          type="submit"
                          disabled={assigning || !assignCommitteeId}
                          className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {assigning ? "Assigning..." : suggestion.committee ? "Reassign" : "Assign Committee"}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* ── Clarification Response (Employee, own suggestion) ── */}
                {isEmployee && suggestion.status === "NEEDS_CLARIFICATION" && (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="h-4 w-4 text-orange-500" />
                      <h2 className="text-sm font-bold text-orange-800">Clarification Requested</h2>
                    </div>
                    <p className="text-xs text-orange-700 mb-4 leading-relaxed">
                      The review committee has requested more information. Provide your clarification below — your response will return this suggestion to the review queue.
                    </p>
                    {suggestion.reviews.filter(r => r.statusChanged === "NEEDS_CLARIFICATION").slice(-1).map(r => r.note).filter(Boolean).map((n, i) => (
                      <blockquote key={i} className="text-xs text-orange-700 italic border-l-2 border-orange-300 pl-3 mb-4">"{n}"</blockquote>
                    ))}
                    <form onSubmit={handleClarify} className="space-y-3">
                      <textarea
                        rows={4}
                        required
                        value={clarifyNote}
                        onChange={(e) => setClarifyNote(e.target.value)}
                        placeholder="Provide additional context or details..."
                        className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 transition-all resize-none"
                      />
                      {clarifyError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{clarifyError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={clarifying || !clarifyNote.trim()}
                        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      >
                        {clarifying ? "Sending..." : "Submit Clarification"}
                      </button>
                    </form>
                  </div>
                )}

                {/* ── Review Form (committee members only — enforced server-side) ── */}
                {suggestion.committeeId && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm sticky top-6">
                    <div className="flex items-center gap-2 mb-5">
                      <h2 className="text-sm font-bold text-slate-800">Add a Review</h2>
                      {suggestion.committee && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                          <Users className="h-2.5 w-2.5" /> {suggestion.committee.name}
                        </span>
                      )}
                    </div>

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
                )}

              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
