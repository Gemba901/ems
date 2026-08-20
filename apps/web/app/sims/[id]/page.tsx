"use client";

import { useRef, useState } from "react";
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
  DecisionType,
  KaizenDetailsPayload,
  calcWeight,
} from "@/services/sims.service";
import { CommitteeService } from "@/services/committee.service";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { uploadImage } from "@/services/uploads.service";
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
  ImagePlus,
  Camera,
  X,
  Sparkles,
} from "lucide-react";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW:          "Waiting for Review",
  UNDER_REVIEW:                "Under Review",
  ON_HOLD:                     "On Hold",
  SELECTED_FOR_SGA:            "Selected for SGA",
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  IMPLEMENTED:                 "Implemented",
  REJECTED:                    "Rejected",
};

const STATUS_BADGE: Record<SuggestionStatus, string> = {
  WAITING_FOR_REVIEW:          "bg-slate-100 text-slate-600",
  UNDER_REVIEW:                "bg-amber-100 text-amber-700",
  ON_HOLD:                     "bg-orange-100 text-orange-700",
  SELECTED_FOR_SGA:            "bg-indigo-100 text-indigo-700",
  APPROVED_FOR_IMPLEMENTATION: "bg-teal-100 text-teal-700",
  IMPLEMENTED:                 "bg-emerald-100 text-emerald-700",
  REJECTED:                    "bg-red-100 text-red-700",
};

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  WORKPLACE_CORRECTION: "Workplace Suggestion & Correction",
  DAILY_KAIZEN:         "Daily Gemba Kaizen",
};

type DecisionField = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "date" | "select";
};

const WORKPLACE_CORRECTION_FIELDS: DecisionField[] = [
  { key: "action",                label: "Correction Required", required: true,  type: "text" },
  { key: "responsibleEmployeeId", label: "Responsible Person",  required: true,  type: "select" },
  { key: "supportRequired",       label: "Support Required",    required: false, type: "text" },
  { key: "targetDate",            label: "Target Date",         required: true,  type: "date" },
];

const SGA_FIELDS: DecisionField[] = [
  { key: "responsibleEmployeeId", label: "Responsible Person", required: true, type: "select" },
];

const ON_HOLD_FIELDS: DecisionField[] = [
  { key: "reason",                label: "Reason",             required: true, type: "textarea" },
  { key: "responsibleEmployeeId", label: "Responsible Person", required: true, type: "select" },
];

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function DecisionFieldsForm({
  fields, values, onChange, optionsByKey,
}: {
  fields: DecisionField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  optionsByKey?: Record<string, { value: string; label: string }[]>;
}) {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            {f.label}{f.required && <span className="text-red-500"> *</span>}
          </label>
          {f.type === "textarea" ? (
            <textarea
              rows={2}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          ) : f.type === "select" ? (
            <select
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">Select...</option>
              {(optionsByKey?.[f.key] ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={f.type}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          )}
        </div>
      ))}
    </div>
  );
}

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
  WAITING_FOR_REVIEW:          ["UNDER_REVIEW"],
  UNDER_REVIEW:                ["ON_HOLD", "SELECTED_FOR_SGA", "APPROVED_FOR_IMPLEMENTATION", "REJECTED"],
  ON_HOLD:                     ["UNDER_REVIEW", "SELECTED_FOR_SGA", "APPROVED_FOR_IMPLEMENTATION", "REJECTED"],
  SELECTED_FOR_SGA:            ["IMPLEMENTED", "REJECTED"],
  APPROVED_FOR_IMPLEMENTATION: ["IMPLEMENTED", "REJECTED"],
  IMPLEMENTED:                 [],
  REJECTED:                    [],
};


function TimelineIcon({ status }: { status: SuggestionStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "IMPLEMENTED")                 return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "APPROVED_FOR_IMPLEMENTATION") return <CheckCircle2 className={`${cls} text-teal-500`} />;
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
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Submitted</span>
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
  const [newStatus, setNewStatus]         = useState<SuggestionStatus | "">("");
  const [note, setNote]                   = useState("");
  const [decisionType, setDecisionType]   = useState<DecisionType | "">("");
  const [decisionFields, setDecisionFields] = useState<Record<string, string>>({});
  const [reviewError, setReviewError]     = useState<string | null>(null);

  // Daily Gemba Kaizen sub-form (shown when decisionType === "DAILY_KAIZEN")
  const [kaizenCondition, setKaizenCondition]       = useState("");
  const [kaizenOwnerId, setKaizenOwnerId]           = useState("");
  const [kaizenPhotoFile, setKaizenPhotoFile]       = useState<File | null>(null);
  const [kaizenPhotoPreview, setKaizenPhotoPreview] = useState<string | null>(null);
  const kaizenFileInputRef = useRef<HTMLInputElement>(null);
  const kaizenCameraInputRef = useRef<HTMLInputElement>(null);

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

  const { data: myCommittees } = useQuery({
    queryKey: ["my-committees"],
    queryFn: () => CommitteeService.getMyCommittees(accessToken!),
    enabled: !!accessToken,
  });

  const loading = suggestionLoading;
  const error = suggestionErr ? (suggestionErr as any).message : null;

  const isHODOfDept = role === Role.HOD && suggestion?.departmentId === currentUser?.departmentId;
  const isAssignedHOD = suggestion?.hodId === currentUser?.id;
  const isCommitteeMemberForSuggestion =
    !!suggestion?.committeeId && (myCommittees ?? []).some((c) => c.id === suggestion.committeeId);

  const canReview = isHODOfDept || isCommitteeMemberForSuggestion;

  // Candidates for the responsible-person / kaizen-owner pickers — always the suggestion's OWN
  // department, not the reviewer's, so a cross-department admin or committee member sees the
  // right list instead of their own colleagues.
  const { data: deptColleagues } = useQuery({
    queryKey: ["sims-review-candidates", id],
    queryFn: () => SimsService.getReviewCandidates(id!, accessToken!),
    enabled: !!accessToken && !!id && canReview,
  });

  const responsibleOptions = [
    ...(currentUser && currentUser.departmentId === suggestion?.departmentId
      ? [{ value: currentUser.id, label: `${currentUser.firstName} ${currentUser.lastName} (You)` }]
      : []),
    ...(deptColleagues ?? [])
      .filter((c) => c.id !== currentUser?.id)
      .map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
  ];

  const reviewMutation = useMutation({
    mutationFn: (payload: {
      statusChanged: SuggestionStatus;
      note?: string;
      decisionType?: DecisionType;
      decisionDetails?: Record<string, any>;
      kaizenDetails?: KaizenDetailsPayload;
    }) => SimsService.review(suggestion!.id, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sims-detail", id] });
      setNewStatus("");
      setNote("");
      setDecisionType("");
      setDecisionFields({});
      resetKaizenForm();
    },
    onError: (err: any) => setReviewError(err.message),
  });

  const reviewing = reviewMutation.isPending;

  const updateDecisionField = (key: string, value: string) =>
    setDecisionFields((f) => ({ ...f, [key]: value }));

  const resetKaizenForm = () => {
    setKaizenCondition("");
    setKaizenOwnerId("");
    setKaizenPhotoFile(null);
    setKaizenPhotoPreview(null);
    if (kaizenFileInputRef.current) kaizenFileInputRef.current.value = "";
    if (kaizenCameraInputRef.current) kaizenCameraInputRef.current.value = "";
  };

  const handleKaizenPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setReviewError("Only image files are allowed."); return; }
    if (file.size > 10 * 1024 * 1024) { setReviewError("Image must be under 10 MB."); return; }
    setKaizenPhotoFile(file);
    setKaizenPhotoPreview(URL.createObjectURL(file));
    setReviewError(null);
  };

  const removeKaizenPhoto = () => {
    if (kaizenPhotoFile && kaizenPhotoPreview) URL.revokeObjectURL(kaizenPhotoPreview);
    setKaizenPhotoFile(null);
    setKaizenPhotoPreview(null);
    if (kaizenFileInputRef.current) kaizenFileInputRef.current.value = "";
    if (kaizenCameraInputRef.current) kaizenCameraInputRef.current.value = "";
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatus || !suggestion) return;
    setReviewError(null);

    const isDailyKaizen = newStatus === "APPROVED_FOR_IMPLEMENTATION" && decisionType === "DAILY_KAIZEN";

    let decisionDetails: Record<string, any> | undefined;
    if (newStatus === "APPROVED_FOR_IMPLEMENTATION" || newStatus === "SELECTED_FOR_SGA" || newStatus === "ON_HOLD") {
      decisionDetails = { ...decisionFields };
      if (decisionFields.responsibleEmployeeId) {
        const match = responsibleOptions.find((o) => o.value === decisionFields.responsibleEmployeeId);
        if (match) decisionDetails.responsibleEmployeeName = match.label;
      }
    }

    let kaizenDetails: KaizenDetailsPayload | undefined;
    if (isDailyKaizen) {
      if (!kaizenOwnerId) {
        setReviewError("A kaizen owner is required to raise a Daily Gemba Kaizen.");
        return;
      }
      let beforePhotoUrl: string | undefined;
      if (kaizenPhotoFile) {
        try {
          const { fileUrl } = await uploadImage(kaizenPhotoFile, "kaizen", accessToken!);
          beforePhotoUrl = fileUrl;
        } catch (err: any) {
          setReviewError(err.message || "Failed to upload before photo");
          return;
        }
      } else if (kaizenPhotoPreview) {
        beforePhotoUrl = kaizenPhotoPreview;
      }
      kaizenDetails = {
        kaizenOwnerId,
        conditionDescription: kaizenCondition.trim() || undefined,
        beforePhotoUrl,
      };
    }

    reviewMutation.mutate({
      statusChanged: newStatus,
      note: note || undefined,
      decisionType: newStatus === "APPROVED_FOR_IMPLEMENTATION" ? (decisionType || undefined) : undefined,
      decisionDetails,
      kaizenDetails,
    });
  };

  const allowedNext = suggestion ? ALLOWED_TRANSITIONS[suggestion.status] : [];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6">

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
                  {suggestion.linkedKaizenId && (
                    <Link
                      href={`/kaizen/${suggestion.linkedKaizenId}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5 hover:bg-emerald-100 transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Raised as a Kaizen →
                    </Link>
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

                {suggestion.status === "ON_HOLD" && suggestion.decisionDetails && (
                  <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <h3 className="text-sm font-bold text-orange-900 uppercase tracking-widest">On Hold</h3>
                    </div>
                    {suggestion.decisionDetails.reason && (
                      <p className="text-sm text-orange-800 leading-relaxed whitespace-pre-wrap">
                        {suggestion.decisionDetails.reason}
                      </p>
                    )}
                    {suggestion.decisionDetails.responsibleEmployeeName && (
                      <p className="text-xs text-orange-700 mt-3 pt-3 border-t border-orange-200">
                        Responsible: <span className="font-semibold">{suggestion.decisionDetails.responsibleEmployeeName}</span>
                      </p>
                    )}
                  </div>
                )}

                {suggestion.status === "SELECTED_FOR_SGA" && suggestion.decisionDetails?.responsibleEmployeeName && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-widest">Selected for SGA</h3>
                    </div>
                    <p className="text-xs text-indigo-700 mt-2">
                      Responsible: <span className="font-semibold">{suggestion.decisionDetails.responsibleEmployeeName}</span>
                    </p>
                  </div>
                )}

                {suggestion.implementationNote && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest">Implementation Direction</h3>
                    </div>
                    <p className="text-sm text-emerald-800 leading-relaxed whitespace-pre-wrap italic">"{suggestion.implementationNote}"</p>
                  </div>
                )}

                {suggestion.status === "IMPLEMENTED" && suggestion.decisionDetails && Object.keys(suggestion.decisionDetails).length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest">
                        Implementation Evidence
                        {suggestion.decisionType && ` — ${DECISION_TYPE_LABELS[suggestion.decisionType]}`}
                      </h3>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(suggestion.decisionDetails).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-[10px] font-semibold text-emerald-700/70 uppercase tracking-wider">{humanizeKey(key)}</dt>
                          <dd className="text-sm text-emerald-900 mt-0.5 break-words">
                            {key === "evidence" && typeof value === "string" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={value} alt="Evidence" className="mt-1 max-h-48 rounded-lg border border-emerald-200" />
                            ) : (
                              String(value)
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <ReviewTimeline suggestion={suggestion} reviews={suggestion.reviews} />
                </div>
              </div>

              {/* RIGHT — Actions */}
              <div className="xl:col-span-1 space-y-4">

                {/* ── Review Form (department HOD, or the committee once forwarded) ── */}
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
                    ) : suggestion.status === "WAITING_FOR_REVIEW" ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-500">
                          This suggestion is waiting for review. Start reviewing to move it into the pipeline.
                        </p>
                        <button
                          onClick={() => {
                            setReviewError(null);
                            reviewMutation.mutate({ statusChanged: "UNDER_REVIEW" });
                          }}
                          disabled={reviewing}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {reviewing ? "Starting..." : "Start Review"}
                        </button>
                        {reviewError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{reviewError}</p>
                        )}
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
                            onChange={(e) => {
                              setNewStatus(e.target.value as SuggestionStatus);
                              setDecisionType("");
                              setDecisionFields({});
                              resetKaizenForm();
                            }}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                          >
                            <option value="">Select status...</option>
                            {allowedNext.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </div>

                        {newStatus === "APPROVED_FOR_IMPLEMENTATION" && (
                          <div className="space-y-4 pt-2 border-t border-slate-100">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                Decision Type<span className="text-red-500"> *</span>
                              </label>
                              <select
                                required
                                value={decisionType}
                                onChange={(e) => {
                                  const val = e.target.value as DecisionType;
                                  setDecisionType(val);
                                  setDecisionFields({});
                                  if (val === "DAILY_KAIZEN") {
                                    resetKaizenForm();
                                    setKaizenCondition(`${suggestion.title}\n\n${suggestion.description}`);
                                    setKaizenPhotoPreview(suggestion.imageUrl ?? null);
                                  }
                                }}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                              >
                                <option value="">Select decision type...</option>
                                {Object.entries(DECISION_TYPE_LABELS).map(([val, label]) => (
                                  <option key={val} value={val}>{label}</option>
                                ))}
                              </select>
                            </div>
                            {decisionType === "WORKPLACE_CORRECTION" && (
                              <DecisionFieldsForm
                                fields={WORKPLACE_CORRECTION_FIELDS}
                                values={decisionFields}
                                onChange={updateDecisionField}
                                optionsByKey={{ responsibleEmployeeId: responsibleOptions }}
                              />
                            )}
                            {decisionType === "DAILY_KAIZEN" && (
                              <div className="space-y-4">
                                <p className="text-xs text-slate-500 -mt-1">
                                  This raises a draft Kaizen with the reason, reference and condition pre-filled from this
                                  suggestion. The kaizen owner you pick will complete the rest of the wizard themselves.
                                </p>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                    Kaizen Owner<span className="text-red-500"> *</span>
                                  </label>
                                  <select
                                    required
                                    value={kaizenOwnerId}
                                    onChange={(e) => setKaizenOwnerId(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                  >
                                    <option value="">Select...</option>
                                    {responsibleOptions.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                    Condition/Opportunity for Improvement
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={kaizenCondition}
                                    onChange={(e) => setKaizenCondition(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                    Before Photo <span className="text-slate-400 font-normal normal-case">(optional)</span>
                                  </label>
                                  {kaizenPhotoPreview ? (
                                    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={kaizenPhotoPreview} alt="Before preview" className="w-full max-h-48 object-contain" />
                                      <button
                                        type="button"
                                        onClick={removeKaizenPhoto}
                                        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => kaizenFileInputRef.current?.click()}
                                        className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-4 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
                                      >
                                        <ImagePlus className="h-3.5 w-3.5" /> Attach a photo
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => kaizenCameraInputRef.current?.click()}
                                        className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-4 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
                                      >
                                        <Camera className="h-3.5 w-3.5" /> Take a photo
                                      </button>
                                    </div>
                                  )}
                                  <input ref={kaizenFileInputRef} type="file" accept="image/*" onChange={handleKaizenPhotoChange} className="hidden" />
                                  <input ref={kaizenCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleKaizenPhotoChange} className="hidden" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {newStatus === "SELECTED_FOR_SGA" && (
                          <div className="pt-2 border-t border-slate-100">
                            <DecisionFieldsForm
                              fields={SGA_FIELDS}
                              values={decisionFields}
                              onChange={updateDecisionField}
                              optionsByKey={{ responsibleEmployeeId: responsibleOptions }}
                            />
                          </div>
                        )}

                        {newStatus === "ON_HOLD" && (
                          <div className="pt-2 border-t border-slate-100">
                            <DecisionFieldsForm
                              fields={ON_HOLD_FIELDS}
                              values={decisionFields}
                              onChange={updateDecisionField}
                              optionsByKey={{ responsibleEmployeeId: responsibleOptions }}
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            {newStatus === "REJECTED" ? "Reason for Rejection" : "Review Notes"}
                            {newStatus === "REJECTED" && <span className="text-red-500"> *</span>}
                          </label>
                          <textarea
                            rows={4}
                            required={newStatus === "REJECTED"}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={newStatus === "REJECTED" ? "Why is this being rejected?" : "Enter evaluation notes..."}
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
