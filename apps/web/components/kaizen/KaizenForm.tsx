"use client";

import { Suspense, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { Kaizen, KaizenService } from "@/services/kaizen.service";
import { EmployeeApiResponse } from "@/services/employee.service";
import { Role } from "@/types/role";
import {
  formatDate,
  formatDateTime,
  KaizenProgress,
  LockedSection,
  STATUS_LABELS,
} from "@/components/kaizen/kaizen-ui";
import {
  getKaizenGating,
  getStageStates,
  KaizenAccessContext,
} from "@/components/kaizen/gating";
import KaizenDraftWizard from "@/components/kaizen/KaizenDraftWizard";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { SectionCard } from "@/components/patterns/SectionCard";
import { Timeline } from "@/components/patterns/Timeline";
import { Button } from "@/components/ui/button";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
import StandardiseLinks from "@/components/patterns/StandardiseLinks";
import NextActionBanner from "@/components/kaizen/NextActionBanner";

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
  const isPrivileged =
    role === Role.SUPER_ADMIN ||
    role === Role.ADMIN ||
    role === Role.MANAGEMENT;
  const ctx: KaizenAccessContext = {
    isRaiser: kaizen.employeeId === me.id,
    isKaizenOwner: kaizen.kaizenOwnerId === me.id,
    isDeptHOD:
      role === Role.HOD &&
      !!kaizen.departmentId &&
      kaizen.departmentId === me.departmentId,
    isCommitteeMember: (me.committeeMembers?.length ?? 0) > 0,
    isFinanceHOD: role === Role.HOD && me.department?.name === "Finance",
    isPrivileged,
  };

  const gating = getKaizenGating(kaizen, ctx);
  const stageStates = getStageStates(kaizen);

  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [submittingVerification, setSubmittingVerification] = useState(false);

  const implementationRef = useRef<KaizenSectionHandle>(null);

  const submitForVerification = useMutation({
    mutationFn: () => KaizenService.submitForVerification(kaizen.id, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) =>
      setVerificationError(
        err instanceof Error ? err.message : "Failed to submit",
      ),
  });

  const handleSubmitForVerification = async () => {
    setVerificationError(null);
    setSubmittingVerification(true);
    try {
      const ok = await implementationRef.current?.save();
      if (ok === false) {
        setVerificationError(
          "Please fix the errors in the Implementation section before submitting.",
        );
        return;
      }
      await submitForVerification.mutateAsync();
    } catch {
      // handled by the mutation's onError
    } finally {
      setSubmittingVerification(false);
    }
  };

  return (
    <DetailPageTemplate
      header={{
        title: kaizen.title || kaizen.conditionDescription || "Untitled kaizen",
        breadcrumbs: [
          { label: "Kaizens", href: "/kaizen" },
          { label: "Details" },
        ],
        description: `${kaizen.employee.firstName} ${kaizen.employee.lastName} · ${kaizen.department?.name ?? "No department"}`,
      }}
      status={kaizen.status}
      statusLabel={STATUS_LABELS[kaizen.status]}
      details={[
        {
          label: "Department",
          value: kaizen.department?.name ?? "No department",
        },
        {
          label: "Raised by",
          value: `${kaizen.employee.firstName} ${kaizen.employee.lastName}`,
        },
        {
          label: "Kaizen owner",
          value: kaizen.kaizenOwner
            ? `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}`
            : "Not set",
        },
        { label: "Raised date", value: formatDate(kaizen.createdAt) },
      ]}
      sidebar={
        <NextActionBanner
          kaizen={kaizen}
          ctx={ctx}
          gating={gating}
          className="hidden lg:block"
        />
      }
    >
      <div className="flex flex-wrap items-center gap-control">
        {kaizen.sourceSuggestion && (
          <LinkedRecordChip
            href={`/sims/${kaizen.sourceSuggestion.id}`}
            label="From suggestion:"
            title={kaizen.sourceSuggestion.title}
            tone="suggestion"
          />
        )}
        {kaizen.sourceFiveSAction && (
          <LinkedRecordChip
            href={`/five-s/actions/${kaizen.sourceFiveSAction.id}`}
            label="From 5S action:"
            title={kaizen.sourceFiveSAction.reference}
            tone="fiveS"
          />
        )}
        {kaizen.sourceAlert && (
          <LinkedRecordChip
            href={`/dwms/alerts/${kaizen.sourceAlert.id}`}
            label={
              kaizen.sourceAlert.isAbnormality
                ? "From abnormality:"
                : "From alert:"
            }
            title={kaizen.sourceAlert.title}
            tone="alert"
          />
        )}
        {kaizen.linkedSga && (
          <LinkedRecordChip
            href={`/sga/${kaizen.linkedSga.id}`}
            label="Moved to SGA:"
            title={kaizen.linkedSga.title}
            tone="sga"
          />
        )}
        <StandardiseLinks
          kind="kaizen"
          id={kaizen.id}
          status={kaizen.status}
          standards={kaizen.fiveSStandards}
        />
      </div>

      <KaizenProgress states={stageStates} />

      {/* On phones the side column falls below the page, so the card shows here instead. */}
      <NextActionBanner
        kaizen={kaizen}
        ctx={ctx}
        gating={gating}
        className="lg:hidden"
      />

      {gating.initialSubmission.editable ? (
        // The raiser fills the draft step by step; everyone else sees the read-only stacked view.
        <Suspense fallback={null}>
          <KaizenDraftWizard
            kaizen={kaizen}
            gating={gating}
            token={token}
            onSaved={onSaved}
          />
        </Suspense>
      ) : (
        <>
          <ReasonSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <ReferenceSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <ConditionSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <BasicInfoSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <QcdsmtImpactSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <WasteSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
          <ImplementationPlanSection
            kaizen={kaizen}
            access={gating.initialSubmission}
            token={token}
            onSaved={onSaved}
          />
        </>
      )}

      {gating.hodPreReview.visible ? (
        <HodPreReviewSection
          kaizen={kaizen}
          access={gating.hodPreReview}
          token={token}
          onSaved={onSaved}
        />
      ) : (
        <LockedSection n={2} label="HOD Pre-Implementation Review" />
      )}

      {gating.implementation.visible ? (
        <ImplementationSection
          ref={implementationRef}
          kaizen={kaizen}
          access={gating.implementation}
          token={token}
          onSaved={onSaved}
        />
      ) : (
        <LockedSection n={3} label="Implementation" />
      )}

      {gating.canSubmitForVerification && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {verificationError && (
            <p
              role="alert"
              className="text-xs text-danger bg-danger-subtle border border-danger rounded-lg px-3 py-2 mb-3"
            >
              {verificationError}
            </p>
          )}
          <Button
            type="button"
            disabled={submittingVerification || submitForVerification.isPending}
            onClick={handleSubmitForVerification}
          >
            {submittingVerification || submitForVerification.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit for Verification
          </Button>
        </div>
      )}

      {gating.verification.visible ? (
        <VerificationSection
          kaizen={kaizen}
          access={gating.verification}
          token={token}
          onSaved={onSaved}
          ctx={ctx}
        />
      ) : (
        <LockedSection n={4} label="Verification & Closure" />
      )}

      <SectionCard title="Review history">
        <Timeline
          label="Kaizen review history"
          items={[
            {
              id: "raised",
              title: "Raised",
              actor: `${kaizen.employee.firstName} ${kaizen.employee.lastName}`,
              dateTime: kaizen.createdAt,
              timeLabel: formatDateTime(kaizen.createdAt),
            },
            ...kaizen.reviews.map((review) => ({
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
