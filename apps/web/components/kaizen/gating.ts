import { Kaizen, KaizenStatus, KaizenVerificationStage } from "@/services/kaizen.service";
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

export function canActOnVerificationStage(
  kaizen: Kaizen,
  stage: KaizenVerificationStage,
  ctx: KaizenAccessContext,
): boolean {
  if (kaizen.status !== "PENDING_VERIFICATION") return false;
  const entry = kaizen.verifications.find((v) => v.stage === stage);
  if (!entry || entry.decision !== "PENDING") return false;
  if (stage === "HOD") return ctx.isDeptHOD || ctx.isPrivileged;
  if (stage === "STEERING_COMMITTEE") return ctx.isCommitteeMember || ctx.isPrivileged;
  if (stage === "FINANCE") return ctx.isFinanceHOD || ctx.isPrivileged;
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
