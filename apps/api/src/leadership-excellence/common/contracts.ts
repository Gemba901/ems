// ── 01 Strategic Direction → all later areas ─────────────────────────────

/** Lightweight status other areas read (02 header, 03 planning gate). */
export interface StrategicDirectionSummary {
  /** Approved company name; falls back to the current draft before first approval. */
  company: string;
  /** True once any version has been approved. */
  approved: boolean;
  /** Approved version number; null until the first approval. */
  version: number | null;
}

/** One core value as published (01.01). */
export interface CoreValue {
  id: string;
  name: string;
  why: string;
}

/**
 * The approved, locked company direction. Only approved content crosses
 * area boundaries — drafts and in-review revisions never leave Area 01.
 */
export interface ApprovedStrategicDirection {
  version: number;
  company: string;
  business: string;
  purpose: string;
  vision: string;
  visionWhy: string;
  mission: string;
  missionWhy: string;
  values: CoreValue[];
  approvedAt: Date;
  approvedById: string | null;
}

/** The six fixed BEES pillars (01.02). Reference data; never edited by orgs. */
export const LEX_PILLARS = [
  { code: 'LEX', name: 'Leadership Excellence' },
  { code: 'PEX', name: 'People Excellence' },
  { code: 'OPX', name: 'Operational Excellence' },
  { code: 'CMX', name: 'Customer & Market Excellence' },
  { code: 'SGEX', name: 'Sustainability & Governance Excellence' },
  { code: 'FPEX', name: 'Financial Performance Excellence' },
] as const;
export type LexPillarCode = (typeof LEX_PILLARS)[number]['code'];

/**
 * What StrategicDirectionService exports to other areas. Later areas inject the
 * service and call only these methods.
 */
export interface StrategicDirectionProvider {
  getSummary(organizationId: string): Promise<StrategicDirectionSummary>;
  /** Null until the first approval. */
  getApproved(
    organizationId: string,
  ): Promise<ApprovedStrategicDirection | null>;
}

// ── 03 Performance Planning → 04 · 05 · 06 · 07 ──────────────────────────
// Served to Area 05 by Area 04's execution module (GET /execution/assignments,
// /execution/assignments/:id/targets, /execution/goals).
export type KpiDirection = 'higher' | 'lower' | 'range' | 'zero';
export type KpiAggregation =
  | 'sum'
  | 'ratio'
  | 'closing'
  | 'milestone'
  | 'average';

export interface KpiDefinitionSnapshot {
  name: string;
  unit: string;
  direction: KpiDirection;
  calc: 'direct' | 'ratio' | 'percent';
  aggregation: KpiAggregation;
  inputA?: string; // label, e.g. "Rejected units"
  inputB?: string; // label, e.g. "Inspected units"
}

export interface PeriodTarget {
  periodId: string;
  start: string; // YYYY-MM-DD
  end: string;
  scheduled: boolean;
  dueAt: string; // ISO; submission deadline from the Area 02 calendar
  value: number | null;
  upper?: number | null; // only for 'range'
}

export interface ApprovedKpiAssignment {
  id: string;
  code: string;
  /** Approved planning document; with planVersion it pins the exact targets. */
  documentId: string;
  planVersion: number;
  departmentId: string;
  goalId: string;
  definition: KpiDefinitionSnapshot;
  baseline: number | null;
  finalTarget: number | null;
  warningTolerance: number; // in the KPI unit; 0 = none
  ownerId: string; // employee ids
  providerId: string;
  verifierId: string;
}

/** An approved goal or objective (follow-ups hang under a department goal). */
export interface ApprovedGoal {
  id: string;
  documentId: string;
  kind: 'OBJECTIVE' | 'GOAL';
  title: string;
  ownerId: string; // employee id; may check completion of actions under it
  departmentId: string | null;
  parentId: string | null;
}

export interface PerformancePlanningProvider {
  /** GET /execution/assignments */
  listApprovedAssignments(
    organizationId: string,
  ): Promise<ApprovedKpiAssignment[]>;
  /** GET /execution/assignments/:assignmentId/targets?documentId=&version= */
  getPeriodTargets(
    organizationId: string,
    assignmentId: string,
    ref: { documentId: string; version: number },
  ): Promise<PeriodTarget[]>;
  /** GET /execution/goals */
  listGoals(organizationId: string): Promise<ApprovedGoal[]>;
}

// ── 04 Execution → 05 ─────────────────────────────────────────────────────
export interface SubmittedResult {
  id: string;
  assignmentId: string;
  periodId: string;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  note: string | null;
  correctionReason: string | null; // required when replacing an official value
  submittedById: string;
  submittedAt: Date;
  assignment: ApprovedKpiAssignment; // snapshot at submission
  target: PeriodTarget;
}

/** A delivery or improvement action tracked in Area 04 (05.03 overdue alerts, follow-ups). */
export interface TrackedAction {
  id: string;
  title: string;
  ownerId: string;
  departmentId: string | null;
  assignmentId: string | null;
  dueAt: string; // ISO
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'CANCELLED';
  documentId?: string;
}

/** An action the owner marked ready for a completion check. */
export interface PendingActionCheck extends TrackedAction {
  goalId: string | null;
  ownerNote: string | null;
  evidence: string | null;
  updatedById: string;
  updatedAt: Date;
}

export interface FollowUpActionInput {
  goalId: string; // approved department goal
  title: string;
  ownerId: string;
  dueAt: string; // YYYY-MM-DD
  expected: string; // expected improvement
  evidence: string; // how completion will be checked
  sourceAlertKey: string; // Area 05 alert this follows up
}

export interface ExecutionProvider {
  /** GET /execution/submissions. Results in SUBMITTED state only. */
  listSubmitted(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<SubmittedResult[]>;
  /** GET /execution/actions */
  listActions(organizationId: string): Promise<TrackedAction[]>;
  /** GET /execution/actions/:actionId?documentId= */
  getAction(
    organizationId: string,
    actionId: string,
    documentId?: string,
  ): Promise<TrackedAction | null>;
  /** GET /execution/actions/pending-check (Area 04 decides who may check). */
  listActionsPendingCheck(
    organizationId: string,
    checkerId: string,
  ): Promise<PendingActionCheck[]>;
  /** POST /execution/actions/:actionId/completion-check */
  checkActionCompletion(
    organizationId: string,
    actionId: string,
    decision: { approve: boolean; note: string; checkerId: string },
  ): Promise<TrackedAction>;
  /** POST /execution/actions/follow-up */
  createFollowUpAction(
    organizationId: string,
    input: FollowUpActionInput,
    createdById: string,
  ): Promise<TrackedAction>;
  /**
   * POST /execution/results/:resultId/verify and /return.
   * OPEN: Area 04's endpoints also save the official value; Area 05 does that
   * too (LexOfficialResult). Agree which area owns it before wiring.
   */
  markVerified(
    tx: unknown,
    organizationId: string,
    submissionIds: string[],
  ): Promise<void>;
  markReturned(
    tx: unknown,
    organizationId: string,
    submissionIds: string[],
    reason: string,
  ): Promise<void>;
}

// ── 05 Monitoring & Control → 06 · 07 ─────────────────────────────────────
export interface OfficialResult {
  assignmentId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  target: PeriodTarget;
  verifiedById: string;
  verifiedAt: Date;
  revision: number;
}

export interface MonitoringProvider {
  getOfficialResults(
    organizationId: string,
    assignmentId: string,
  ): Promise<OfficialResult[]>;
}
