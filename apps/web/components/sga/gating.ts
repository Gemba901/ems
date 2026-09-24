import { Sga, SgaDraftMissingItem, SgaStatus, SgaVerificationStage } from "@/services/sga.service";
import { SgaStageKey, SgaStageState } from "./sga-ui";

export interface SgaAccessContext {
  isRaiser: boolean;
  isOwner: boolean;
  isTeamMember: boolean;
  isMainDeptHod: boolean;
  isVerifyingDeptHod: boolean;
  isDepartmentRep: boolean;
  isCommitteeMember: boolean;
  isFinanceHod: boolean;
  isPrivileged: boolean;
}

export interface SectionAccess {
  visible: boolean;
  editable: boolean;
}

const DRAFT_EDITABLE_STATUSES: SgaStatus[] = ["DRAFT", "RETURNED_FOR_REVISION"];
const TEAM_EDITABLE_STATUSES: SgaStatus[] = ["IN_PROGRESS", "RETURNED_FOR_REWORK"];
const TEAM_VISIBLE_STATUSES: SgaStatus[] = ["IN_PROGRESS", "PENDING_VERIFICATION", "RETURNED_FOR_REWORK", "VERIFIED_CLOSED"];
const VERIFICATION_VISIBLE_STATUSES: SgaStatus[] = ["PENDING_VERIFICATION", "RETURNED_FOR_REWORK", "VERIFIED_CLOSED"];

export interface SgaGating {
  // Step 1: Start
  reason: SectionAccess;
  info: SectionAccess;
  impact: SectionAccess;
  // Step 2: Team & Approve
  team: SectionAccess;
  meetingPlan: SectionAccess;
  resources: SectionAccess;
  hodApproval: SectionAccess;
  // Step 3: Understand & Analyse
  condition: SectionAccess;
  rootCause: SectionAccess;
  meetingReports: SectionAccess;
  // Step 4: Plan & Implement
  actionPlan: SectionAccess;
  implementation: SectionAccess;
  // Step 5: Check Results
  results: SectionAccess;
  benefits: SectionAccess;
  // Step 6: Verify & Close
  verifyingDepartment: SectionAccess;
  verification: SectionAccess;

  canSubmitForHodApproval: boolean;
  canSubmitForVerification: boolean;
}

export function getSgaGating(sga: Sga, ctx: SgaAccessContext): SgaGating {
  const draftEditable = ctx.isRaiser && DRAFT_EDITABLE_STATUSES.includes(sga.status);
  const isTeam = ctx.isRaiser || ctx.isOwner || ctx.isTeamMember;
  const teamEditable = isTeam && TEAM_EDITABLE_STATUSES.includes(sga.status);
  const ownerEditable = ctx.isOwner && TEAM_EDITABLE_STATUSES.includes(sga.status);
  const teamVisible = TEAM_VISIBLE_STATUSES.includes(sga.status);

  const draftSection: SectionAccess = { visible: true, editable: draftEditable };
  const hodApproval: SectionAccess = {
    visible: sga.status !== "DRAFT",
    editable: (ctx.isMainDeptHod || ctx.isPrivileged) && sga.status === "PENDING_HOD_APPROVAL",
  };
  const teamSection: SectionAccess = { visible: teamVisible, editable: teamEditable };
  const verifyingDepartment: SectionAccess = { visible: teamVisible, editable: teamEditable };
  const verification: SectionAccess = { visible: VERIFICATION_VISIBLE_STATUSES.includes(sga.status), editable: sga.status === "PENDING_VERIFICATION" };

  return {
    reason: draftSection,
    info: draftSection,
    impact: draftSection,
    team: draftSection,
    meetingPlan: draftSection,
    resources: draftSection,
    hodApproval,
    condition: teamSection,
    rootCause: teamSection,
    meetingReports: teamSection,
    actionPlan: teamSection,
    implementation: { visible: teamVisible, editable: ownerEditable },
    results: teamSection,
    benefits: teamSection,
    verifyingDepartment,
    verification,
    canSubmitForHodApproval: draftEditable,
    canSubmitForVerification: (ctx.isRaiser || ctx.isOwner) && TEAM_EDITABLE_STATUSES.includes(sga.status),
  };
}

// Mirrors getDraftMissingItems() in the API's sga.service.ts. Steps refer to the draft
// wizard: 1 Problem, 2 What will improve, 3 Team & meetings.
export function getDraftChecklist(sga: Sga): SgaDraftMissingItem[] {
  const missing: SgaDraftMissingItem[] = [];
  if (!sga.title) missing.push({ key: "title", label: "Title", step: 1 });
  if (!sga.problemDescription) missing.push({ key: "problemDescription", label: "Problem description", step: 1 });
  if (!sga.startingReason) missing.push({ key: "startingReason", label: "Why this SGA was started", step: 1 });
  if (sga.startingReason === "OTHER" && !sga.startingReasonOther?.trim()) {
    missing.push({ key: "startingReasonOther", label: 'Explain the "Other" reason', step: 1 });
  }
  if (!sga.mainDepartmentId) missing.push({ key: "mainDepartmentId", label: "Main department", step: 1 });
  if (!sga.startDate) missing.push({ key: "startDate", label: "Start date", step: 1 });
  if (!sga.targetCompletionDate) missing.push({ key: "targetCompletionDate", label: "Target completion date", step: 1 });
  if (sga.qcdsmtImpacts.length === 0) missing.push({ key: "impacts", label: "At least one thing that will improve", step: 2 });
  if (!sga.ownerId) missing.push({ key: "ownerId", label: "SGA leader", step: 3 });
  if (!sga.meetingFrequency) missing.push({ key: "meetingFrequency", label: "How often the team meets", step: 3 });
  return missing;
}

export function canActOnVerificationStage(sga: Sga, stage: SgaVerificationStage, ctx: SgaAccessContext): boolean {
  if (sga.status !== "PENDING_VERIFICATION") return false;
  const entry = sga.verifications.find((v) => v.stage === stage);
  if (!entry || entry.decision !== "PENDING") return false;
  if (ctx.isPrivileged) return true;
  if (stage === "AFFECTED_DEPARTMENT") return ctx.isVerifyingDeptHod || ctx.isDepartmentRep;
  if (stage === "HOD") return ctx.isMainDeptHod;
  if (stage === "STEERING_COMMITTEE") return ctx.isCommitteeMember || ctx.isMainDeptHod;
  if (stage === "FINANCE") return ctx.isFinanceHod || ctx.isMainDeptHod;
  return false;
}

export function isDelegatedVerification(stage: SgaVerificationStage, ctx: SgaAccessContext): boolean {
  if (ctx.isPrivileged) return false;
  if (stage === "STEERING_COMMITTEE") return ctx.isMainDeptHod && !ctx.isCommitteeMember;
  if (stage === "FINANCE") return ctx.isMainDeptHod && !ctx.isFinanceHod;
  return false;
}

export function getStageStates(sga: Sga): Record<SgaStageKey, SgaStageState> {
  const locked: Record<SgaStageKey, SgaStageState> = {
    start: "locked",
    team: "locked",
    analyse: "locked",
    implement: "locked",
    check: "locked",
    verify: "locked",
  };

  switch (sga.status) {
    case "DRAFT":
      return { ...locked, start: "active" };
    case "RETURNED_FOR_REVISION":
      return { ...locked, start: "returned" };
    case "PENDING_HOD_APPROVAL":
      return { ...locked, start: "done", team: "active" };
    case "REJECTED":
      return { ...locked, start: "done", team: "returned" };
    case "IN_PROGRESS":
      return { ...locked, start: "done", team: "done", analyse: "active", implement: "active", check: "active" };
    case "RETURNED_FOR_REWORK":
      return { ...locked, start: "done", team: "done", analyse: "returned", implement: "returned", check: "returned" };
    case "PENDING_VERIFICATION":
      return { ...locked, start: "done", team: "done", analyse: "done", implement: "done", check: "done", verify: "active" };
    case "VERIFIED_CLOSED":
      return { ...locked, start: "done", team: "done", analyse: "done", implement: "done", check: "done", verify: "done" };
    default:
      return locked;
  }
}
