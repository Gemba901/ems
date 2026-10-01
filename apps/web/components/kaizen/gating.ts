import { Kaizen, KaizenDraftMissingItem, KaizenStatus, KaizenVerificationStage } from "@/services/kaizen.service";
import { KaizenStageKey, KaizenStageState } from "./kaizen-ui";

export interface KaizenAccessContext {
  isRaiser: boolean;
  isKaizenOwner: boolean;
  isDeptHOD: boolean;
  isCommitteeMember: boolean;
  isFinanceHOD: boolean;
  isPrivileged: boolean;
}

export interface SectionAccess {
  visible: boolean;
  editable: boolean;
}

const RAISER_EDITABLE_STATUSES: KaizenStatus[] = ["DRAFT", "RETURNED_FOR_REVISION"];
const IMPLEMENTATION_EDITABLE_STATUSES: KaizenStatus[] = ["IN_IMPLEMENTATION", "RETURNED_FOR_REWORK"];
const IMPLEMENTATION_VISIBLE_STATUSES: KaizenStatus[] = [
  "IN_IMPLEMENTATION",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
];
const VERIFICATION_VISIBLE_STATUSES: KaizenStatus[] = [
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
];

export interface KaizenGating {
  initialSubmission: SectionAccess;
  hodPreReview: SectionAccess;
  implementation: SectionAccess;
  verification: SectionAccess;
  canSubmitForHodReview: boolean;
  canSubmitForVerification: boolean;
}

export function getKaizenGating(kaizen: Kaizen, ctx: KaizenAccessContext): KaizenGating {
  const raiserEditable = ctx.isRaiser && RAISER_EDITABLE_STATUSES.includes(kaizen.status);

  const initialSubmission: SectionAccess = {
    visible: true,
    editable: raiserEditable,
  };

  const hodPreReview: SectionAccess = {
    visible: kaizen.status !== "DRAFT",
    editable: ctx.isDeptHOD && kaizen.status === "PENDING_HOD_PRE_REVIEW",
  };

  const implementation: SectionAccess = {
    visible: IMPLEMENTATION_VISIBLE_STATUSES.includes(kaizen.status),
    editable: ctx.isKaizenOwner && IMPLEMENTATION_EDITABLE_STATUSES.includes(kaizen.status),
  };

  const verification: SectionAccess = {
    visible: VERIFICATION_VISIBLE_STATUSES.includes(kaizen.status),
    editable: kaizen.status === "PENDING_VERIFICATION",
  };

  return {
    initialSubmission,
    hodPreReview,
    implementation,
    verification,
    canSubmitForHodReview: raiserEditable,
    canSubmitForVerification: ctx.isKaizenOwner && IMPLEMENTATION_EDITABLE_STATUSES.includes(kaizen.status),
  };
}

/** Mirrors getKaizenDraftMissingItems on the API so the wizard can show gaps before submitting. */
export function getDraftChecklist(kaizen: Kaizen): KaizenDraftMissingItem[] {
  const missing: KaizenDraftMissingItem[] = [];
  if (!kaizen.trigger) missing.push({ key: "trigger", label: "Why this kaizen was started", step: 1 });
  if (kaizen.trigger === "OTHER" && !kaizen.triggerOther?.trim()) {
    missing.push({ key: "triggerOther", label: 'Explain the "Other" reason', step: 1 });
  }
  if (!kaizen.title) missing.push({ key: "title", label: "Title", step: 1 });
  if (!kaizen.conditionDescription?.trim()) {
    missing.push({ key: "conditionDescription", label: "What you saw (the problem or idea)", step: 1 });
  }
  if (kaizen.qcdsmtImpacts.length === 0) missing.push({ key: "impacts", label: "At least one thing that will improve", step: 2 });
  if (!kaizen.startDate) missing.push({ key: "startDate", label: "Start date", step: 3 });
  if (!kaizen.targetCompletionDate) missing.push({ key: "targetCompletionDate", label: "Target completion date", step: 3 });
  if (!kaizen.kaizenOwnerId) missing.push({ key: "kaizenOwnerId", label: "Kaizen owner", step: 3 });
  if (!kaizen.requiredMaterials?.trim()) missing.push({ key: "requiredMaterials", label: "What you need to do it", step: 3 });
  return missing;
}

export function canActOnVerificationStage(
  kaizen: Kaizen,
  stage: KaizenVerificationStage,
  ctx: KaizenAccessContext,
): boolean {
  if (kaizen.status !== "PENDING_VERIFICATION") return false;
  const entry = kaizen.verifications.find((v) => v.stage === stage);
  if (!entry || entry.decision !== "PENDING") return false;
  if (stage === "HOD") return ctx.isDeptHOD || ctx.isPrivileged;
  if (stage === "STEERING_COMMITTEE") return ctx.isCommitteeMember || ctx.isDeptHOD || ctx.isPrivileged;
  if (stage === "FINANCE") return ctx.isFinanceHOD || ctx.isDeptHOD || ctx.isPrivileged;
  return false;
}

/** True when the department HOD is acting on a stage that isn't naturally theirs (delegated collection). */
export function isDelegatedVerification(stage: KaizenVerificationStage, ctx: KaizenAccessContext): boolean {
  if (ctx.isPrivileged) return false;
  if (stage === "STEERING_COMMITTEE") return ctx.isDeptHOD && !ctx.isCommitteeMember;
  if (stage === "FINANCE") return ctx.isDeptHOD && !ctx.isFinanceHOD;
  return false;
}

const STAGE_ORDER: KaizenStageKey[] = ["create", "hod", "implement", "verify", "close"];

const STATUS_STAGE: Record<KaizenStatus, { stage: KaizenStageKey; state: "active" | "returned" | "done" }> = {
  DRAFT: { stage: "create", state: "active" },
  RETURNED_FOR_REVISION: { stage: "create", state: "returned" },
  PENDING_HOD_PRE_REVIEW: { stage: "hod", state: "active" },
  REJECTED: { stage: "hod", state: "returned" },
  MOVED_TO_SGA: { stage: "hod", state: "returned" },
  IN_IMPLEMENTATION: { stage: "implement", state: "active" },
  RETURNED_FOR_REWORK: { stage: "implement", state: "returned" },
  PENDING_VERIFICATION: { stage: "verify", state: "active" },
  VERIFIED_CLOSED: { stage: "close", state: "done" },
};

/** Drives the 5-stage KaizenProgress indicator. */
export function getStageStates(kaizen: Kaizen): Record<KaizenStageKey, KaizenStageState> {
  const { stage: currentStage, state: currentState } = STATUS_STAGE[kaizen.status];
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return STAGE_ORDER.reduce((states, key, i) => {
    states[key] = i < currentIdx ? "done" : i === currentIdx ? currentState : "locked";
    return states;
  }, {} as Record<KaizenStageKey, KaizenStageState>);
}
