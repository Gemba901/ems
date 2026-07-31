"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, KaizenStatus } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import { uploadImage } from "@/services/uploads.service";
import { STATUS_BADGE, STATUS_LABELS, StatusBadge, formatDateTime, KaizenStepper, SectionLabel, SummaryPanel, TipCallout } from "@/components/kaizen/kaizen-ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ImagePlus,
  X,
  Loader2,
  ChevronDown,
  ArrowRightCircle,
} from "lucide-react";

const TERMINAL_STATUSES: KaizenStatus[] = ["SUBMITTED_FOR_VERIFICATION", "VERIFIED_CLOSED", "MOVED_TO_SGA"];

type Disposition = "VERIFIED_CLOSED" | "FURTHER_IMPROVEMENT_REQUIRED" | "MOVED_TO_SGA";

const STANDARD_OPTIONS: { label: string; value: boolean | undefined }[] = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "Not Required", value: undefined },
];

function TimelineIcon({ status }: { status: KaizenStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "VERIFIED_CLOSED") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "MOVED_TO_SGA") return <AlertCircle className={`${cls} text-purple-500`} />;
  if (status === "FURTHER_IMPROVEMENT_REQUIRED") return <XCircle className={`${cls} text-orange-500`} />;
  return <Clock className={`${cls} text-slate-400`} />;
}

export default function KaizenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.roleLevel;

  const { data: kaizen, isLoading, error: fetchErr } = useQuery({
    queryKey: ["kaizen-detail", id],
    queryFn: () => KaizenService.getById(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const error = fetchErr ? (fetchErr as any).message : null;

  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const isOwner = !!kaizen && !!currentUser && kaizen.employeeId === currentUser.id;
  const isDeptHOD = role === Role.HOD && !!kaizen && !!currentUser && kaizen.departmentId === currentUser.departmentId;

  const canEdit = isOwner && !!kaizen && !TERMINAL_STATUSES.includes(kaizen.status);
  const canVerify = (isDeptHOD || isPrivileged) && kaizen?.status === "SUBMITTED_FOR_VERIFICATION";

  const [showProblemSummary, setShowProblemSummary] = useState(true);

  // ── Update form state ──
  const [improvementDescription, setImprovementDescription] = useState("");
  const [benefitAchieved, setBenefitAchieved] = useState("");
  const [beforeValue, setBeforeValue] = useState("");
  const [afterValue, setAfterValue] = useState("");
  const [costSaving, setCostSaving] = useState("");
  const [comments, setComments] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [afterPhotoFile, setAfterPhotoFile] = useState<File | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const afterPhotoInputRef = useRef<HTMLInputElement>(null);

  const handleAfterPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUpdateError("Only image files are allowed."); return; }
    if (file.size > 10 * 1024 * 1024) { setUpdateError("Image must be under 10 MB."); return; }
    setAfterPhotoFile(file);
    setAfterPhotoPreview(URL.createObjectURL(file));
    setUpdateError(null);
  };

  const removeAfterPhoto = () => {
    setAfterPhotoFile(null);
    if (afterPhotoPreview) URL.revokeObjectURL(afterPhotoPreview);
    setAfterPhotoPreview(null);
    if (afterPhotoInputRef.current) afterPhotoInputRef.current.value = "";
  };

  const updateMutation = useMutation({
    mutationFn: async (submitForVerification: boolean) => {
      let afterPhotoUrl: string | undefined;
      if (afterPhotoFile) {
        setPhotoUploading(true);
        const { fileUrl } = await uploadImage(afterPhotoFile, "kaizen", accessToken!);
        afterPhotoUrl = fileUrl;
        setPhotoUploading(false);
      }
      return KaizenService.update(
        kaizen!.id,
        {
          improvementDescription: improvementDescription.trim() || undefined,
          afterPhotoUrl,
          benefitAchieved: benefitAchieved.trim() || undefined,
          beforeValue: beforeValue.trim() || undefined,
          afterValue: afterValue.trim() || undefined,
          costSaving: costSaving.trim() || undefined,
          comments: comments.trim() || undefined,
          submitForVerification,
        },
        accessToken!,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kaizen-detail", id] });
      setImprovementDescription("");
      setBenefitAchieved("");
      setBeforeValue("");
      setAfterValue("");
      setCostSaving("");
      setComments("");
      removeAfterPhoto();
    },
    onError: (err: any) => {
      setPhotoUploading(false);
      setUpdateError(err.message);
    },
  });

  const saving = updateMutation.isPending;

  const handleSaveDraft = () => {
    setUpdateError(null);
    updateMutation.mutate(false);
  };

  const handleSubmitForVerification = () => {
    setUpdateError(null);
    updateMutation.mutate(true);
  };

  // ── Verify form state ──
  const [verificationComment, setVerificationComment] = useState("");
  const [standardUpdated, setStandardUpdated] = useState<boolean | undefined>(undefined);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (disposition: Disposition) =>
      KaizenService.verify(
        kaizen!.id,
        {
          disposition,
          verificationComment: verificationComment.trim() || undefined,
          standardUpdated: disposition === "VERIFIED_CLOSED" ? standardUpdated : undefined,
        },
        accessToken!,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kaizen-detail", id] });
      setVerificationComment("");
      setStandardUpdated(undefined);
    },
    onError: (err: any) => setVerifyError(err.message),
  });

  const verifying = verifyMutation.isPending;

  const handleVerify = (disposition: Disposition) => {
    setVerifyError(null);
    verifyMutation.mutate(disposition);
  };

  const showImprovementResults = !canEdit && (kaizen?.improvementDescription || kaizen?.afterPhotoUrl);

  const isClosed = kaizen?.status === "VERIFIED_CLOSED" || kaizen?.status === "MOVED_TO_SGA";
  const currentStep: 1 | 2 | 3 = kaizen?.status === "SUBMITTED_FOR_VERIFICATION" || isClosed ? 3 : 2;
  const stepName = currentStep === 3 ? "Verify & Close" : "Update Improvement";

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto">

        <Link href="/kaizen" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Kaizens
        </Link>

        {isLoading && <p className="text-sm text-slate-400">Loading...</p>}
        {!isLoading && error && (
          <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg border border-red-100">{error}</p>
        )}

        {!isLoading && !error && kaizen && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                  Step {currentStep} of 3 · {stepName}
                </p>
                <h1 className="text-xl font-bold text-slate-900 leading-snug mb-2">{kaizen.problem}</h1>
                <div className="flex flex-wrap gap-2 items-center">
                  <StatusBadge status={kaizen.status} />
                  <span className="text-xs text-slate-400">
                    {kaizen.employee.firstName} {kaizen.employee.lastName} · {kaizen.department?.name ?? "No department"}
                  </span>
                </div>
              </div>
            </div>

            <KaizenStepper current={currentStep} closed={isClosed} />

            {/* Problem Summary */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProblemSummary((v) => !v)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Problem Summary</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showProblemSummary ? "rotate-180" : ""}`} />
              </button>
              {showProblemSummary && (
                <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {kaizen.beforePhotoUrl && (
                    <div className="rounded-lg overflow-hidden border border-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={kaizen.beforePhotoUrl} alt="Before" className="w-full max-h-64 object-contain bg-slate-50" />
                    </div>
                  )}
                  <div className="space-y-3">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{kaizen.problem}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {kaizen.teamMembers && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Team Members</p>
                          <p className="text-sm text-slate-700">{kaizen.teamMembers}</p>
                        </div>
                      )}
                      {kaizen.benefitCategory && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Benefit Category</p>
                          <p className="text-sm text-slate-700">{kaizen.benefitCategory}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Raised At</p>
                        <p className="text-sm text-slate-700">{formatDateTime(kaizen.createdAt)}</p>
                      </div>
                      {kaizen.comments && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Comments</p>
                          <p className="text-sm text-slate-700">{kaizen.comments}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Update Improvement mode */}
            {canEdit && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
                  <SectionLabel n={1}>What Was Improved</SectionLabel>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        What improvement was made?
                      </label>
                      <textarea
                        rows={3}
                        value={improvementDescription}
                        onChange={(e) => setImprovementDescription(e.target.value)}
                        placeholder="Describe what was done..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        What benefit was achieved?
                      </label>
                      <input
                        type="text"
                        value={benefitAchieved}
                        onChange={(e) => setBenefitAchieved(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Before Value</label>
                        <input
                          type="text"
                          value={beforeValue}
                          onChange={(e) => setBeforeValue(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">After Value</label>
                        <input
                          type="text"
                          value={afterValue}
                          onChange={(e) => setAfterValue(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cost Saving</label>
                        <input
                          type="text"
                          value={costSaving}
                          onChange={(e) => setCostSaving(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Comments</label>
                      <textarea
                        rows={2}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                      />
                    </div>
                  </div>

                  <div className="mt-6">
                    <SectionLabel n={2}>After Photo</SectionLabel>
                    <div className="space-y-3">
                      {afterPhotoPreview ? (
                        <div className="relative w-full max-w-sm rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={afterPhotoPreview} alt="After preview" className="w-full max-h-48 object-contain" />
                          <button
                            type="button"
                            onClick={removeAfterPhoto}
                            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => afterPhotoInputRef.current?.click()}
                          className="w-full max-w-sm flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-6 text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all"
                        >
                          <ImagePlus className="h-4 w-4" /> Attach after photo
                        </button>
                      )}
                      <input ref={afterPhotoInputRef} type="file" accept="image/*" onChange={handleAfterPhotoChange} className="hidden" />

                      <TipCallout>
                        Tip: take the after photo from the same angle as the before photo to make the improvement clear at a glance.
                      </TipCallout>
                    </div>
                  </div>

                  {updateError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">{updateError}</p>
                  )}

                  <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={saving}
                      className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {saving && updateMutation.variables === false ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Progress
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitForVerification}
                      disabled={saving}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {saving && updateMutation.variables === true ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Send for Verification
                    </button>
                  </div>
                </div>

                <SummaryPanel
                  title="Kaizen Snapshot"
                  rows={[
                    { label: "Problem", value: kaizen.problem.length > 40 ? `${kaizen.problem.slice(0, 40)}...` : kaizen.problem },
                    { label: "Department", value: kaizen.department?.name ?? "No department" },
                    { label: "Raised By", value: `${kaizen.employee.firstName} ${kaizen.employee.lastName}` },
                    { label: "Raised Date", value: formatDateTime(kaizen.createdAt) },
                    { label: "Status", value: <StatusBadge status={kaizen.status} /> },
                  ]}
                />
              </div>
            )}

            {/* Verify & Close mode */}
            {canVerify && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
                  <SectionLabel n={1}>Improvement Comparison</SectionLabel>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Condition Before</p>
                        {kaizen.beforePhotoUrl && (
                          <div className="rounded-lg overflow-hidden border border-slate-100 mb-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={kaizen.beforePhotoUrl} alt="Before" className="w-full max-h-48 object-contain bg-slate-50" />
                          </div>
                        )}
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{kaizen.problem}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Condition After</p>
                        {kaizen.afterPhotoUrl && (
                          <div className="rounded-lg overflow-hidden border border-slate-100 mb-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={kaizen.afterPhotoUrl} alt="After" className="w-full max-h-48 object-contain bg-slate-50" />
                          </div>
                        )}
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {kaizen.improvementDescription || "No description provided."}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {kaizen.beforeValue && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Before Value</p>
                          <p className="text-sm text-slate-700">{kaizen.beforeValue}</p>
                        </div>
                      )}
                      {kaizen.afterValue && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">After Value</p>
                          <p className="text-sm text-slate-700">{kaizen.afterValue}</p>
                        </div>
                      )}
                      {kaizen.costSaving && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Cost Saving</p>
                          <p className="text-sm text-slate-700">{kaizen.costSaving}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6">
                    <SectionLabel n={2}>Benefit Achieved</SectionLabel>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Total Benefit Achieved</p>
                        <p className="text-sm text-emerald-800 mt-0.5">
                          {kaizen.benefitAchieved || "Not specified"}
                          {kaizen.costSaving && ` · Cost Saving: ${kaizen.costSaving}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <SectionLabel n={3}>Verification &amp; Closure</SectionLabel>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Comment
                        </label>
                        <textarea
                          rows={3}
                          value={verificationComment}
                          onChange={(e) => setVerificationComment(e.target.value)}
                          placeholder="Verification notes..."
                          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Standard Updated?
                        </label>
                        <div className="flex gap-1.5 max-w-sm">
                          {STANDARD_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => setStandardUpdated(opt.value)}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                standardUpdated === opt.value
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {verifyError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{verifyError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-6 pt-5 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => handleVerify("VERIFIED_CLOSED")}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Verified &amp; Closed
                    </button>
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => handleVerify("FURTHER_IMPROVEMENT_REQUIRED")}
                      className="flex items-center gap-2 border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Further Improvement Required
                    </button>
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => handleVerify("MOVED_TO_SGA")}
                      className="flex items-center gap-2 border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      Move to SGA
                    </button>
                  </div>
                </div>

                <SummaryPanel
                  title="Closure Summary"
                  rows={[
                    { label: "Problem", value: kaizen.problem.length > 40 ? `${kaizen.problem.slice(0, 40)}...` : kaizen.problem },
                    { label: "Department", value: kaizen.department?.name ?? "No department" },
                    { label: "Submitted By", value: `${kaizen.employee.firstName} ${kaizen.employee.lastName}` },
                    { label: "Submission Date", value: formatDateTime(kaizen.updatedAt) },
                    { label: "Status", value: <StatusBadge status={kaizen.status} /> },
                  ]}
                >
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Total Benefit</p>
                    <p className="text-sm font-semibold text-emerald-800">
                      {kaizen.benefitAchieved || "Not specified"}
                    </p>
                  </div>
                </SummaryPanel>
              </div>
            )}

            {/* Read-only results */}
            {showImprovementResults && (
              <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Improvement</p>
                {kaizen.afterPhotoUrl && (
                  <div className="rounded-lg overflow-hidden border border-slate-100 mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={kaizen.afterPhotoUrl} alt="After" className="w-full max-h-80 object-contain bg-slate-50" />
                  </div>
                )}
                {kaizen.improvementDescription && (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{kaizen.improvementDescription}</p>
                )}
                <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {kaizen.beforeValue && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Before Value</p>
                      <p className="text-sm text-slate-700">{kaizen.beforeValue}</p>
                    </div>
                  )}
                  {kaizen.afterValue && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">After Value</p>
                      <p className="text-sm text-slate-700">{kaizen.afterValue}</p>
                    </div>
                  )}
                  {kaizen.costSaving && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Cost Saving</p>
                      <p className="text-sm text-slate-700">{kaizen.costSaving}</p>
                    </div>
                  )}
                </div>
                {kaizen.benefitAchieved && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Benefit Achieved</p>
                    <p className="text-sm text-slate-700">{kaizen.benefitAchieved}</p>
                  </div>
                )}
              </div>
            )}

            {kaizen.status === "VERIFIED_CLOSED" && kaizen.verifiedBy && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest">Verified & Closed</h3>
                </div>
                <p className="text-sm text-emerald-800">
                  Verified by {kaizen.verifiedBy.firstName} {kaizen.verifiedBy.lastName}
                  {kaizen.standardUpdated && " · Standard updated"}
                </p>
                {kaizen.verificationComment && (
                  <p className="text-sm text-emerald-700 italic mt-2">"{kaizen.verificationComment}"</p>
                )}
              </div>
            )}

            {!canEdit && !canVerify && !showImprovementResults && kaizen.status !== "VERIFIED_CLOSED" && (
              <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm text-sm text-slate-400">
                No actions available for this kaizen right now.
              </div>
            )}

            {/* Review History */}
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Review History</h3>
              <ol className="relative border-l border-slate-200 space-y-5 pl-6">
                <li className="relative">
                  <div className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Raised</span>
                      <span className="text-xs text-slate-400">{formatDateTime(kaizen.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      By: <span className="font-medium text-slate-600">{kaizen.employee.firstName} {kaizen.employee.lastName}</span>
                    </p>
                  </div>
                </li>

                {kaizen.reviews.map((r) => (
                  <li key={r.id} className="relative">
                    <div className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200">
                      <TimelineIcon status={r.statusChanged} />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
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
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
