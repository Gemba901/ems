import { apiClient } from "@/lib/api-client";
const API_URL = "/api/five-s";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Carries the backend's machine-readable code (e.g. FIVE_S_CHECKPOINTS_UNANSWERED) and any extra
// fields it sent (e.g. the list of missing checkpoints).
export class FiveSApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const { message, code, ...details } = body ?? {};
    delete details.statusCode;
    delete details.error;
    const text = Array.isArray(message) ? message.join(". ") : message;
    throw new FiveSApiError(text || `Request failed with status ${res.status}`, res.status, code, details);
  }
  return res.json();
}

function get<T>(path: string, token: string): Promise<T> {
  return apiClient(`${API_URL}${path}`, { headers: authHeaders(token) }, token).then((res) => handleResponse<T>(res));
}

function send<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body: unknown, token: string): Promise<T> {
  return apiClient(
    `${API_URL}${path}`,
    { method, headers: authHeaders(token), ...(body !== undefined && { body: JSON.stringify(body) }) },
    token,
  ).then((res) => handleResponse<T>(res));
}

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ── Enums and labels ──────────────────────────────────────────────────────────

export type Practice = "SORT" | "SET_IN_ORDER" | "SHINE" | "STANDARDIZE" | "SUSTAIN";
export type AuditFrequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY";
export type AuditStatus = "DRAFT" | "SUBMITTED";
export type ActionStatus = "OPEN" | "AWAITING_VERIFICATION" | "VERIFIED";
export type ActionSource = "AUDIT" | "MANUAL";
export type ActionEventType =
  | "CREATED"
  | "ASSIGNED"
  | "DUE_DATE_CHANGED"
  | "UPDATED"
  | "SUBMITTED_FOR_VERIFICATION"
  | "VERIFIED"
  | "RETURNED_FOR_REWORK";
export type RedTagReason = "UNNECESSARY" | "OBSOLETE" | "DAMAGED" | "EXCESS" | "UNIDENTIFIED";
export type RedTagDecision = "RETAIN" | "RELOCATE" | "REPAIR" | "RECYCLE" | "DISPOSE";
export type RedTagStatus = "PENDING" | "DECIDED" | "RESOLVED";
export type StandardStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";
export type RoutineCategory = "ARRANGEMENT" | "CLEANING" | "INSPECTION" | "RETURN_ITEMS";
export type RoutineFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type RoutineOutcome = "DONE" | "DONE_WITH_EXCEPTION" | "NOT_DONE";
export type OccurrenceState = "DONE" | "DONE_WITH_EXCEPTION" | "NOT_DONE" | "MISSED" | "DUE_TODAY" | "UPCOMING";
export type Responsibility = "ADMIN" | "AUDITOR" | "VERIFIER" | "VIEWER";
export type AuditDueState = "NEVER_AUDITED" | "OVERDUE" | "DUE_SOON" | "ON_TRACK";
export type AreaStatusFilter = "active" | "inactive" | "all";

export const AUDIT_FREQUENCY_LABELS: Record<AuditFrequency, string> = {
  WEEKLY: "Weekly",
  FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  OPEN: "Open",
  AWAITING_VERIFICATION: "Awaiting verification",
  VERIFIED: "Verified",
};

export const ACTION_EVENT_LABELS: Record<ActionEventType, string> = {
  CREATED: "Created",
  ASSIGNED: "Owner changed",
  DUE_DATE_CHANGED: "Due date changed",
  UPDATED: "Details updated",
  SUBMITTED_FOR_VERIFICATION: "Submitted for verification",
  VERIFIED: "Verified",
  RETURNED_FOR_REWORK: "Returned for rework",
};

export const RED_TAG_REASONS: RedTagReason[] = ["UNNECESSARY", "OBSOLETE", "DAMAGED", "EXCESS", "UNIDENTIFIED"];
export const RED_TAG_REASON_LABELS: Record<RedTagReason, string> = {
  UNNECESSARY: "Unnecessary",
  OBSOLETE: "Obsolete",
  DAMAGED: "Damaged",
  EXCESS: "Excess",
  UNIDENTIFIED: "Unidentified",
};

export const RED_TAG_DECISIONS: RedTagDecision[] = ["RETAIN", "RELOCATE", "REPAIR", "RECYCLE", "DISPOSE"];
export const RED_TAG_DECISION_LABELS: Record<RedTagDecision, string> = {
  RETAIN: "Retain",
  RELOCATE: "Relocate",
  REPAIR: "Repair",
  RECYCLE: "Recycle",
  DISPOSE: "Dispose",
};

export const RED_TAG_STATUS_LABELS: Record<RedTagStatus, string> = {
  PENDING: "Pending review",
  DECIDED: "Decided, disposition pending",
  RESOLVED: "Resolved",
};

export const STANDARD_STATUS_LABELS: Record<StandardStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved (current)",
  SUPERSEDED: "Superseded",
};

export const ROUTINE_CATEGORY_LABELS: Record<RoutineCategory, string> = {
  ARRANGEMENT: "Arrangement",
  CLEANING: "Cleaning",
  INSPECTION: "Inspection",
  RETURN_ITEMS: "Return items",
};

export const ROUTINE_FREQUENCY_LABELS: Record<RoutineFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

export const ROUTINE_OUTCOME_LABELS: Record<RoutineOutcome, string> = {
  DONE: "Done",
  DONE_WITH_EXCEPTION: "Done with exception",
  NOT_DONE: "Not done",
};

export const OCCURRENCE_STATE_LABELS: Record<OccurrenceState, string> = {
  DONE: "Done",
  DONE_WITH_EXCEPTION: "Done with exception",
  NOT_DONE: "Not done",
  MISSED: "Missed",
  DUE_TODAY: "Due today",
  UPCOMING: "Upcoming",
};

export const RESPONSIBILITIES: Responsibility[] = ["ADMIN", "AUDITOR", "VERIFIER", "VIEWER"];
export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  ADMIN: "5S administrator",
  AUDITOR: "5S auditor",
  VERIFIER: "5S verifier / red-tag reviewer",
  VIEWER: "Management viewer",
};

export const AUDIT_DUE_LABELS: Record<AuditDueState, string> = {
  NEVER_AUDITED: "Never audited",
  OVERDUE: "Audit overdue",
  DUE_SOON: "Audit due soon",
  ON_TRACK: "On schedule",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type Person = { id: string; name: string };
export type PracticePoints = Record<Practice, number>;

export type Capabilities = {
  isModuleAdmin: boolean;
  seesWholeCompany: boolean;
  canCreateAreas: boolean;
  isAuditor: boolean;
  isVerifier: boolean;
  responsibilities: Responsibility[];
  role: string;
  employeeId: string;
  departmentId: string | null;
  today: string;
};

export type Directory = {
  employees: (Person & { departmentId: string | null; jobTitle: string | null; employeeCode: string | null })[];
  departments: { id: string; name: string }[];
};

export type AuditResult = {
  id: string;
  reference: string;
  auditDate: string;
  auditor: Person | null;
  points: PracticePoints;
  totalPoints: number;
  level: number;
  targetLevel: number | null;
  targetMet: boolean | null;
  submittedAt: string | null;
};

export type AreaSummary = {
  id: string;
  name: string;
  isActive: boolean;
  isSample: boolean;
  department: { id: string; name: string } | null;
  owner: Person | null;
  auditFrequency: AuditFrequency;
  targetLevel: number;
  // null = Not assessed.
  latest: AuditResult | null;
  targetMet: boolean | null;
  auditDue: { state: AuditDueState; nextDueDate: string | null };
  counts: { openActions: number; overdueActions: number; awaitingVerification: number; noDueDate: number; pendingRedTags: number };
};

export type AreaDetail = AreaSummary & {
  description: string | null;
  auditBoundary: string | null;
  createdAt: string;
  updatedAt: string;
  method: string;
  history: AuditResult[];
  otherMethodAuditCount: number;
  outstandingActions: {
    id: string;
    reference: string;
    practice: Practice;
    finding: string;
    status: ActionStatus;
    dueDate: string | null;
    checkpointNo: number | null;
    owner: Person | null;
  }[];
  drafts: { id: string; reference: string; auditDate: string | null; updatedAt: string; auditor: Person | null; answered: number }[];
  approvedStandards: number;
  activeRoutines: number;
  permissions: { canEdit: boolean; canAudit: boolean; canMaintainStandards: boolean; canCoordinate: boolean };
};

export type AreaPayload = {
  name: string;
  departmentId?: string | null;
  ownerId?: string | null;
  description?: string | null;
  auditBoundary?: string | null;
  auditFrequency: AuditFrequency;
  targetLevel: number;
};

export type UpdateAreaPayload = Partial<AreaPayload> & { isActive?: boolean };

export type AuditResultBlock = {
  points: PracticePoints;
  totalPoints: number;
  level: number;
  targetLevel: number | null;
  targetMet: boolean | null;
};

export type AuditListItem = {
  id: string;
  reference: string;
  status: AuditStatus;
  method: string;
  auditDate: string;
  area: { id: string; name: string };
  auditor: Person | null;
  answered: number;
  checkpointCount: number;
  actionCount: number;
  updatedAt: string;
  submittedAt: string | null;
  result: AuditResultBlock | null;
};

export type AuditCheckpoint = {
  no: number;
  practice: Practice;
  text: string;
  locationCount: number | null;
  affectedLocations: string | null;
  remark: string | null;
  photoUrls: string[];
  action: { id: string; reference: string; status: ActionStatus; dueDate: string | null; owner: Person | null } | null;
};

export type AuditDetail = {
  id: string;
  reference: string;
  status: AuditStatus;
  template: string;
  method: string;
  auditDate: string;
  area: { id: string; name: string; isActive: boolean };
  auditor: Person | null;
  auditee: Person | null;
  auditeeName: string | null;
  auditBoundary: string | null;
  remarks: string | null;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  submittedBy: Person | null;
  currentTargetLevel: number;
  checkpoints: AuditCheckpoint[];
  progress: {
    answered: number;
    total: number;
    unanswered: number[];
    pointsByPractice: { practice: Practice; label: string; points: number }[];
  };
  result: (AuditResultBlock & { deductionSteps: number }) | null;
  permissions: { canEdit: boolean; canSubmit: boolean };
};

export type CreateAuditPayload = {
  areaId: string;
  auditDate: string;
  auditorId?: string;
  auditeeId?: string | null;
  auditeeName?: string | null;
  auditBoundary?: string | null;
};

export type UpdateAuditPayload = Partial<Omit<CreateAuditPayload, "areaId">> & { remarks?: string | null; photoUrls?: string[] };

export type AuditResponsePayload = {
  checkpointNo: number;
  locationCount?: number | null;
  affectedLocations?: string | null;
  remark?: string | null;
  photoUrls?: string[];
};

export type FiveSFilters = { areaId?: string; departmentId?: string; ownerId?: string; from?: string; to?: string };

export type AuditListQuery = FiveSFilters & { status?: AuditStatus; auditorId?: string };

export type ActionView = {
  id: string;
  reference: string;
  source: ActionSource;
  area: { id: string; name: string };
  audit: { id: string; reference: string; auditDate: string | null } | null;
  checkpointNo: number | null;
  checkpointText: string | null;
  practice: Practice;
  practiceLabel: string;
  locationCount: number | null;
  finding: string;
  correctiveActions: CorrectiveActionView[];
  correctiveActionProgress: { done: number; total: number };
  owner: Person | null;
  dueDate: string | null;
  isOverdue: boolean;
  status: ActionStatus;
  completionDescription: string | null;
  completionEvidenceUrls: string[];
  submittedAt: string | null;
  verifiedBy: Person | null;
  verifiedAt: string | null;
  verificationRemarks: string | null;
  createdBy: Person | null;
  createdAt: string;
  updatedAt: string;
  permissions: {
    canPlan: boolean;
    canEditText: boolean;
    canSubmit: boolean;
    canVerify: boolean;
    allStepsDone: boolean;
    canManageSteps: boolean;
  };
};

export type CorrectiveActionView = {
  id: string;
  description: string;
  owner: Person | null;
  dueDate: string | null;
  isOverdue: boolean;
  completedAt: string | null;
  completedBy: Person | null;
  canComplete: boolean;
};

export type CorrectiveActionPayload = { description: string; ownerId?: string | null; dueDate?: string | null };

export type UpdateCorrectiveActionPayload = Partial<CorrectiveActionPayload> & { done?: boolean };

export type ActionDetail = ActionView & {
  history: {
    id: string;
    type: ActionEventType;
    note: string | null;
    fromValue: string | null;
    toValue: string | null;
    createdAt: string;
    actor: Person | null;
  }[];
};

export type ActionListView = "overdue" | "no_due_date" | "mine" | "to_verify";
export type ActionListQuery = FiveSFilters & { status?: ActionStatus; view?: ActionListView; auditId?: string; practice?: Practice };

export type CreateActionPayload = {
  areaId: string;
  practice: Practice;
  finding: string;
  correctiveActions?: CorrectiveActionPayload[];
  ownerId?: string | null;
  dueDate?: string | null;
};

export type UpdateActionPayload = {
  finding?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  note?: string;
};

export type RedTagView = {
  id: string;
  reference: string;
  area: { id: string; name: string };
  itemName: string;
  location: string;
  quantity: string | null;
  reason: RedTagReason;
  reasonDetails: string | null;
  owner: Person | null;
  raisedBy: Person | null;
  raisedOn: string;
  reviewDueDate: string | null;
  reviewOverdue: boolean;
  photoUrls: string[];
  status: RedTagStatus;
  isPending: boolean;
  decision: RedTagDecision | null;
  decisionLabel: string | null;
  decisionNotes: string | null;
  approvalReference: string | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  resolutionDetails: string | null;
  resolvedBy: Person | null;
  resolvedOn: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: { canEdit: boolean; canDecide: boolean; canResolve: boolean };
};

export type RedTagListQuery = FiveSFilters & { status?: RedTagStatus; view?: "pending" | "review_overdue" };

export type CreateRedTagPayload = {
  areaId: string;
  itemName: string;
  location: string;
  quantity?: string | null;
  reason: RedTagReason;
  reasonDetails?: string | null;
  ownerId?: string | null;
  raisedOn: string;
  reviewDueDate?: string | null;
  photoUrls?: string[];
};

export type UpdateRedTagPayload = Partial<Omit<CreateRedTagPayload, "areaId" | "raisedOn">>;

export type StandardView = {
  id: string;
  seriesId: string;
  revision: number;
  title: string;
  instructions: string;
  referenceUrls: string[];
  status: StandardStatus;
  isCurrent: boolean;
  changeNote: string | null;
  area: { id: string; name: string };
  owner: Person | null;
  approvedBy: Person | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: { canEdit: boolean; canApprove: boolean; canRevise: boolean };
};

export type StandardDetail = StandardView & {
  currentApprovedId: string | null;
  hasOpenDraft: boolean;
  revisions: {
    id: string;
    revision: number;
    status: StandardStatus;
    changeNote: string | null;
    approvedAt: string | null;
    createdAt: string;
    approvedBy: Person | null;
  }[];
};

export type StandardPayload = {
  areaId: string;
  title: string;
  instructions: string;
  ownerId?: string | null;
  referenceUrls?: string[];
  changeNote?: string | null;
};

export type RoutineView = {
  id: string;
  title: string;
  checkLocation: string;
  instructions: string | null;
  category: RoutineCategory;
  frequency: RoutineFrequency;
  startDate: string;
  isActive: boolean;
  area: { id: string; name: string };
  responsible: Person | null;
  createdAt: string;
  updatedAt: string;
  permissions: { canEdit: boolean; canRecord: boolean };
};

export type RoutineListItem = RoutineView & {
  latestOccurrence: { date: string; state: OccurrenceState } | null;
  missedLast40Days: number;
};

export type RoutineCompletion = {
  id: string;
  outcome: RoutineOutcome;
  exception: string | null;
  completedAt: string;
  completedBy: Person | null;
};

export type RoutineSchedule = {
  routine: RoutineView;
  from: string;
  to: string;
  today: string;
  occurrences: { date: string; state: OccurrenceState; completion: RoutineCompletion | null; canRecord: boolean }[];
  history: (RoutineCompletion & { scheduledDate: string })[];
};

export type RoutinePayload = {
  areaId: string;
  title: string;
  checkLocation: string;
  instructions?: string | null;
  category: RoutineCategory;
  frequency: RoutineFrequency;
  responsibleId?: string | null;
  startDate: string;
};

export type UpdateRoutinePayload = Partial<Omit<RoutinePayload, "areaId" | "startDate">> & { isActive?: boolean };

export type Overview = {
  today: string;
  method: string;
  historyRange: { from: string; to: string };
  areas: AreaSummary[];
  totals: {
    areas: number;
    assessed: number;
    notAssessed: number;
    targetMet: number;
    targetNotMet: number;
    openActions: number;
    overdueActions: number;
    awaitingVerification: number;
    actionsWithoutDueDate: number;
    pendingRedTags: number;
    auditsOverdue: number;
    auditsDueSoon: number;
    neverAudited: number;
  };
  crossAreaMean: { label: string; value: number | null; assessedAreas: number; excludedNotAssessed: number };
  auditHistory: (AuditResult & { area: { id: string; name: string } })[];
};

export type OverviewQuery = FiveSFilters & { status?: AreaStatusFilter };

// Conformance % = (20 − points) ÷ 20 per S: the same abnormality points, shown "higher is better".
export type AnalyticsProfile = {
  meanLevel: number | null;
  meanPoints: PracticePoints | null;
  conformance: PracticePoints | null;
  assessed: number;
};

export type DepartmentAnalytics = AnalyticsProfile & {
  key: string;
  id: string | null;
  name: string;
  areas: number;
  notAssessed: number;
  targetMet: number;
  audits: number;
  openActions: number;
  overdueActions: number;
  awaitingVerification: number;
  pendingRedTags: number;
  redTagsRaised: number;
};

export type Analytics = {
  today: string;
  method: string;
  range: { from: string; to: string };
  overall: AnalyticsProfile & { areas: number; audits: number; firstAudit: string | null };
  departments: DepartmentAnalytics[];
  areaProfiles: (AnalyticsProfile & {
    id: string;
    name: string;
    departmentKey: string;
    departmentName: string;
    auditDate: string;
    level: number;
    targetLevel: number;
    points: PracticePoints;
    totalPoints: number;
  })[];
  trend: { month: string; audits: number; meanLevel: number; meanTotalPoints: number; byDepartment: Record<string, number> }[];
  checkpoints: { no: number; practice: Practice; text: string; points: number; auditsWithFindings: number }[];
  redTags: {
    total: number;
    byReason: { key: RedTagReason; count: number }[];
    byStatus: { key: RedTagStatus; count: number }[];
    byDepartment: ({ key: string; name: string } & Record<RedTagStatus, number>)[];
  };
};

export type ResponsibilityRow = {
  id: string;
  responsibility: Responsibility;
  label: string;
  employee: Person | null;
  department: string | null;
  createdAt: string;
};

export type ChangeLogRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
  actor: Person | null;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const FiveSService = {
  capabilities: (token: string) => get<Capabilities>("/me/capabilities", token),
  directory: (token: string) => get<Directory>("/directory", token),
  overview: (params: OverviewQuery, token: string) => get<Overview>(`/overview${query(params)}`, token),
  analytics: (params: OverviewQuery, token: string) => get<Analytics>(`/analytics${query(params)}`, token),

  listAreas: (params: { departmentId?: string; ownerId?: string; status?: AreaStatusFilter }, token: string) =>
    get<AreaSummary[]>(`/areas${query(params)}`, token),
  getArea: (id: string, token: string) => get<AreaDetail>(`/areas/${id}`, token),
  createArea: (body: AreaPayload, token: string) => send<{ id: string; name: string }>("POST", "/areas", body, token),
  updateArea: (id: string, body: UpdateAreaPayload, token: string) =>
    send<{ id: string; name: string }>("PATCH", `/areas/${id}`, body, token),

  listAudits: (params: AuditListQuery, token: string) => get<AuditListItem[]>(`/audits${query(params)}`, token),
  getAudit: (id: string, token: string) => get<AuditDetail>(`/audits/${id}`, token),
  createAudit: (body: CreateAuditPayload, token: string) => send<{ id: string; reference: string }>("POST", "/audits", body, token),
  updateAudit: (id: string, body: UpdateAuditPayload, token: string) => send<AuditDetail>("PATCH", `/audits/${id}`, body, token),
  saveResponses: (id: string, responses: AuditResponsePayload[], token: string) =>
    send<AuditDetail>("PUT", `/audits/${id}/responses`, { responses }, token),
  submitAudit: (id: string, token: string) => send<AuditDetail>("POST", `/audits/${id}/submit`, {}, token),
  deleteAudit: (id: string, token: string) => send<{ deleted: boolean }>("DELETE", `/audits/${id}`, undefined, token),

  listActions: (params: ActionListQuery, token: string) => get<ActionView[]>(`/actions${query(params)}`, token),
  getAction: (id: string, token: string) => get<ActionDetail>(`/actions/${id}`, token),
  createAction: (body: CreateActionPayload, token: string) => send<{ id: string; reference: string }>("POST", "/actions", body, token),
  updateAction: (id: string, body: UpdateActionPayload, token: string) => send<ActionDetail>("PATCH", `/actions/${id}`, body, token),
  addCorrectiveAction: (id: string, body: CorrectiveActionPayload, token: string) =>
    send<ActionDetail>("POST", `/actions/${id}/corrective-actions`, body, token),
  updateCorrectiveAction: (id: string, stepId: string, body: UpdateCorrectiveActionPayload, token: string) =>
    send<ActionDetail>("PATCH", `/actions/${id}/corrective-actions/${stepId}`, body, token),
  removeCorrectiveAction: (id: string, stepId: string, token: string) =>
    send<ActionDetail>("DELETE", `/actions/${id}/corrective-actions/${stepId}`, undefined, token),
  submitAction: (id: string, body: { completionDescription: string; completionEvidenceUrls?: string[] }, token: string) =>
    send<ActionDetail>("POST", `/actions/${id}/submit`, body, token),
  verifyAction: (id: string, body: { outcome: "VERIFIED" | "REWORK"; remarks?: string }, token: string) =>
    send<ActionDetail>("POST", `/actions/${id}/verify`, body, token),

  listRedTags: (params: RedTagListQuery, token: string) => get<RedTagView[]>(`/red-tags${query(params)}`, token),
  getRedTag: (id: string, token: string) => get<RedTagView>(`/red-tags/${id}`, token),
  createRedTag: (body: CreateRedTagPayload, token: string) => send<{ id: string; reference: string }>("POST", "/red-tags", body, token),
  updateRedTag: (id: string, body: UpdateRedTagPayload, token: string) => send<RedTagView>("PATCH", `/red-tags/${id}`, body, token),
  decideRedTag: (id: string, body: { decision: RedTagDecision; decisionNotes?: string | null; approvalReference?: string | null }, token: string) =>
    send<RedTagView>("POST", `/red-tags/${id}/decision`, body, token),
  resolveRedTag: (id: string, body: { resolutionDetails: string; resolvedOn: string }, token: string) =>
    send<RedTagView>("POST", `/red-tags/${id}/resolve`, body, token),

  listStandards: (params: { areaId?: string; status?: StandardStatus; view?: "current" | "all" }, token: string) =>
    get<StandardView[]>(`/standards${query(params)}`, token),
  getStandard: (id: string, token: string) => get<StandardDetail>(`/standards/${id}`, token),
  createStandard: (body: StandardPayload, token: string) => send<{ id: string }>("POST", "/standards", body, token),
  updateStandard: (id: string, body: Partial<Omit<StandardPayload, "areaId">>, token: string) =>
    send<StandardDetail>("PATCH", `/standards/${id}`, body, token),
  approveStandard: (id: string, token: string) => send<StandardDetail>("POST", `/standards/${id}/approve`, {}, token),
  reviseStandard: (id: string, token: string) => send<StandardDetail>("POST", `/standards/${id}/revise`, {}, token),
  deleteStandardDraft: (id: string, token: string) => send<{ deleted: boolean }>("DELETE", `/standards/${id}`, undefined, token),

  listRoutines: (params: { areaId?: string; responsibleId?: string; status?: AreaStatusFilter }, token: string) =>
    get<RoutineListItem[]>(`/routines${query(params)}`, token),
  getRoutine: (id: string, token: string) => get<RoutineView>(`/routines/${id}`, token),
  routineSchedule: (id: string, params: { from?: string; to?: string }, token: string) =>
    get<RoutineSchedule>(`/routines/${id}/schedule${query(params)}`, token),
  createRoutine: (body: RoutinePayload, token: string) => send<{ id: string }>("POST", "/routines", body, token),
  updateRoutine: (id: string, body: UpdateRoutinePayload, token: string) => send<RoutineView>("PATCH", `/routines/${id}`, body, token),
  recordCompletion: (id: string, body: { scheduledDate: string; outcome: RoutineOutcome; exception?: string }, token: string) =>
    send<unknown>("POST", `/routines/${id}/completions`, body, token),

  responsibilities: (token: string) => get<ResponsibilityRow[]>("/settings/responsibilities", token),
  assignResponsibility: (body: { employeeId: string; responsibility: Responsibility }, token: string) =>
    send<{ id: string }>("POST", "/settings/responsibilities", body, token),
  removeResponsibility: (id: string, token: string) =>
    send<{ deleted: boolean }>("DELETE", `/settings/responsibilities/${id}`, undefined, token),
  changeLog: (params: { entityType?: string; entityId?: string; limit?: number }, token: string) =>
    get<ChangeLogRow[]>(`/settings/change-log${query(params)}`, token),
  sampleStatus: (token: string) => get<{ sampleAreas: number }>("/settings/sample-data", token),
  addSampleData: (token: string) => send<unknown>("POST", "/settings/sample-data", {}, token),
  removeSampleData: (token: string) => send<unknown>("DELETE", "/settings/sample-data", undefined, token),
};
