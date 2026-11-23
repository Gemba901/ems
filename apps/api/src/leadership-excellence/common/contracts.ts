import type { AccessTokenPayload } from '../../auth/access-token-payload';

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
// Served to Area 05 in-process from Area 04's execution workspace
// (monitoring-control/monitoring-control.execution-source.ts).
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
  /** One row per KPI assignment: its current approved version. */
  listApprovedAssignments(
    organizationId: string,
  ): Promise<ApprovedKpiAssignment[]>;
  /** Period targets pinned to one approved plan version. */
  getPeriodTargets(
    organizationId: string,
    assignmentId: string,
    ref: { documentId: string; version: number },
  ): Promise<PeriodTarget[]>;
  /** Approved goals and objectives. */
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

/** An Area 04 result that is official (verified). A correction may be pending. */
export interface OfficialValue {
  submissionId: string;
  assignmentId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  target: PeriodTarget;
  verifiedById: string; // employee id
  verifiedAt: Date;
  revision: number; // 1 = first verification
}

/** Verify / return stop at the first refusal; `done` were already saved. */
export interface DecisionOutcome {
  done: string[];
  failed: { id: string; message: string } | null;
}

/**
 * Reads take the organisation and return everything; Area 05 applies its own
 * visibility rules. Changes take the signed-in user, so Area 04 enforces its
 * own permissions (assigned verifier, no self-verification, checker).
 */
export interface ExecutionProvider {
  /** Results in SUBMITTED state only. */
  listSubmitted(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<SubmittedResult[]>;
  /** Official values. Area 04 stores them; Area 05 never keeps a copy. */
  listOfficial(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<OfficialValue[]>;
  listActions(organizationId: string): Promise<TrackedAction[]>;
  getAction(
    organizationId: string,
    actionId: string,
    documentId?: string,
  ): Promise<TrackedAction | null>;
  /** Actions the owner sent for a completion check that this user may check. */
  listActionsPendingCheck(
    user: AccessTokenPayload,
  ): Promise<PendingActionCheck[]>;
  checkActionCompletion(
    user: AccessTokenPayload,
    actionId: string,
    decision: { approve: boolean; note: string },
  ): Promise<TrackedAction>;
  /** Not offered by Area 04 yet (actions live in the Area 03 plans). */
  createFollowUpAction(
    user: AccessTokenPayload,
    input: FollowUpActionInput,
  ): Promise<TrackedAction>;
  /** Verify or return, one result at a time, in the order given. */
  decide(
    user: AccessTokenPayload,
    submissionIds: string[],
    decision: 'VERIFY' | 'RETURN',
    note: string,
  ): Promise<DecisionOutcome>;
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
