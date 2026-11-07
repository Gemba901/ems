// Wire contract mirrors the Area 03 API; validation remains server-side.
export type Pillar = "LEX" | "PEX" | "OPX" | "CMX" | "SGEX" | "FPEX";
export type PlanKind =
  | "SWOT"
  | "COMPANY"
  | "DEPARTMENT"
  | "TEAM"
  | "POSITION"
  | "INDIVIDUAL";
export type ItemKind =
  | "finding"
  | "objective"
  | "goal"
  | "assignment"
  | "action";
export type Frequency =
  | "DAILY"
  | "WEEKLY"
  | "FORTNIGHTLY"
  | "TWICE_MONTHLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "YEARLY";
export interface SourceLink {
  documentId: string;
  findingId: string;
  version: number;
}
export interface ParentGoal {
  documentId: string;
  goalId: string;
  version: number;
}
/** Approved snapshots offered for planning, including future-effective versions. */
export interface ApprovedParentGoal {
  documentId: string;
  kind: "COMPANY" | "DEPARTMENT";
  cycle: string;
  scopeId: string;
  departmentId: string;
  version: number;
  effectiveDate: string;
  goal: Pick<
    Goal,
    "id" | "code" | "title" | "departmentIds" | "startDate" | "endDate"
  >;
}
export interface Stamp {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
export interface Finding extends Stamp {
  pillar: Pillar;
  category: "S" | "W" | "O" | "T";
  title: string;
  relatedPillars: Pillar[];
  explanation: string;
  impact: string;
  evidence: string;
  sourceUrl: string;
  basis: "MANAGEMENT" | "EVIDENCED" | "NEEDS_CHECKING";
  /** Older approved snapshots may not contain a numerical assessment. */
  weightage?: number | null;
  priority: "" | "HIGH" | "MEDIUM" | "LOW";
  response: "" | "OBJECTIVE" | "ACTION" | "MONITOR" | "NONE";
  decisionNote: string;
  followupOwnerId: string;
  reviewDate: string;
}
export interface Objective extends Stamp {
  title: string;
  meaning: string;
  pillar: Pillar | "";
  alignments: string[];
  alignmentReason: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  sources: SourceLink[];
  sourceRationale: string;
}
export interface Goal extends Stamp {
  title: string;
  objectiveId: string;
  parent: ParentGoal | null;
  ongoingReason: string;
  measure: string;
  definitionId: string;
  baseline: number | null;
  baselineReason: string;
  target: number | null;
  unit: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  approach: string;
  departmentIds: string[];
  /** Required at approval when a contribution has no separate delivery action. */
  noActionReason?: string;
}
export interface TargetPeriod {
  id: string;
  label: string;
  start: string;
  end: string;
  target: number | null;
  upper: number | null;
  scheduled?: boolean;
  submissionDate?: string;
}
export interface PlanningCalendar {
  id: string;
  version: string | number;
  source: "AREA_02" | "WORK_SETTINGS";
  approved: boolean;
  timeZone: string;
  startDate: string;
  endDate: string;
  workingDays: number[];
  holidays: string[];
  weekStart: number;
  fortnightAnchor: string;
  twiceMonthlySplit: number;
  submissionDueDays: number;
}
export interface Assignment extends Stamp {
  ownerId?: string;
  calendar?: PlanningCalendar;
  goalId: string;
  definitionId: string;
  baseline: number | null;
  baselineReason: string;
  startDate: string;
  endDate: string;
  providerId: string;
  verifierId: string;
  source: string;
  updateFrequency: Frequency;
  reviewFrequency: Frequency;
  targetMode: "SAME" | "VARIED";
  target: number | null;
  upper: number | null;
  targets: TargetPeriod[];
}
export interface DeliveryAction extends Stamp {
  title: string;
  goalId: string;
  parentActionId: string;
  ownerId: string;
  dueDate: string;
  expectedResult: string;
  completionEvidence: string;
  support: string;
  sources: SourceLink[];
}
/** A commitment to an existing department action, never a duplicate action. */
export interface ActionLink {
  id: string;
  goalId: string;
  documentId: string;
  actionId: string;
  version: number;
}
export interface SharedAction {
  documentId: string;
  version: number;
  action: DeliveryAction;
}
export interface PlanData {
  title: string;
  ownerId: string;
  approverId: string;
  coordinatorIds: string[];
  contributorIds: string[];
  startDate: string;
  endDate: string;
  consideredPillars: Pillar[];
  findings: Finding[];
  objectives: Objective[];
  goals: Goal[];
  assignments: Assignment[];
  actions: DeliveryAction[];
  actionLinks?: ActionLink[];
}
export interface ApprovedVersion {
  version: number;
  data: PlanData;
  approvedAt: string;
  approvedBy: string;
  effectiveDate: string;
  definitions: KpiDefinition[];
  reason: string;
}
export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  changes?: { field: string; before: unknown; after: unknown }[];
}
export interface PlanningDocument {
  id: string;
  code: string;
  kind: PlanKind;
  scopeId: string;
  departmentId: string;
  cycle: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED";
  data: PlanData;
  versions: ApprovedVersion[];
  revisionReason: string;
  effectiveDate: string;
  history: AuditEvent[];
  acknowledgement: { actorId: string; at: string; version: number } | null;
}
export interface Kra {
  id: string;
  code: string;
  name: string;
  adaptedFromId?: string;
}
export interface KpiDefinition {
  id: string;
  code: string;
  kraId: string;
  name: string;
  meaning: string;
  unit: string;
  direction: "HIGHER" | "LOWER" | "RANGE" | "ZERO" | "MILESTONE";
  formula: "DIRECT" | "RATIO" | "PERCENT";
  inputA: string;
  inputB: string;
  aggregation: "SUM" | "RATIO" | "CLOSING" | "MILESTONE";
  source: "REFERENCE" | "CUSTOM";
  adaptedFromId?: string;
}
export interface PlanningState {
  schema: 1;
  sequence: number;
  documents: PlanningDocument[];
  kras: Kra[];
  definitions: KpiDefinition[];
}
export interface PlanningPerson {
  id: string;
  name: string;
  departmentId: string | null;
  position: string;
  role: string;
  userId: string | null;
}
export interface PlanningReferences {
  calendar?: PlanningCalendar;
  refreshedAt?: string;
  sourceUpdatedAt?: string;
  source?: string;
  dependencyStatus?: {
    calendar: "APPROVED" | "WORK_SETTINGS_FALLBACK";
    positions: "AVAILABLE" | "UNAVAILABLE";
    library: "AVAILABLE" | "LOCAL_CATALOGUE";
    direction: "AVAILABLE" | "UNAVAILABLE";
  };
  library?: { kras: Kra[]; definitions: KpiDefinition[] };
  timeZone?: string;
  positions?: {
    id: string;
    name: string;
    departmentId: string;
    holderIds: string[];
  }[];
  direction?: {
    version: number;
    company: string;
    purpose: string;
    vision: string;
    mission: string;
  } | null;
  departments: { id: string; name: string }[];
  people: PlanningPerson[];
  teams: {
    id: string;
    name: string;
    departmentId: string;
    memberIds: string[];
  }[];
  pillars: { code: Pillar; name: string }[];
}
export interface PlanningActor {
  positionIds?: string[];
  userId: string;
  employeeId: string;
  departmentId: string;
  name: string;
  role: string;
}
export interface DocumentPermissions {
  canRead: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  canSeeSources: boolean;
}
export interface PlanningView {
  revision: number;
  approvedParentGoals?: ApprovedParentGoal[];
  references: PlanningReferences;
  actor: PlanningActor;
  documents: (PlanningDocument & {
    permissions: DocumentPermissions;
    issues: string[];
  })[];
  kras: Kra[];
  definitions: KpiDefinition[];
  sharedActions: SharedAction[];
}
export interface PlanningCommand {
  expectedRevision: number;
  action:
    | "CREATE_PLAN"
    | "SAVE_SETTINGS"
    | "SAVE_ITEM"
    | "DELETE_ITEM"
    | "CONSIDER_PILLAR"
    | "CONSIDER_ALL_PILLARS"
    | "SUBMIT"
    | "APPROVE"
    | "RETURN"
    | "REVISE"
    | "ACKNOWLEDGE"
    | "LINK_ACTION"
    | "UNLINK_ACTION"
    | "SAVE_DEFINITION";
  documentId?: string;
  payload: Record<string, unknown>;
}
