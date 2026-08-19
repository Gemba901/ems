"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Save, Send, XCircle } from "lucide-react";
import { Kaizen, KaizenService, KaizenStatus } from "@/services/kaizen.service";
import { EmployeeApiResponse } from "@/services/employee.service";
import { Role } from "@/types/role";
import {
  formatDate,
  formatDateTime,
  KaizenProgress,
  LockedSection,
  STATUS_BADGE,
  STATUS_LABELS,
  StatusBadge,
  SummaryPanel,
} from "@/components/kaizen/kaizen-ui";
import { getKaizenGating, getStageStates, KaizenAccessContext } from "@/components/kaizen/gating";

import ReasonSection from "./sections/01-Reason";
import ReferenceSection from "./sections/02-Reference";
import ConditionSection from "./sections/03-Condition";
import BasicInfoSection from "./sections/04-BasicInfo";
import QcdsmtImpactSection from "./sections/05-QcdsmtImpact";
import WasteSection from "./sections/06-Waste";
import ImplementationPlanSection from "./sections/07-ImplementationPlan";
import HodPreReviewSection from "./sections/08-HodPreReview";
import ImplementationSection from "./sections/09-Implementation";
import VerificationSection from "./sections/10-Verification";
import { KaizenSectionHandle } from "./sections/types";

function TimelineIcon({ status }: { status: KaizenStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "VERIFIED_CLOSED") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "REJECTED") return <XCircle className={`${cls} text-red-500`} />;
  if (status === "MOVED_TO_SGA") return <CheckCircle2 className={`${cls} text-purple-500`} />;
  if (status === "RETURNED_FOR_REVISION" || status === "RETURNED_FOR_REWORK") return <XCircle className={`${cls} text-orange-500`} />;
  return <Clock className={`${cls} text-slate-400`} />;
}

export default function KaizenForm({
  kaizen,
  me,
  role,
  token,
  onSaved,
}: {
  kaizen: Kaizen;
  me: EmployeeApiResponse;
  role: Role | undefined;
  token: string;
  onSaved: (updated: Kaizen) => void;
}) {
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const ctx: KaizenAccessContext = {
    isRaiser: kaizen.employeeId === me.id,
    isKaizenOwner: kaizen.kaizenOwnerId === me.id,
    isDeptHOD: role === Role.HOD && !!kaizen.departmentId && kaizen.departmentId === me.departmentId,
    isCommitteeMember: (me.committeeMembers?.length ?? 0) > 0,
    isFinanceHOD: role === Role.HOD && me.department?.name === "Finance",
    isPrivileged,
  };

  const gating = getKaizenGating(kaizen, ctx);
  const stageStates = getStageStates(kaizen);

  const [hodReviewError, setHodReviewError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [saveDraftError, setSaveDraftError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingHodReview, setSubmittingHodReview] = useState(false);

  const reasonRef = useRef<KaizenSectionHandle>(null);
  const referenceRef = useRef<KaizenSectionHandle>(null);
  const conditionRef = useRef<KaizenSectionHandle>(null);
  const basicInfoRef = useRef<KaizenSectionHandle>(null);
  const qcdsmtImpactRef = useRef<KaizenSectionHandle>(null);
  const wasteRef = useRef<KaizenSectionHandle>(null);
  const implementationPlanRef = useRef<KaizenSectionHandle>(null);

  const saveAllSections = async (): Promise<boolean> => {
    const refs = [reasonRef, referenceRef, conditionRef, basicInfoRef, qcdsmtImpactRef, wasteRef, implementationPlanRef];
    let allOk = true;
    for (const sectionRef of refs) {
      if (!sectionRef.current) continue;
      const ok = await sectionRef.current.save();
      if (!ok) allOk = false;
    }
    return allOk;
  };

  const handleSaveDraft = async () => {
    setSaveDraftError(null);
    setSavingDraft(true);
    try {
      const ok = await saveAllSections();
      if (!ok) setSaveDraftError("Some sections failed to save. Check the errors above and try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const submitForHodReview = useMutation({
    mutationFn: () => KaizenService.submitForHodPreReview(kaizen.id, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setHodReviewError(err instanceof Error ? err.message : "Failed to submit"),
  });

  const handleSubmitForHodReview = async () => {
    setHodReviewError(null);
    setSubmittingHodReview(true);
    try {
      const ok = await saveAllSections();
      if (!ok) {
        setHodReviewError("Some sections failed to save. Check the errors above and try again.");
        return;
      }
      await submitForHodReview.mutateAsync();
    } catch {
      // handled by the mutation's onError
    } finally {
      setSubmittingHodReview(false);
    }
  };

  const submitForVerification = useMutation({
    mutationFn: () => KaizenService.submitForVerification(kaizen.id, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setVerificationError(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-snug mb-2">{kaizen.title || kaizen.conditionDescription}</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={kaizen.status} />
            <span className="text-xs text-slate-400">
              {kaizen.employee.firstName} {kaizen.employee.lastName} · {kaizen.department?.name ?? "No department"}
            </span>
          </div>
        </div>
      </div>

      <KaizenProgress states={stageStates} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <ReasonSection ref={reasonRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <ReferenceSection ref={referenceRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <ConditionSection ref={conditionRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <BasicInfoSection ref={basicInfoRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <QcdsmtImpactSection ref={qcdsmtImpactRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <WasteSection ref={wasteRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />
          <ImplementationPlanSection ref={implementationPlanRef} kaizen={kaizen} access={gating.initialSubmission} token={token} onSaved={onSaved} />

          {gating.initialSubmission.editable && (
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              {(saveDraftError || hodReviewError) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  {saveDraftError || hodReviewError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={savingDraft || submittingHodReview}
                  onClick={handleSaveDraft}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={savingDraft || submittingHodReview}
                  onClick={handleSubmitForHodReview}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {submittingHodReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for HOD Pre-Review
                </button>
              </div>
            </div>
          )}

          {gating.hodPreReview.visible ? (
            <HodPreReviewSection kaizen={kaizen} access={gating.hodPreReview} token={token} onSaved={onSaved} />
          ) : (
            <LockedSection n={2} label="HOD Pre-Implementation Review" />
          )}

          {gating.implementation.visible ? (
            <ImplementationSection kaizen={kaizen} access={gating.implementation} token={token} onSaved={onSaved} />
          ) : (
            <LockedSection n={3} label="Implementation" />
          )}

          {gating.canSubmitForVerification && (
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              {verificationError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{verificationError}</p>
              )}
              <button
                type="button"
                disabled={submitForVerification.isPending}
                onClick={() => {
                  setVerificationError(null);
                  submitForVerification.mutate();
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {submitForVerification.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit for Verification
              </button>
            </div>
          )}

          {gating.verification.visible ? (
            <VerificationSection kaizen={kaizen} access={gating.verification} token={token} onSaved={onSaved} ctx={ctx} />
          ) : (
            <LockedSection n={4} label="Verification & Closure" />
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

        <SummaryPanel
          title="Kaizen Summary"
          rows={[
            { label: "Department", value: kaizen.department?.name ?? "No department" },
            { label: "Raised By", value: `${kaizen.employee.firstName} ${kaizen.employee.lastName}` },
            {
              label: "Kaizen Owner",
              value: kaizen.kaizenOwner ? `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}` : "Not set",
            },
            { label: "Raised Date", value: formatDate(kaizen.createdAt) },
            { label: "Status", value: <StatusBadge status={kaizen.status} /> },
          ]}
        />
      </div>
    </div>
  );
}
