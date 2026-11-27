"use client";

import { TenantImage } from "@/components/files/TenantImage";
import { useId, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Timeline } from "@/components/patterns/Timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS } from "@/components/sims/sims-ui";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
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
import {
  EmployeeService,
  EmployeeApiResponse,
} from "@/services/employee.service";
import { uploadImage } from "@/services/uploads.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
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

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  WORKPLACE_CORRECTION: "Workplace Correction & Maintenance",
  DAILY_KAIZEN: "Daily Gemba Kaizen",
};

type DecisionField = {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "date" | "select";
};

const WORKPLACE_CORRECTION_FIELDS: DecisionField[] = [
  { key: "action", label: "Correction Required", required: true, type: "text" },
  {
    key: "responsibleEmployeeId",
    label: "Responsible Person",
    required: true,
    type: "select",
  },
  {
    key: "supportRequired",
    label: "Support Required",
    required: false,
    type: "text",
  },
  { key: "targetDate", label: "Target Date", required: true, type: "date" },
];

const SGA_FIELDS: DecisionField[] = [
  {
    key: "responsibleEmployeeId",
    label: "Responsible Person",
    required: true,
    type: "select",
  },
];

const ON_HOLD_FIELDS: DecisionField[] = [
  { key: "reason", label: "Reason", required: true, type: "textarea" },
  {
    key: "responsibleEmployeeId",
    label: "Responsible Person",
    required: true,
    type: "select",
  },
];

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function DecisionFieldsForm({
  fields,
  values,
  onChange,
  optionsByKey,
}: {
  fields: DecisionField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  optionsByKey?: Record<string, { value: string; label: string }[]>;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`${id}-${f.key}`} className="mb-1.5">
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
          </Label>
          {f.type === "textarea" ? (
            <Textarea
              id={`${id}-${f.key}`}
              rows={2}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary resize-none"
            />
          ) : f.type === "select" ? (
            <NativeSelect
              id={`${id}-${f.key}`}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              <option value="">Select...</option>
              {(optionsByKey?.[f.key] ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id={`${id}-${f.key}`}
              type={f.type}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
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

const CATEGORY_CONFIG: Record<
  SuggestionCategory,
  { label: string; badge: string }
> = {
  QUALITY: { label: "Quality", badge: "bg-info-subtle text-info" },
  COST: { label: "Cost", badge: "bg-success-subtle text-success" },
  DELIVERY: { label: "Delivery", badge: "bg-accent text-primary" },
  SAFETY: { label: "Safety", badge: "bg-danger-subtle text-danger" },
  MORALE: { label: "Morale", badge: "bg-warning-subtle text-warning" },
  TECHNOLOGY: { label: "Technology", badge: "bg-accent text-primary" },
  UNKNOWN: { label: "Unknown", badge: "bg-muted text-muted-foreground" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  WAITING_FOR_REVIEW: ["UNDER_REVIEW"],
  UNDER_REVIEW: [
    "ON_HOLD",
    "SELECTED_FOR_SGA",
    "APPROVED_FOR_IMPLEMENTATION",
    "REJECTED",
  ],
  ON_HOLD: [
    "UNDER_REVIEW",
    "SELECTED_FOR_SGA",
    "APPROVED_FOR_IMPLEMENTATION",
    "REJECTED",
  ],
  SELECTED_FOR_SGA: ["IMPLEMENTED", "REJECTED"],
  APPROVED_FOR_IMPLEMENTATION: ["IMPLEMENTED", "REJECTED"],
  IMPLEMENTED: [],
  REJECTED: [],
};

function ReviewTimeline({
  suggestion,
  reviews,
}: {
  suggestion: Suggestion;
  reviews: SuggestionReview[];
}) {
  const submitter = suggestion.isAnonymous
    ? "Anonymous"
    : suggestion.employee
      ? `${suggestion.employee.firstName} ${suggestion.employee.lastName}`
      : "—";

  return (
    <Timeline
      label="Suggestion review history"
      items={[
        {
          id: "submitted",
          title: "Submitted",
          actor: submitter,
          dateTime: suggestion.createdAt,
          timeLabel: formatDateTime(suggestion.createdAt),
        },
        ...reviews.map((review) => ({
          id: review.id,
          title: STATUS_LABELS[review.statusChanged],
          actor: `${review.reviewer.firstName} ${review.reviewer.lastName}`,
          dateTime: review.createdAt,
          timeLabel: formatDateTime(review.createdAt),
          description: review.note ? (
            <p className="whitespace-pre-wrap">{review.note}</p>
          ) : undefined,
        })),
      ]}
    />
  );
}

export default function SuggestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: authUser, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = authUser?.roleLevel;

  // Review form state
  const [newStatus, setNewStatus] = useState<SuggestionStatus | "">("");
  const [note, setNote] = useState("");
  const [decisionType, setDecisionType] = useState<DecisionType | "">("");
  const [decisionFields, setDecisionFields] = useState<Record<string, string>>(
    {},
  );
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Daily Gemba Kaizen sub-form (shown when decisionType === "DAILY_KAIZEN")
  const [kaizenCondition, setKaizenCondition] = useState("");
  const [kaizenOwnerId, setKaizenOwnerId] = useState("");
  const [kaizenPhotoFile, setKaizenPhotoFile] = useState<File | null>(null);
  const [kaizenPhotoPreview, setKaizenPhotoPreview] = useState<string | null>(
    null,
  );
  const kaizenFileInputRef = useRef<HTMLInputElement>(null);
  const kaizenCameraInputRef = useRef<HTMLInputElement>(null);

  const {
    data: suggestion,
    isLoading: suggestionLoading,
    error: suggestionErr,
    refetch: refetchSuggestion,
  } = useQuery({
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
  const error = suggestionErr?.message ?? null;

  const isHODOfDept =
    role === Role.HOD &&
    !!currentUser?.departmentId &&
    suggestion?.departmentId === currentUser.departmentId;
  const isAssignedHOD = suggestion?.hodId === currentUser?.id;
  const isCommitteeMemberForSuggestion =
    !!suggestion?.committeeId &&
    (myCommittees ?? []).some((c) => c.id === suggestion.committeeId);

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
      ? [
          {
            value: currentUser.id,
            label: `${currentUser.firstName} ${currentUser.lastName} (You)`,
          },
        ]
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
      decisionDetails?: Record<string, string>;
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
    onError: (err: unknown) =>
      setReviewError(
        err instanceof Error ? err.message : "Could not save the review.",
      ),
  });

  const [isUploadingReview, setIsUploadingReview] = useState(false);
  const reviewInFlight = useRef(false);
  const reviewing = reviewMutation.isPending || isUploadingReview;

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
    if (!file.type.startsWith("image/")) {
      setReviewError("Only image files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setReviewError("Image must be under 10 MB.");
      return;
    }
    setKaizenPhotoFile(file);
    setKaizenPhotoPreview(URL.createObjectURL(file));
    setReviewError(null);
  };

  const removeKaizenPhoto = () => {
    if (kaizenPhotoFile && kaizenPhotoPreview)
      URL.revokeObjectURL(kaizenPhotoPreview);
    setKaizenPhotoFile(null);
    setKaizenPhotoPreview(null);
    if (kaizenFileInputRef.current) kaizenFileInputRef.current.value = "";
    if (kaizenCameraInputRef.current) kaizenCameraInputRef.current.value = "";
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newStatus ||
      !suggestion ||
      !accessToken ||
      !canReview ||
      reviewing ||
      reviewInFlight.current
    )
      return;
    setReviewError(null);

    reviewInFlight.current = true;
    setIsUploadingReview(true);
    try {
      const isDailyKaizen =
        newStatus === "APPROVED_FOR_IMPLEMENTATION" &&
        decisionType === "DAILY_KAIZEN";

      let decisionDetails: Record<string, string> | undefined;
      if (
        newStatus === "APPROVED_FOR_IMPLEMENTATION" ||
        newStatus === "SELECTED_FOR_SGA" ||
        newStatus === "ON_HOLD"
      ) {
        decisionDetails = { ...decisionFields };
        if (decisionFields.responsibleEmployeeId) {
          const match = responsibleOptions.find(
            (o) => o.value === decisionFields.responsibleEmployeeId,
          );
          if (match) decisionDetails.responsibleEmployeeName = match.label;
        }
      }

      let kaizenDetails: KaizenDetailsPayload | undefined;
      if (isDailyKaizen) {
        if (!kaizenOwnerId) {
          setReviewError(
            "A kaizen owner is required to raise a Daily Gemba Kaizen.",
          );
          return;
        }
        let beforePhotoUrl: string | undefined;
        if (kaizenPhotoFile) {
          try {
            const { fileUrl } = await uploadImage(
              kaizenPhotoFile,
              "kaizen",
              accessToken,
            );
            beforePhotoUrl = fileUrl;
          } catch (err: unknown) {
            setReviewError(
              err instanceof Error
                ? err.message
                : "Failed to upload before photo",
            );
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

      await reviewMutation.mutateAsync({
        statusChanged: newStatus,
        note: note || undefined,
        decisionType:
          newStatus === "APPROVED_FOR_IMPLEMENTATION"
            ? decisionType || undefined
            : undefined,
        decisionDetails,
        kaizenDetails,
      });
    } catch {
      // The mutation's error callback displays the error and keeps the entered form values.
    } finally {
      reviewInFlight.current = false;
      setIsUploadingReview(false);
    }
  };

  const allowedNext = suggestion ? ALLOWED_TRANSITIONS[suggestion.status] : [];

  return (
    <ProtectedRoute
      allowedRoles={[
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.MANAGEMENT,
        Role.HOD,
        Role.EMPLOYEE,
      ]}
    >
      {loading || error || !suggestion ? (
        <DetailPageTemplate
          header={{
            title: "Suggestion details",
            breadcrumbs: [
              { label: "Suggestions", href: "/sims" },
              { label: "Details" },
            ],
          }}
        >
          {loading ? (
            <LoadingState label="Loading suggestion…" />
          ) : (
            <ErrorState
              title={
                error ? "Unable to load suggestion" : "Suggestion not found"
              }
              description={error ?? undefined}
              onRetry={() => void refetchSuggestion()}
            />
          )}
        </DetailPageTemplate>
      ) : (
        <DetailPageTemplate
          header={{
            title: suggestion.title,
            breadcrumbs: [
              { label: "Suggestions", href: "/sims" },
              { label: "Details" },
            ],
          }}
          status={suggestion.status}
          statusLabel={STATUS_LABELS[suggestion.status]}
        >
          <div className="flex flex-wrap items-center gap-control">
            {suggestion.implementationStatus && (
              <StatusBadge
                status={suggestion.implementationStatus}
                label={`Progress: ${IMPLEMENTATION_STATUS_LABELS[suggestion.implementationStatus]}`}
              />
            )}
            {suggestion.linkedKaizenId && (
              <LinkedRecordChip
                href={`/kaizen/${suggestion.linkedKaizenId}`}
                label="Raised as a Kaizen:"
                title={suggestion.kaizen?.title}
                tone="kaizen"
              />
            )}
            {suggestion.linkedSgaId && (
              <LinkedRecordChip
                href={`/sga/${suggestion.linkedSgaId}`}
                label="Moved to SGA:"
                title={suggestion.sga?.title}
                tone="sga"
              />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT — Proposal + Timeline */}
            <div className="xl:col-span-2 space-y-5">
              <div className="bg-background border border-border rounded-xl p-6">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                  Detailed Proposal
                </p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {suggestion.description}
                </p>
                {suggestion.imageUrl && (
                  <div className="mt-5 rounded-xl overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <TenantImage
                      src={suggestion.imageUrl}
                      alt="Supporting image"
                      className="w-full max-h-96 object-contain bg-muted"
                    />
                  </div>
                )}

                <div className="mt-6 pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-border rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {suggestion.categories.length > 1
                        ? "Categories"
                        : "Category"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestion.categories.map((c) => {
                        const cfg = CATEGORY_CONFIG[c as SuggestionCategory];
                        return cfg ? (
                          <span
                            key={c}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}
                          >
                            {cfg.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                    {calcWeight(suggestion.categories) > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Weight:{" "}
                        <span className="font-bold text-muted-foreground">
                          {calcWeight(suggestion.categories).toFixed(1)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="border border-border rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Submitted By
                    </p>
                    {suggestion.employee &&
                    (!suggestion.isAnonymous ||
                      (!!currentUser &&
                        currentUser.id === suggestion.employeeId)) ? (
                      <p className="text-sm font-semibold text-foreground">
                        {suggestion.employee.firstName}{" "}
                        {suggestion.employee.lastName}
                      </p>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <EyeOff className="h-3.5 w-3.5" />
                        <span className="text-sm italic">Anonymous</span>
                      </div>
                    )}
                  </div>
                  <div className="border border-border rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Assigned HOD
                    </p>
                    {suggestion.hod ? (
                      <p className="text-sm font-semibold text-foreground">
                        {suggestion.hod.firstName} {suggestion.hod.lastName}
                      </p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        Pending assignment
                      </p>
                    )}
                  </div>
                  <div className="border border-border rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Submitted At
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatDateTime(suggestion.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {suggestion.status === "ON_HOLD" &&
                suggestion.decisionDetails && (
                  <div className="bg-warning-subtle border border-warning/25 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <h3 className="text-sm font-bold text-warning uppercase tracking-widest">
                        On Hold
                      </h3>
                    </div>
                    {suggestion.decisionDetails.reason && (
                      <p className="text-sm text-warning leading-relaxed whitespace-pre-wrap">
                        {suggestion.decisionDetails.reason}
                      </p>
                    )}
                    {suggestion.decisionDetails.responsibleEmployeeName && (
                      <p className="text-xs text-warning mt-3 pt-3 border-t border-warning/25">
                        Responsible:{" "}
                        <span className="font-semibold">
                          {suggestion.decisionDetails.responsibleEmployeeName}
                        </span>
                      </p>
                    )}
                  </div>
                )}

              {suggestion.status === "SELECTED_FOR_SGA" &&
                suggestion.decisionDetails?.responsibleEmployeeName && (
                  <div className="bg-accent border border-primary/25 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-bold text-primary uppercase tracking-widest">
                        Selected for SGA
                      </h3>
                    </div>
                    <p className="text-xs text-primary mt-2">
                      Responsible:{" "}
                      <span className="font-semibold">
                        {suggestion.decisionDetails.responsibleEmployeeName}
                      </span>
                    </p>
                  </div>
                )}

              {suggestion.implementationNote && (
                <div className="bg-success-subtle border border-success/25 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <h3 className="text-sm font-bold text-success uppercase tracking-widest">
                      Implementation Direction
                    </h3>
                  </div>
                  <p className="text-sm text-success leading-relaxed whitespace-pre-wrap italic">
                    “{suggestion.implementationNote}”
                  </p>
                </div>
              )}

              {suggestion.status === "IMPLEMENTED" &&
                suggestion.decisionDetails &&
                Object.keys(suggestion.decisionDetails).length > 0 && (
                  <div className="bg-success-subtle border border-success/25 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <h3 className="text-sm font-bold text-success uppercase tracking-widest">
                        Implementation Evidence
                        {suggestion.decisionType &&
                          ` — ${DECISION_TYPE_LABELS[suggestion.decisionType]}`}
                      </h3>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(suggestion.decisionDetails).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt className="text-[10px] font-semibold text-success/70 uppercase tracking-wider">
                              {humanizeKey(key)}
                            </dt>
                            <dd className="text-sm text-success mt-0.5 break-words">
                              {key === "evidence" &&
                              typeof value === "string" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <TenantImage
                                  src={value}
                                  alt="Evidence"
                                  className="mt-1 max-h-48 rounded-lg border border-success/25"
                                />
                              ) : (
                                String(value)
                              )}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </div>
                )}

              <div className="bg-background border border-border rounded-xl p-6">
                <ReviewTimeline
                  suggestion={suggestion}
                  reviews={suggestion.reviews}
                />
              </div>
            </div>

            {/* RIGHT — Actions */}
            <div className="xl:col-span-1 space-y-4">
              {/* ── Review Form (department HOD, or the committee once forwarded) ── */}
              {canReview && (
                <div className="bg-background border border-border rounded-xl p-6 sticky top-6">
                  <div className="flex items-center gap-2 mb-5">
                    <h2 className="text-sm font-bold text-foreground">
                      Add a Review
                    </h2>
                    {isAssignedHOD && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-info-subtle text-info border border-info/25">
                        <User className="h-2.5 w-2.5" /> Assigned HOD
                      </span>
                    )}
                  </div>

                  {allowedNext.length === 0 ? (
                    <div className="flex items-start gap-3 text-sm text-muted-foreground bg-muted rounded-xl p-4">
                      <Info className="h-4 w-4 mt-0.5 shrink-0" />
                      Final status reached.
                    </div>
                  ) : suggestion.status === "WAITING_FOR_REVIEW" ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        This suggestion is waiting for review. Start reviewing
                        to move it into the pipeline.
                      </p>
                      <Button
                        type="button"
                        onClick={() => {
                          setReviewError(null);
                          reviewMutation.mutate({
                            statusChanged: "UNDER_REVIEW",
                          });
                        }}
                        disabled={reviewing}
                        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      >
                        {reviewing ? "Starting..." : "Start Review"}
                      </Button>
                      {reviewError && (
                        <p
                          role="alert"
                          className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2"
                        >
                          {reviewError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <form
                      onSubmit={handleReview}
                      aria-busy={reviewing}
                      className="space-y-4"
                    >
                      <fieldset
                        disabled={reviewing}
                        className="min-w-0 space-y-4"
                      >
                        <div>
                          <Label htmlFor="review-status" className="mb-1.5">
                            Move to Status
                          </Label>
                          <NativeSelect
                            id="review-status"
                            required
                            value={newStatus}
                            onChange={(e) => {
                              setNewStatus(e.target.value as SuggestionStatus);
                              setDecisionType("");
                              setDecisionFields({});
                              resetKaizenForm();
                            }}
                            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                          >
                            <option value="">Select status...</option>
                            {allowedNext.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>

                        {newStatus === "APPROVED_FOR_IMPLEMENTATION" && (
                          <div className="space-y-4 pt-2 border-t border-border">
                            <div>
                              <Label
                                htmlFor="review-decision"
                                className="mb-1.5"
                              >
                                Decision Type
                                <span className="text-danger"> *</span>
                              </Label>
                              <NativeSelect
                                id="review-decision"
                                required
                                value={decisionType}
                                onChange={(e) => {
                                  const val = e.target.value as DecisionType;
                                  setDecisionType(val);
                                  setDecisionFields({});
                                  if (val === "DAILY_KAIZEN") {
                                    resetKaizenForm();
                                    setKaizenCondition(
                                      `${suggestion.title}\n\n${suggestion.description}`,
                                    );
                                    setKaizenPhotoPreview(
                                      suggestion.imageUrl ?? null,
                                    );
                                  }
                                }}
                                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                              >
                                <option value="">
                                  Select decision type...
                                </option>
                                {Object.entries(DECISION_TYPE_LABELS).map(
                                  ([val, label]) => (
                                    <option key={val} value={val}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </NativeSelect>
                            </div>
                            {decisionType === "WORKPLACE_CORRECTION" && (
                              <DecisionFieldsForm
                                fields={WORKPLACE_CORRECTION_FIELDS}
                                values={decisionFields}
                                onChange={updateDecisionField}
                                optionsByKey={{
                                  responsibleEmployeeId: responsibleOptions,
                                }}
                              />
                            )}
                            {decisionType === "DAILY_KAIZEN" && (
                              <div className="space-y-4">
                                <p className="text-xs text-muted-foreground -mt-1">
                                  This raises a draft Kaizen with the reason,
                                  reference and condition pre-filled from this
                                  suggestion. The kaizen owner you pick will
                                  complete the rest of the wizard themselves.
                                </p>
                                <div>
                                  <Label
                                    htmlFor="review-kaizen-owner"
                                    className="mb-1.5"
                                  >
                                    Kaizen Owner
                                    <span className="text-danger"> *</span>
                                  </Label>
                                  <NativeSelect
                                    id="review-kaizen-owner"
                                    required
                                    value={kaizenOwnerId}
                                    onChange={(e) =>
                                      setKaizenOwnerId(e.target.value)
                                    }
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                                  >
                                    <option value="">Select...</option>
                                    {responsibleOptions.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </NativeSelect>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Condition/Opportunity for Improvement
                                  </label>
                                  <Textarea
                                    rows={3}
                                    value={kaizenCondition}
                                    onChange={(e) =>
                                      setKaizenCondition(e.target.value)
                                    }
                                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Before Photo{" "}
                                    <span className="text-muted-foreground font-normal normal-case">
                                      (optional)
                                    </span>
                                  </label>
                                  {kaizenPhotoPreview ? (
                                    <div className="relative w-full rounded-xl overflow-hidden border border-border bg-muted">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <TenantImage
                                        src={kaizenPhotoPreview}
                                        alt="Before preview"
                                        className="w-full max-h-48 object-contain"
                                      />
                                      <Button
                                        type="button"
                                        onClick={removeKaizenPhoto}
                                        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-overlay/60 hover:bg-overlay/80 flex items-center justify-center text-primary-foreground transition-colors"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          kaizenFileInputRef.current?.click()
                                        }
                                        className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-4 text-xs text-muted-foreground hover:border-info hover:text-info transition-all"
                                      >
                                        <ImagePlus className="h-3.5 w-3.5" />{" "}
                                        Attach a photo
                                      </Button>
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          kaizenCameraInputRef.current?.click()
                                        }
                                        className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-4 text-xs text-muted-foreground hover:border-info hover:text-info transition-all"
                                      >
                                        <Camera className="h-3.5 w-3.5" /> Take
                                        a photo
                                      </Button>
                                    </div>
                                  )}
                                  <Input
                                    ref={kaizenFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleKaizenPhotoChange}
                                    className="hidden"
                                  />
                                  <Input
                                    ref={kaizenCameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleKaizenPhotoChange}
                                    className="hidden"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {newStatus === "SELECTED_FOR_SGA" && (
                          <div className="pt-2 border-t border-border">
                            <DecisionFieldsForm
                              fields={SGA_FIELDS}
                              values={decisionFields}
                              onChange={updateDecisionField}
                              optionsByKey={{
                                responsibleEmployeeId: responsibleOptions,
                              }}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                              A draft SGA will be raised with this person as its
                              owner. The suggestion is marked implemented once
                              that SGA is verified and closed.
                            </p>
                          </div>
                        )}

                        {newStatus === "ON_HOLD" && (
                          <div className="pt-2 border-t border-border">
                            <DecisionFieldsForm
                              fields={ON_HOLD_FIELDS}
                              values={decisionFields}
                              onChange={updateDecisionField}
                              optionsByKey={{
                                responsibleEmployeeId: responsibleOptions,
                              }}
                            />
                          </div>
                        )}

                        <div>
                          <Label htmlFor="review-notes" className="mb-1.5">
                            {newStatus === "REJECTED"
                              ? "Reason for Rejection"
                              : "Review Notes"}
                            {newStatus === "REJECTED" && (
                              <span className="text-danger"> *</span>
                            )}
                          </Label>
                          <Textarea
                            id="review-notes"
                            rows={4}
                            required={newStatus === "REJECTED"}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={
                              newStatus === "REJECTED"
                                ? "Why is this being rejected?"
                                : "Enter evaluation notes..."
                            }
                            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none"
                          />
                        </div>

                        {reviewError && (
                          <p
                            role="alert"
                            className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2"
                          >
                            {reviewError}
                          </p>
                        )}

                        <Button
                          type="submit"
                          disabled={reviewing || !newStatus}
                          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          {reviewing ? "Saving..." : "Submit Review"}
                        </Button>
                      </fieldset>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </DetailPageTemplate>
      )}
    </ProtectedRoute>
  );
}
