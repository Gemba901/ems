export type Pillar = 'LEX' | 'PEX' | 'OPX' | 'CMX' | 'SGEX' | 'FPEX';
export type PlanKind =
  | 'SWOT'
  | 'COMPANY'
  | 'DEPARTMENT'
  | 'TEAM'
  | 'POSITION'
  | 'INDIVIDUAL';
export type ItemKind =
  | 'finding'
  | 'objective'
  | 'goal'
  | 'assignment'
  | 'action';
export type Frequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'TWICE_MONTHLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY';
export interface SourceLink {
  documentId: string;
  findingId: string;
  version: number;
}
export interface ParentGoal {
  documentId: string;
  goalId: string;
  version: number;
  /** Missing means a legacy goal reference; objective IDs are never guessed. */
  itemKind?: 'OBJECTIVE' | 'GOAL';
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
  /** Canonical multi-selection. Absent only in legacy snapshots; OTHER means Business focus. */
  alignments?: string[];
  pillar: Pillar;
  category: 'S' | 'W' | 'O' | 'T';
  title: string;
  relatedPillars: Pillar[];
  /** Compatibility-only scalar used when alignments is absent. */
  alignment?: '' | 'Q' | 'C' | 'D' | 'S' | 'M' | 'T' | 'OTHER';
  otherBusinessFocus?: string;
  explanation: string;
  impact: string;
  evidence: string;
  sourceUrl: string;
  basis: 'MANAGEMENT' | 'EVIDENCED' | 'NEEDS_CHECKING';
  /** Absent only in legacy JSON; never infer a score from its saved priority. */
  weightage?: number | null;
  priority: '' | 'HIGH' | 'MEDIUM' | 'LOW';
  response:
    | ''
    | 'OBJECTIVE'
    | 'ACTION'
    | 'MONITOR'
    | 'NONE'
    | 'MAINTAIN'
    | 'USE'
    | 'DEFER'
    | 'VERIFY';
  /** Legacy reviewed assessment snapshots omit these fields. */
  reviewStatus?: 'UNDER_REVIEW' | 'NEEDS_EVIDENCE' | 'REVIEWED';
  reviewedAt?: string;
  reviewedBy?: string;
  decisionNote: string;
  followupOwnerId: string;
  reviewDate: string;
}
export interface Objective extends Stamp {
  result?: string;
  alignment?: '' | 'Q' | 'C' | 'D' | 'S' | 'M' | 'T' | 'OTHER';
  otherBusinessFocus?: string;
  direction?: '' | 'HIGHER' | 'LOWER' | 'MAINTAIN_MIN' | 'MAINTAIN_MAX';
  baselinePeriod?: string;
  definition?: string;
  dataSource?: string;
  reviewFrequency?: string;
  guardrails?: string;
  title: string;
  meaning: string;
  pillar: Pillar | '';
  alignments: string[];
  alignmentReason: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  sources: SourceLink[];
  sourceRationale: string;
  priority?: number | null;
  weightage?: number | null;
  /** Optional only for legacy direction-only records and incomplete drafts. */
  measure?: string;
  baseline?: number | null;
  baselineReason?: string;
  target?: number | null;
  unit?: string;
  departmentIds?: string[];
  approach?: string;
  selectionReason?: string;
}
export interface Goal extends Stamp {
  goalNo?: number | null;
  departmentCode?: string;
  definition?: string;
  direction?: '' | 'HIGHER' | 'LOWER' | 'MAINTAIN_MIN' | 'MAINTAIN_MAX';
  baselinePeriod?: string;
  source?: string;
  frequency?: Frequency | '';
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
  source: 'AREA_02' | 'WORK_SETTINGS';
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
  targetMode: 'SAME' | 'VARIED';
  target: number | null;
  upper: number | null;
  targets: TargetPeriod[];
}
export interface DeliveryAction extends Stamp {
  parent?: ParentGoal | null;
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
  /** Read projection: each published item retains its canonical approval version. */
  itemVersions?: Record<string, number>;
  approvedItem?: { kind: 'objective' | 'goal'; itemId: string };
  companyPlanningModel?: 'MEASURABLE_OBJECTIVES';
  /** Preserved for history/revision only; not approved commitments or parent choices. */
  legacyCompanyGoals?: Goal[];
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
  /** Marks programme drafts even before their optional fields are completed. */
  planningModel?: 'PROGRAMME';
  /** Current item locks; historical payloads live in immutable approved versions. */
  itemApprovals?: ItemApproval[];
  id: string;
  code: string;
  kind: PlanKind;
  scopeId: string;
  departmentId: string;
  cycle: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
  data: PlanData;
  versions: ApprovedVersion[];
  /** Immutable per-finding reviews share a version namespace with full reviews. */
  findingReviews?: {
    version: number;
    finding: Finding;
    reviewedAt: string;
    reviewedBy: string;
  }[];
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
  direction: 'HIGHER' | 'LOWER' | 'RANGE' | 'ZERO' | 'MILESTONE';
  formula: 'DIRECT' | 'RATIO' | 'PERCENT';
  inputA: string;
  inputB: string;
  aggregation: 'SUM' | 'RATIO' | 'CLOSING' | 'MILESTONE';
  source: 'REFERENCE' | 'CUSTOM';
  adaptedFromId?: string;
}
export interface PlanningState {
  /** Monotonic department goal numbers, scoped by period, department and parent identity. */
  departmentGoalSequences?: Record<string, number>;
  programmeResults?: ProgrammeResult[];
  programmeReviews?: ProgrammeReview[];
  programmeActionProgress?: ProgrammeActionProgress[];
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
    calendar: 'APPROVED' | 'WORK_SETTINGS_FALLBACK';
    positions: 'AVAILABLE' | 'UNAVAILABLE';
    library: 'AVAILABLE' | 'LOCAL_CATALOGUE';
    direction: 'AVAILABLE' | 'UNAVAILABLE';
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
    /** Approved Area 01 values; optional for older API responses. */
    values?: { id: string; name: string; why: string }[];
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
/** Approved snapshots available for planning, including future effective dates. */
export interface ApprovedParentGoal {
  itemKind?: 'OBJECTIVE' | 'GOAL';
  documentId: string;
  kind: 'COMPANY' | 'DEPARTMENT';
  cycle: string;
  scopeId: string;
  departmentId: string;
  version: number;
  effectiveDate: string;
  /** Restricted summaries can only be retained on these existing contributions. */
  retainedFor?: { documentId: string; goalId: string }[];
  goal: Pick<
    Goal,
    'id' | 'code' | 'title' | 'departmentIds' | 'startDate' | 'endDate'
  >;
}
export interface PlanningView {
  programmeResults?: ProgrammeResult[];
  programmeReviews?: ProgrammeReview[];
  programmeActionProgress?: ProgrammeActionProgress[];
  programmeActions?: { documentId: string; action: DeliveryAction }[];
  revision: number;
  references: PlanningReferences;
  actor: PlanningActor;
  documents: (PlanningDocument & {
    permissions: DocumentPermissions;
    issues: string[];
    programmeIssues?: Record<string, string[]>;
  })[];
  kras: Kra[];
  definitions: KpiDefinition[];
  sharedActions: SharedAction[];
  approvedParentGoals?: ApprovedParentGoal[];
}
export interface PlanningCommand {
  expectedRevision: number;
  action:
    | 'CREATE_PLAN'
    | 'SAVE_SETTINGS'
    | 'SAVE_ITEM'
    | 'SAVE_FINDINGS'
    | 'SAVE_GOALS'
    | 'REVIEW_FINDINGS'
    | 'APPROVE_ITEM'
    | 'REVISE_ITEM'
    | 'SAVE_RESULT'
    | 'VERIFY_RESULT'
    | 'SAVE_REVIEW'
    | 'UPDATE_ACTION_PROGRESS'
    | 'REVIEW_FINDING'
    | 'REOPEN_FINDING'
    | 'DELETE_ITEM'
    | 'CONSIDER_PILLAR'
    | 'CONSIDER_ALL_PILLARS'
    | 'SUBMIT'
    | 'APPROVE'
    | 'RETURN'
    | 'REVISE'
    | 'ACKNOWLEDGE'
    | 'LINK_ACTION'
    | 'UNLINK_ACTION'
    | 'SAVE_DEFINITION';
  documentId?: string;
  payload: Record<string, unknown>;
}

export interface ItemApproval {
  kind: 'objective' | 'goal';
  itemId: string;
  status: 'APPROVED' | 'DRAFT';
  version: number;
  approvedAt: string;
  approvedBy: string;
  reason?: string;
  effectiveDate?: string;
}
export interface ProgrammeResult {
  id: string;
  documentId: string;
  itemId: string;
  itemKind: 'OBJECTIVE' | 'GOAL';
  version: number;
  scope: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL';
  periodStart: string;
  periodEnd: string;
  actual: number;
  numerator: number | null;
  denominator: number | null;
  source: string;
  notes: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  recordedBy: string;
  recordedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  verificationNote: string;
}
export interface ProgrammeReview {
  id: string;
  documentId: string;
  itemId: string;
  version: number;
  resultId: string;
  decision: 'INVESTIGATE' | 'SUSTAIN' | 'REVISE';
  note: string;
  nextReviewDate: string;
  reviewedBy: string;
  reviewedAt: string;
}
export interface ProgrammeActionProgress {
  id: string;
  documentId: string;
  actionId: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  evidence: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
}
