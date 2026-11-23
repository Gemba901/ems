// Area 05 · Monitoring & Control: shapes returned by /leadership-excellence/monitoring-control/*.

export type KpiDirection = "higher" | "lower" | "range" | "zero";
export type PerformanceStatus = "ON_TARGET" | "NEEDS_ATTENTION" | "BELOW_TARGET" | "NOT_MEASURED" | "TARGET_INCOMPLETE";
export type DataStatus = "NOT_SCHEDULED" | "NOT_YET_DUE" | "NOT_REPORTED" | "PENDING_VERIFICATION" | "VERIFIED";

export interface Assessment {
  status: PerformanceStatus;
  gap: number | null;
}

export interface Directory {
  me: string | null;
  people: Record<string, string>;
  departments: { id: string; name: string }[];
}

export interface MonitoringFilters {
  departmentId?: string;
  month?: string; // YYYY-MM
}

// ---- 05.01 · Verify results ----
export interface QueueRow {
  submissionId: string;
  assignmentId: string;
  code: string;
  name: string;
  unit: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  target: number | null;
  upper: number | null;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  note: string | null;
  submittedById: string;
  submittedAt: string;
  isCorrection: boolean;
  currentOfficial: number | null;
  correctionReason: string | null;
  /** Empty = can be verified. */
  problems: string[];
}

export interface HistoryRow {
  id: string;
  submissionId: string;
  assignmentId: string;
  code: string;
  name: string;
  periodId: string;
  action: "VERIFIED" | "RETURNED";
  actual: number | null;
  previousActual: number | null;
  reason: string | null;
  actorId: string;
  createdAt: string;
}

export interface RowFailure {
  submissionId: string;
  problems: string[];
}

// ---- 05.02 · Performance & gaps ----
export interface PeriodRow {
  periodId: string;
  start: string;
  end: string;
  dueAt: string;
  dataStatus: DataStatus;
  target: number | null;
  upper: number | null;
  actual: number | null;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  revision: number | null;
  verifiedAt: string | null;
  correctionPending: boolean;
  assessment: Assessment | null;
}

export interface AssignmentSummary {
  assignmentId: string;
  code: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  departmentId: string;
  ownerId: string;
  verifierId: string;
  completeness: { due: number; verified: number; pending: number };
  summary: { actual: number | null; target: number | null; incomplete: boolean };
  assessment: Assessment | null;
  achievementPct: number | null;
  improvementProgressPct: number | null;
  variance: { value: number; favourable: boolean | null } | null;
  latestVerified: PeriodRow | null;
  periodCount: number;
}

export interface AssignmentDetail extends Omit<AssignmentSummary, "periodCount"> {
  periods: PeriodRow[];
}

// ---- 05.03 · Alerts & follow-up ----
export type AlertKind = "MISSING_RESULT" | "VERIFIED_GAP" | "OVERDUE_ACTION";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "FOLLOW_UP_LINKED" | "CLOSED";
export type AlertStatusFilter = AlertStatus | "ACTIVE";

export interface AlertEvent {
  id: string;
  action: "OPENED" | "ACKNOWLEDGED" | "ESCALATED" | "FOLLOW_UP_LINKED" | "CLOSED" | "REOPENED";
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface MonitoringAlert {
  id: string;
  key: string;
  kind: AlertKind;
  status: AlertStatus;
  title: string;
  detail: string | null;
  assignmentId: string | null;
  actionId: string | null;
  departmentId: string | null;
  ownerId: string;
  escalatedToId: string | null;
  linkedActionId: string | null;
  comment: string | null;
  openedAt: string;
  closedAt: string | null;
  events: AlertEvent[];
}

export interface TrackedAction {
  id: string;
  title: string;
  ownerId: string;
  departmentId: string | null;
  assignmentId: string | null;
  dueAt: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED" | "CANCELLED";
  documentId?: string;
}

/** A delivery action its owner marked done, waiting for your completion check. */
export interface PendingActionCheck extends TrackedAction {
  goalId: string | null;
  ownerNote: string | null;
  evidence: string | null;
  updatedById: string;
  updatedAt: string;
}

/** 05.02 organisation setting: "needs attention" band as % of target. */
export interface MonitoringSettings {
  warningTolerancePct: number;
  canEdit: boolean;
}
