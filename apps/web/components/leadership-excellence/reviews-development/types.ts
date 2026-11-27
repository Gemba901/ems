// Area 06 shared types (reviews, coaching, effectiveness). Mirrors the API responses.

export type ReviewType = "DEPARTMENT" | "PERSONAL";
export type ReviewStatus = "DRAFT" | "SUBMITTED" | "APPROVED";
export type CoachingKind = "RECOGNITION" | "FEEDBACK" | "COACHING";
export type EffectivenessStatus = "EFFECTIVE" | "PARTLY_EFFECTIVE" | "NOT_EFFECTIVE";
export type ActionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED" | "CANCELLED";

export interface ReviewPlanOption {
  documentId: string;
  version: number;
  kind: "DEPARTMENT" | "INDIVIDUAL";
  type: ReviewType;
  title: string;
  cycle: string;
  departmentId: string | null;
  subjectId: string;
  reviewerId: string;
  reviewFrequency: string | null;
  periods: { start: string; end: string; closed: boolean }[];
  relatesTo: { key: string; label: string }[];
}

export interface DevelopmentContext {
  me: string | null;
  today: string;
  plans: ReviewPlanOption[];
}

export interface MeasureRecord {
  periodId: string;
  start: string;
  end: string;
  scheduled: boolean;
  target: number | null;
  upper: number | null;
  actual: number | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  revision: number | null;
  status: "NOT_SCHEDULED" | "VERIFIED" | "NOT_YET_DUE" | "MISSING";
}

export interface ReviewSnapshot {
  at: string;
  planDocumentId: string;
  planVersion: number;
  planTitle: string;
  period: { start: string; end: string };
  goals: { id: string; code: string; title: string; ownerId: string; kind: string }[];
  measures: {
    id: string;
    code: string;
    name: string;
    unit: string;
    ownerId: string;
    records: MeasureRecord[];
    verified: number;
    scheduled: number;
    complete: boolean;
    crossing: boolean;
  }[];
  actions: { id: string; title: string; ownerId: string; dueAt: string; status: ActionStatus; evidence: string | null }[];
  complete: boolean;
}

export interface Acknowledgement {
  version: number;
  employeeId: string;
  comment: string;
  concern: boolean;
  acknowledgedAt: string;
}

export interface ReviewSummary {
  id: string;
  code: string;
  type: ReviewType;
  status: ReviewStatus;
  version: number;
  planDocumentId: string;
  planTitle: string;
  departmentId: string | null;
  periodStart: string;
  periodEnd: string;
  subjectId: string;
  subjectName: string;
  reviewerId: string;
  reviewerName: string;
  meetingDate: string;
  reason: string | null;
  returnReason: string | null;
  approved: { version: number; approvedAt: string; approvedById: string } | null;
  acknowledgement: Acknowledgement | null;
  linkedActionIds: string[];
  updatedAt: string;
  can: {
    reflect: boolean;
    submit: boolean;
    review: boolean;
    returnForClarification: boolean;
    approve: boolean;
    revise: boolean;
    acknowledge: boolean;
    link: boolean;
  };
}

export interface Reflection {
  achievements: string;
  challenges: string;
  learning: string;
  supportNeeded: string;
}

export interface Discussion {
  recognition: string;
  findings: string;
  decisions: string;
  noInputReason: string;
  dataLimitReason: string;
  nextReviewDate: string | null;
}

export interface ReviewDetail extends ReviewSummary {
  reflection: Reflection & { submittedAt: string | null };
  discussion: Discussion;
  snapshot: ReviewSnapshot;
  factsChanged: boolean | null;
  versions: { version: number; approvedAt: string; approvedById: string; data: unknown }[];
  acknowledgements: Acknowledgement[];
  history: { action: string; note: string | null; actorId: string | null; at: string }[];
}

export interface CoachingRecord {
  id: string;
  code: string;
  kind: CoachingKind;
  planDocumentId: string;
  departmentId: string | null;
  subjectId: string;
  subjectName: string;
  reviewerId: string;
  reviewerName: string;
  date: string;
  topic: string;
  relatesTo: string;
  notes: string;
  support: string;
  response: string;
  linkedActionIds: string[];
  createdAt: string;
  updatedAt: string;
  can: { editNotes: boolean; respond: boolean; link: boolean };
}

export interface ImprovementAction {
  id: string;
  documentId: string | null;
  title: string;
  ownerId: string;
  ownerName: string;
  departmentId: string | null;
  goalId: string | null;
  goalTitle: string | null;
  dueAt: string;
  status: ActionStatus;
  expectedResult: string | null;
  evidence: string | null;
  checkedById: string | null;
  checkedAt: string | null;
  effectiveness: {
    id: string;
    status: EffectivenessStatus;
    note: string;
    evidence: string;
    assessedById: string;
    assessedAt: string;
  } | null;
  linkedFrom: { kind: "REVIEW" | "COACHING"; id: string; code: string }[];
  canAssess: boolean;
}
