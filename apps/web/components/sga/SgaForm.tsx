"use client";

import { Suspense } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Sga } from "@/services/sga.service";
import { EmployeeApiResponse } from "@/services/employee.service";
import { Role } from "@/types/role";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { SectionCard } from "@/components/patterns/SectionCard";
import { Timeline } from "@/components/patterns/Timeline";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
import StandardiseLinks from "@/components/patterns/StandardiseLinks";
import {
  formatDate,
  formatDateTime,
  LockedSection,
  SgaProgress,
  STATUS_LABELS,
} from "@/components/sga/sga-ui";
import {
  getSgaGating,
  getStageStates,
  SgaAccessContext,
} from "@/components/sga/gating";
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
  const isPrivileged =
    role === Role.SUPER_ADMIN ||
    role === Role.ADMIN ||
    role === Role.MANAGEMENT;
  const ctx: SgaAccessContext = {
    isRaiser: sga.employeeId === me.id,
    isOwner: sga.ownerId === me.id,
    isTeamMember: sga.teamMembers.some((m) => m.id === me.id),
    isMainDeptHod:
      role === Role.HOD &&
      !!sga.mainDepartmentId &&
      sga.mainDepartmentId === me.departmentId,
    isVerifyingDeptHod:
      role === Role.HOD &&
      !!sga.verifyingDepartmentId &&
      sga.verifyingDepartmentId === me.departmentId,
    isDepartmentRep: sga.departmentRepId === me.id,
    isCommitteeMember: (me.committeeMembers?.length ?? 0) > 0,
    isFinanceHod: role === Role.HOD && me.department?.name === "Finance",
    isPrivileged,
  };

  const gating = getSgaGating(sga, ctx);
  const stageStates = getStageStates(sga);

  const approved = gating.condition.visible;
  const planSummary = [
    sga.hodDecisionBy &&
      `Approved by ${sga.hodDecisionBy.firstName} ${sga.hodDecisionBy.lastName}`,
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
          <SgaDraftWizard
            sga={sga}
            gating={gating}
            token={token}
            onSaved={onSaved}
          />
        </Suspense>
      ) : (
        <>
          <ReasonSection
            sga={sga}
            access={gating.reason}
            token={token}
            onSaved={onSaved}
          />
          <InfoSection
            sga={sga}
            access={gating.info}
            token={token}
            onSaved={onSaved}
          />
          <ImpactSection
            sga={sga}
            access={gating.impact}
            token={token}
            onSaved={onSaved}
          />
          <TeamSection
            sga={sga}
            access={gating.team}
            token={token}
            onSaved={onSaved}
          />
          <MeetingPlanSection
            sga={sga}
            access={gating.meetingPlan}
            token={token}
            onSaved={onSaved}
          />
          <ResourcesSection
            sga={sga}
            access={gating.resources}
            token={token}
            onSaved={onSaved}
          />
        </>
      )}

      {gating.hodApproval.visible ? (
        <HodApprovalSection
          sga={sga}
          access={gating.hodApproval}
          token={token}
          onSaved={onSaved}
        />
      ) : (
        <LockedSection n={2} label="HOD Approval" />
      )}
    </>
  );

  return (
    <DetailPageTemplate
      header={{
        title: sga.title || sga.problemDescription || "Untitled SGA",
        breadcrumbs: [{ label: "SGAs", href: "/sga" }, { label: "Details" }],
        description: `${sga.employee.firstName} ${sga.employee.lastName} · ${sga.mainDepartment?.name ?? "No department"}`,
      }}
      status={sga.status}
      statusLabel={STATUS_LABELS[sga.status]}
      details={[
        {
          label: "Department",
          value: sga.mainDepartment?.name ?? "No department",
        },
        {
          label: "Raised by",
          value: `${sga.employee.firstName} ${sga.employee.lastName}`,
        },
        {
          label: "SGA leader",
          value: sga.owner
            ? `${sga.owner.firstName} ${sga.owner.lastName}`
            : "Not set",
        },
        { label: "Raised date", value: formatDate(sga.createdAt) },
      ]}
      sidebar={
        <NextActionBanner
          sga={sga}
          ctx={ctx}
          gating={gating}
          className="hidden lg:block"
        />
      }
    >
      <div className="flex flex-wrap items-center gap-control">
        {sga.sourceSuggestion && (
          <LinkedRecordChip
            href={`/sims/${sga.sourceSuggestion.id}`}
            label="From suggestion:"
            title={sga.sourceSuggestion.title}
            tone="suggestion"
          />
        )}
        {sga.sourceKaizen && (
          <LinkedRecordChip
            href={`/kaizen/${sga.sourceKaizen.id}`}
            label="From Kaizen:"
            title={sga.sourceKaizen.title}
            tone="kaizen"
          />
        )}
        {sga.sourceAlert && (
          <LinkedRecordChip
            href={`/dwms/alerts/${sga.sourceAlert.id}`}
            label={
              sga.sourceAlert.isAbnormality
                ? "From abnormality:"
                : "From alert:"
            }
            title={sga.sourceAlert.title}
            tone="alert"
          />
        )}
        {sga.sourceFiveSAction && (
          <LinkedRecordChip
            href={`/five-s/actions/${sga.sourceFiveSAction.id}`}
            label="From repeat 5S finding:"
            title={sga.sourceFiveSAction.reference}
            tone="fiveS"
          />
        )}
        <StandardiseLinks
          kind="sga"
          id={sga.id}
          status={sga.status}
          standards={sga.fiveSStandards}
        />
      </div>

      <SgaProgress states={stageStates} />

      {/* On phones the side column falls below the page, so the card shows here instead. */}
      <NextActionBanner
        sga={sga}
        ctx={ctx}
        gating={gating}
        className="lg:hidden"
      />

      {approved ? (
        // Once approved the plan rarely changes, so it folds away above the workspace.
        <details className="group overflow-hidden rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 hover:bg-muted sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                1–2. Plan &amp; HOD approval
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {planSummary}
              </span>
            </span>
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t border-border bg-muted/60 px-3 py-4 sm:px-5">
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
          <SgaWorkspace
            sga={sga}
            gating={gating}
            ctx={ctx}
            meId={me.id}
            token={token}
            onSaved={onSaved}
          />
        </Suspense>
      ) : (
        <>
          <LockedSection n={3} label="Understand &amp; Analyse" />
          <LockedSection n={4} label="Plan &amp; Implement" />
          <LockedSection n={5} label="Check Results" />
        </>
      )}

      {gating.verification.visible ? (
        <VerificationSection
          sga={sga}
          access={gating.verification}
          token={token}
          onSaved={onSaved}
          ctx={ctx}
        />
      ) : (
        <LockedSection n={6} label="Verify &amp; Close" />
      )}

      <SectionCard title="Review history">
        <Timeline
          label="SGA review history"
          items={[
            {
              id: "raised",
              title: "Raised",
              actor: `${sga.employee.firstName} ${sga.employee.lastName}`,
              dateTime: sga.createdAt,
              timeLabel: formatDateTime(sga.createdAt),
            },
            ...sga.reviews.map((review) => ({
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
      </SectionCard>
    </DetailPageTemplate>
  );
}
