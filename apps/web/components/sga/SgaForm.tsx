"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Save, Send, XCircle } from "lucide-react";
import { Sga, SgaService, SgaStatus } from "@/services/sga.service";
import { EmployeeApiResponse } from "@/services/employee.service";
import { Role } from "@/types/role";
import {
  formatDate,
  formatDateTime,
  LockedSection,
  SgaProgress,
  STATUS_BADGE,
  STATUS_LABELS,
  StatusBadge,
  SummaryPanel,
} from "@/components/sga/sga-ui";
import { getSgaGating, getStageStates, SgaAccessContext } from "@/components/sga/gating";

import ReasonSection from "./sections/01-Reason";
import InfoSection from "./sections/02-Info";
import ImpactSection from "./sections/03-Impact";
import TeamSection from "./sections/04-Team";
import MeetingPlanSection from "./sections/05-MeetingPlan";
import ResourcesSection from "./sections/06-Resources";
import HodApprovalSection from "./sections/07-HodApproval";
import ConditionSection from "./sections/08-Condition";
import RootCauseSection from "./sections/09-RootCause";
import MeetingReportsSection from "./sections/10-MeetingReports";
import ActionPlanSection from "./sections/11-ActionPlan";
import ImplementationSection from "./sections/12-Implementation";
import ResultsSection from "./sections/13-Results";
import BenefitsSection from "./sections/14-Benefits";
import VerifyingDepartmentSection from "./sections/15-VerifyingDepartment";
import VerificationSection from "./sections/16-Verification";
import { SgaSectionHandle } from "./sections/types";

function TimelineIcon({ status }: { status: SgaStatus }) {
  const cls = "h-3.5 w-3.5";
  if (status === "VERIFIED_CLOSED") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (status === "REJECTED") return <XCircle className={`${cls} text-red-500`} />;
  if (status === "RETURNED_FOR_REVISION" || status === "RETURNED_FOR_REWORK") return <XCircle className={`${cls} text-orange-500`} />;
  return <Clock className={`${cls} text-slate-400`} />;
}

export default function SgaForm({
  sga,
  me,
  role,
  token,
  onSaved,
}: {
  sga: Sga;
  me: EmployeeApiResponse;
  role: Role | undefined;
  token: string;
  onSaved: (updated: Sga) => void;
}) {
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const ctx: SgaAccessContext = {
    isRaiser: sga.employeeId === me.id,
    isOwner: sga.ownerId === me.id,
    isTeamMember: sga.teamMembers.some((m) => m.id === me.id),
    isMainDeptHod: role === Role.HOD && !!sga.mainDepartmentId && sga.mainDepartmentId === me.departmentId,
    isVerifyingDeptHod: role === Role.HOD && !!sga.verifyingDepartmentId && sga.verifyingDepartmentId === me.departmentId,
    isDepartmentRep: sga.departmentRepId === me.id,
    isCommitteeMember: (me.committeeMembers?.length ?? 0) > 0,
    isFinanceHod: role === Role.HOD && me.department?.name === "Finance",
    isPrivileged,
  };

  const gating = getSgaGating(sga, ctx);
  const stageStates = getStageStates(sga);

  const [saveDraftError, setSaveDraftError] = useState<string | null>(null);
  const [hodApprovalSubmitError, setHodApprovalSubmitError] = useState<string | null>(null);
  const [saveProgressError, setSaveProgressError] = useState<string | null>(null);
  const [verificationSubmitError, setVerificationSubmitError] = useState<string | null>(null);
  const [pendingDepartmentIds, setPendingDepartmentIds] = useState<{ main: string; other: string[] }>({
    main: sga.mainDepartmentId ?? "",
    other: sga.otherDepartments.map((d) => d.id),
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingForHodApproval, setSubmittingForHodApproval] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [submittingForVerification, setSubmittingForVerification] = useState(false);

  const reasonRef = useRef<SgaSectionHandle>(null);
  const infoRef = useRef<SgaSectionHandle>(null);
  const impactRef = useRef<SgaSectionHandle>(null);
  const teamRef = useRef<SgaSectionHandle>(null);
  const meetingPlanRef = useRef<SgaSectionHandle>(null);
  const resourcesRef = useRef<SgaSectionHandle>(null);
  const conditionRef = useRef<SgaSectionHandle>(null);
  const rootCauseRef = useRef<SgaSectionHandle>(null);
  const meetingReportsRef = useRef<SgaSectionHandle>(null);
  const actionPlanRef = useRef<SgaSectionHandle>(null);
  const implementationRef = useRef<SgaSectionHandle>(null);
  const resultsRef = useRef<SgaSectionHandle>(null);
  const benefitsRef = useRef<SgaSectionHandle>(null);
  const verifyingDepartmentRef = useRef<SgaSectionHandle>(null);

  const draftRefs = [reasonRef, infoRef, impactRef, teamRef, meetingPlanRef, resourcesRef];
  const teamPhaseRefs = [
    meetingReportsRef,
    conditionRef,
    rootCauseRef,
    actionPlanRef,
    implementationRef,
    resultsRef,
    benefitsRef,
    verifyingDepartmentRef,
  ];

  const saveSections = async (refs: typeof draftRefs): Promise<boolean> => {
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
      const ok = await saveSections(draftRefs);
      if (!ok) setSaveDraftError("Some sections failed to save. Check the errors above and try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const submitForHodApproval = useMutation({
    mutationFn: () => SgaService.submitForHodApproval(sga.id, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setHodApprovalSubmitError(err instanceof Error ? err.message : "Failed to submit"),
  });

  const handleSubmitForHodApproval = async () => {
    setHodApprovalSubmitError(null);
    setSubmittingForHodApproval(true);
    try {
      const ok = await saveSections(draftRefs);
      if (!ok) {
        setHodApprovalSubmitError("Some sections failed to save. Check the errors above and try again.");
        return;
      }
      await submitForHodApproval.mutateAsync();
    } catch {
      // handled by the mutation's onError
    } finally {
      setSubmittingForHodApproval(false);
    }
  };

  const handleSaveProgress = async () => {
    setSaveProgressError(null);
    setSavingProgress(true);
    try {
      const ok = await saveSections(teamPhaseRefs);
      if (!ok) setSaveProgressError("Some sections failed to save. Check the errors above and try again.");
    } finally {
      setSavingProgress(false);
    }
  };

  const submitForVerification = useMutation({
    mutationFn: () => SgaService.submitForVerification(sga.id, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setVerificationSubmitError(err instanceof Error ? err.message : "Failed to submit"),
  });

  const handleSubmitForVerification = async () => {
    setVerificationSubmitError(null);
    setSubmittingForVerification(true);
    try {
      const ok = await saveSections(teamPhaseRefs);
      if (!ok) {
        setVerificationSubmitError("Some sections failed to save. Check the errors above and try again.");
        return;
      }
      await submitForVerification.mutateAsync();
    } catch {
      // handled by the mutation's onError
    } finally {
      setSubmittingForVerification(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-snug mb-2">
            {sga.title || sga.problemDescription || "Untitled SGA"}
          </h1>
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={sga.status} />
            <span className="text-xs text-slate-400">
              {sga.employee.firstName} {sga.employee.lastName} · {sga.mainDepartment?.name ?? "No department"}
            </span>
          </div>
        </div>
      </div>

      <SgaProgress states={stageStates} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <ReasonSection ref={reasonRef} sga={sga} access={gating.reason} token={token} onSaved={onSaved} />
          <InfoSection
            ref={infoRef}
            sga={sga}
            access={gating.info}
            token={token}
            onSaved={onSaved}
            onDepartmentSelectionChange={(main, other) => setPendingDepartmentIds({ main, other })}
          />
          <ImpactSection ref={impactRef} sga={sga} access={gating.impact} token={token} onSaved={onSaved} />
          <TeamSection
            ref={teamRef}
            sga={sga}
            access={gating.team}
            token={token}
            onSaved={onSaved}
            pendingDepartmentIds={pendingDepartmentIds}
          />
          <MeetingPlanSection ref={meetingPlanRef} sga={sga} access={gating.meetingPlan} token={token} onSaved={onSaved} />
          <ResourcesSection ref={resourcesRef} sga={sga} access={gating.resources} token={token} onSaved={onSaved} />

          {gating.reason.editable && (
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              {(saveDraftError || hodApprovalSubmitError) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  {saveDraftError || hodApprovalSubmitError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={savingDraft || submittingForHodApproval}
                  onClick={handleSaveDraft}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={savingDraft || submittingForHodApproval}
                  onClick={handleSubmitForHodApproval}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {submittingForHodApproval ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for HOD Approval
                </button>
              </div>
            </div>
          )}

          {gating.hodApproval.visible ? (
            <HodApprovalSection sga={sga} access={gating.hodApproval} token={token} onSaved={onSaved} />
          ) : (
            <LockedSection n={2} label="HOD Approval" />
          )}

          {gating.condition.visible ? (
            <>
              <MeetingReportsSection ref={meetingReportsRef} sga={sga} access={gating.meetingReports} token={token} onSaved={onSaved} />
              <ConditionSection ref={conditionRef} sga={sga} access={gating.condition} token={token} onSaved={onSaved} />
              <RootCauseSection ref={rootCauseRef} sga={sga} access={gating.rootCause} token={token} onSaved={onSaved} />
            </>
          ) : (
            <LockedSection n={3} label="Understand the Current Condition" />
          )}

          {gating.actionPlan.visible ? (
            <ActionPlanSection ref={actionPlanRef} sga={sga} access={gating.actionPlan} token={token} onSaved={onSaved} />
          ) : (
            <LockedSection n={4} label="Plan &amp; Implement" />
          )}
          {gating.implementation.visible && (
            <ImplementationSection ref={implementationRef} sga={sga} access={gating.implementation} token={token} onSaved={onSaved} />
          )}

          {gating.results.visible ? (
            <ResultsSection ref={resultsRef} sga={sga} access={gating.results} token={token} onSaved={onSaved} />
          ) : (
            <LockedSection n={5} label="Check Results" />
          )}
          {gating.benefits.visible && (
            <BenefitsSection ref={benefitsRef} sga={sga} access={gating.benefits} token={token} onSaved={onSaved} />
          )}

          {(gating.condition.editable ||
            gating.rootCause.editable ||
            gating.actionPlan.editable ||
            gating.implementation.editable ||
            gating.results.editable ||
            gating.benefits.editable ||
            gating.verifyingDepartment.editable) && (
            <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
              {(saveProgressError || verificationSubmitError) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  {saveProgressError || verificationSubmitError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={savingProgress || submittingForVerification}
                  onClick={handleSaveProgress}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {savingProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Progress
                </button>
                {gating.canSubmitForVerification && (
                  <button
                    type="button"
                    disabled={savingProgress || submittingForVerification}
                    onClick={handleSubmitForVerification}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {submittingForVerification ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit for Verification
                  </button>
                )}
              </div>
            </div>
          )}

          {gating.verifyingDepartment.visible && (
            <VerifyingDepartmentSection ref={verifyingDepartmentRef} sga={sga} access={gating.verifyingDepartment} token={token} onSaved={onSaved} />
          )}

          {gating.verification.visible ? (
            <VerificationSection sga={sga} access={gating.verification} token={token} onSaved={onSaved} ctx={ctx} />
          ) : (
            <LockedSection n={6} label="Verify &amp; Close" />
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
                    <span className="text-xs text-slate-400">{formatDateTime(sga.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    By: <span className="font-medium text-slate-600">{sga.employee.firstName} {sga.employee.lastName}</span>
                  </p>
                </div>
              </li>

              {sga.reviews.map((r) => (
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
          title="SGA Summary"
          rows={[
            { label: "Department", value: sga.mainDepartment?.name ?? "No department" },
            { label: "Raised By", value: `${sga.employee.firstName} ${sga.employee.lastName}` },
            { label: "SGA Owner", value: sga.owner ? `${sga.owner.firstName} ${sga.owner.lastName}` : "Not set" },
            { label: "Raised Date", value: formatDate(sga.createdAt) },
            { label: "Status", value: <StatusBadge status={sga.status} /> },
          ]}
        />
      </div>
    </div>
  );
}
