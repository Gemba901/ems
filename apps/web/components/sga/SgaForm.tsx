"use client";

import { Suspense } from "react";
import { Check, CheckCircle2, ChevronDown, Clock, XCircle } from "lucide-react";
import { Sga, SgaStatus } from "@/services/sga.service";
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
import NextActionBanner from "@/components/sga/NextActionBanner";
import SgaDraftWizard from "@/components/sga/SgaDraftWizard";
import SgaWorkspace from "@/components/sga/SgaWorkspace";

import ReasonSection from "./sections/01-Reason";
import InfoSection from "./sections/02-Info";
import ImpactSection from "./sections/03-Impact";
import TeamSection from "./sections/04-Team";
import MeetingPlanSection from "./sections/05-MeetingPlan";
import ResourcesSection from "./sections/06-Resources";
import HodApprovalSection from "./sections/07-HodApproval";
import VerificationSection from "./sections/16-Verification";

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

  const approved = gating.condition.visible;
  const planSummary = [
    sga.hodDecisionBy && `Approved by ${sga.hodDecisionBy.firstName} ${sga.hodDecisionBy.lastName}`,
    sga.hodDecisionAt && formatDate(sga.hodDecisionAt),
    sga.owner && `Leader ${sga.owner.firstName} ${sga.owner.lastName}`,
    `${sga.teamMembers.length} team member${sga.teamMembers.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const planSections = (
    <>
      {gating.reason.editable ? (
        // The raiser fills the draft step by step; everyone else sees the read-only stacked view.
        <Suspense fallback={null}>
          <SgaDraftWizard sga={sga} gating={gating} token={token} onSaved={onSaved} />
        </Suspense>
      ) : (
        <>
          <ReasonSection sga={sga} access={gating.reason} token={token} onSaved={onSaved} />
          <InfoSection sga={sga} access={gating.info} token={token} onSaved={onSaved} />
          <ImpactSection sga={sga} access={gating.impact} token={token} onSaved={onSaved} />
          <TeamSection sga={sga} access={gating.team} token={token} onSaved={onSaved} />
          <MeetingPlanSection sga={sga} access={gating.meetingPlan} token={token} onSaved={onSaved} />
          <ResourcesSection sga={sga} access={gating.resources} token={token} onSaved={onSaved} />
        </>
      )}

      {gating.hodApproval.visible ? (
        <HodApprovalSection sga={sga} access={gating.hodApproval} token={token} onSaved={onSaved} />
      ) : (
        <LockedSection n={2} label="HOD Approval" />
      )}
    </>
  );

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

      {/* On phones the side column falls below the page, so the card shows here instead. */}
      <NextActionBanner sga={sga} ctx={ctx} gating={gating} className="lg:hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {approved ? (
            // Once approved the plan rarely changes, so it folds away above the workspace.
            <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">1–2. Plan &amp; HOD approval</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{planSummary}</span>
                </span>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-slate-100 bg-slate-50/60 px-3 py-4 sm:px-5">
                {planSections}
              </div>
            </details>
          ) : (
            planSections
          )}

          {gating.condition.visible ? (
            // After HOD approval the SGA runs for weeks: one stage open at a time, each section
            // saved on its own, with meetings and actions as their own quick tabs.
            <Suspense fallback={null}>
              <SgaWorkspace sga={sga} gating={gating} ctx={ctx} meId={me.id} token={token} onSaved={onSaved} />
            </Suspense>
          ) : (
            <>
              <LockedSection n={3} label="Understand &amp; Analyse" />
              <LockedSection n={4} label="Plan &amp; Implement" />
              <LockedSection n={5} label="Check Results" />
            </>
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

        <div className="space-y-5 lg:sticky lg:top-20">
          <SummaryPanel
            title="SGA Summary"
            rows={[
              { label: "Department", value: sga.mainDepartment?.name ?? "No department" },
              { label: "Raised By", value: `${sga.employee.firstName} ${sga.employee.lastName}` },
              { label: "SGA Leader", value: sga.owner ? `${sga.owner.firstName} ${sga.owner.lastName}` : "Not set" },
              { label: "Raised Date", value: formatDate(sga.createdAt) },
              { label: "Status", value: <StatusBadge status={sga.status} /> },
            ]}
          />
          <NextActionBanner sga={sga} ctx={ctx} gating={gating} className="hidden lg:block" />
        </div>
      </div>
    </div>
  );
}
