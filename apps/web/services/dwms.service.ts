import { apiClient } from "@/lib/api-client";

const API_URL = "/api";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const message =
      typeof error?.message === "string"
        ? error.message
        : Array.isArray(error?.message)
          ? error.message.join(", ")
          : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await apiClient(
    `${API_URL}${path}`,
    { headers: authHeaders(token) },
    token,
  );
  return handleResponse<T>(res);
}

async function sendJson<T>(
  path: string,
  token: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await apiClient(
    `${API_URL}${path}`,
    {
      method,
      headers: authHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    token,
  );
  return handleResponse<T>(res);
}

function buildQuery(
  params: Record<string, string | number | undefined | null>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function cleanDwmsMessage(
  message: string | null | undefined,
  fallback = "Something went wrong",
) {
  const raw = String(message ?? "").trim();
  if (!raw) return fallback;

  if (raw.includes("TaskStatus") && raw.includes("ACTIVE")) {
    return "Activity status was not compatible with the database. Please retry after the API server is restarted.";
  }
  if (raw.includes("Unique constraint") || raw.includes("P2002")) {
    return "A record with the same unique value already exists.";
  }

  const cleaned = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Invalid "))
    .filter((line) => !/^[^\w]*\d+\s/.test(line))
    .filter((line) => !line.startsWith("at "))
    .filter((line) => !/^[A-Z]:\\/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

export function getDwmsErrorMessage(error: unknown, fallback: string) {
  return cleanDwmsMessage(
    error instanceof Error ? error.message : null,
    fallback,
  );
}

export type DwmsApproverRule =
  | "ADMIN"
  | "MANAGEMENT"
  | "HOD"
  | "DIRECT_MANAGER"
  | "HIGHER_LEVEL_MANAGERS"
  | "OWNER"
  | "ANYONE"
  | "CUSTOM";
export type ViewLevel = "OWN" | "DEPARTMENT" | "ORGANIZATION";
export type DwmsTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "DONE"
  | "APPROVAL_PENDING"
  | "PARTLY_DONE"
  | "LESS_THAN_50"
  | "NOT_APPLICABLE"
  | "OVERDUE";
export type DwmsFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "PLANNED"
  | "ADHOC";
export type DwmsPriority = "MEDIUM" | "HIGH" | "CRITICAL";
export type DwmsSeverity = "MEDIUM" | "HIGH" | "CRITICAL";
export type DwmsAlertTargetType = "GENERAL" | "PERSON" | "TASK" | "DEPARTMENT";
export type DwmsAlertField =
  | "general"
  | "severity"
  | "title"
  | "description"
  | "target"
  | "task"
  | "person"
  | "department";

export interface DwmsEmployeeOption {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
  designation?: string | null;
  department?: DwmsDepartmentOption | null;
}

export interface DwmsDepartmentOption {
  id: string;
  name: string;
}

export interface DwmsUserRef {
  id: string;
  name: string;
  email: string;
}

export interface DwmsActivityItem {
  id: string;
  companyUnitName?: string | null;
  mainDepartmentId?: string | null;
  mainDepartment?: DwmsDepartmentOption | null;
  parentActivities?: Array<{
    id: string;
    name: string;
    code?: string | null;
    frequency?: DwmsFrequency | string | null;
    status?: string | null;
  }>;
  parentActivityIds?: string[];
  parentActivityId?: string | null;
  subDepartment?: string | null;
  gembaSection?: string | null;
  processArea?: string | null;
  name: string;
  workMethod?: string | null;
  code: string;
  purpose?: string | null;
  category?: string | null;
  frequency: DwmsFrequency;
  startTrigger?: string | null;
  completionDeadline?: string | null;
  completionOutput?: string | null;
  primaryResponsibleDesignation?: string | null;
  primaryResponsibleEmployeeId?: string | null;
  primaryResponsibleEmployee?: DwmsEmployeeOption | null;
  evidenceRequired?: string | null;
  effectiveFrom: string;
  status: "ACTIVE" | "ARCHIVED" | string;
  remarks?: string | null;
}

export type EmployeeActivityAssignmentStatus = "ACTIVE" | "INACTIVE";

export interface DwmsEmployeeRoleActivityItem {
  activity: DwmsActivityItem;
  status: EmployeeActivityAssignmentStatus;
  assignmentId?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
}

export interface DwmsEmployeeRoleActivitiesResponse {
  jobTitle: string | null;
  count: number;
  activities: DwmsEmployeeRoleActivityItem[];
}
export interface DwmsPaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
export interface DwmsEmployeeProfileResponse {
  employee?: {
    id: string;
    name: string;
    email?: string | null;
    employeeCode?: string | null;
    jobTitle?: string | null;
    department?: DwmsDepartmentOption | null;
  };
  counts?: {
    routineWork: number;
    assignedTasks: number;
    currentAlerts: number;
    abnormalities: number;
    applicableActivities: number;
    activeActivities: number;
  };
  pagination?: {
    routineWork: DwmsPaginationMeta;
    assignedTasks: DwmsPaginationMeta;
    currentAlerts: DwmsPaginationMeta;
    abnormalities: DwmsPaginationMeta;
  };
  routineWork?: DwmsTaskItem[];
  assignedTasks?: DwmsTaskItem[];
  currentAlerts?: DwmsAlertItem[];
  abnormalities?: DwmsAlertItem[];
  applicableActivities?: DwmsEmployeeRoleActivityItem[];
}
export interface DwmsSettingsResponse {
  approverRoles?: DwmsApproverRule[];
  approverCustomEmployeeIds?: string[];
  alertViewLevel?: ViewLevel;
  analyticsViewLevel?: ViewLevel;
  config?: DwmsSettingsResponse;
}

export interface DwmsSettingsState {
  approverRoles: DwmsApproverRule[];
  approverCustomEmployeeIds: string[];
  alertViewLevel: ViewLevel;
  analyticsViewLevel: ViewLevel;
}

export interface DwmsSettingsPayload {
  approverRoles: DwmsApproverRule[];
  approverCustomEmployeeIds: string[];
  alertViewLevel: ViewLevel;
  analyticsViewLevel: ViewLevel;
}

export interface DwmsAccessCapabilities {
  alertViewLevel: ViewLevel;
  analyticsViewLevel: ViewLevel;
  hasReportees: boolean;
}

export const DEFAULT_DWMS_SETTINGS: DwmsSettingsState = {
  approverRoles: ["MANAGEMENT"],
  approverCustomEmployeeIds: [],
  alertViewLevel: "OWN",
  analyticsViewLevel: "DEPARTMENT",
};
export const DWMS_APPROVER_RULE_OPTIONS: {
  value: DwmsApproverRule;
  label: string;
  description: string;
}[] = [
  {
    value: "MANAGEMENT",
    label: "Management",
    description: "Management can be selected as approver.",
  },
  {
    value: "HOD",
    label: "HOD",
    description: "Department heads can be selected as approver.",
  },
  {
    value: "DIRECT_MANAGER",
    label: "Assignee Manager",
    description:
      "The assignee's immediate manager can be selected as approver.",
  },
  {
    value: "HIGHER_LEVEL_MANAGERS",
    label: "Higher level Managers",
    description:
      "Managers above the direct manager can be selected as approver.",
  },
  {
    value: "ANYONE",
    label: "Anyone",
    description: "Any employee can be selected as approver.",
  },
  {
    value: "CUSTOM",
    label: "Custom Employee",
    description: "Specific employees can be selected as approver.",
  },
];

export const DWMS_VIEW_LEVEL_OPTIONS: {
  value: ViewLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "OWN",
    label: "Own",
    description: "Only personal items are visible.",
  },
  {
    value: "DEPARTMENT",
    label: "Department",
    description: "Department-level visibility.",
  },
  {
    value: "ORGANIZATION",
    label: "Organization",
    description: "Full organization visibility.",
  },
];

export interface DwmsTaskInstanceComment {
  id: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  author?: DwmsUserRef | null;
}

export interface DwmsTaskInstanceEvent {
  id: string;
  type: string;
  fromStatus?: DwmsTaskStatus | string | null;
  toStatus?: DwmsTaskStatus | string | null;
  note?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt: string;
  actor?: DwmsUserRef | null;
}

export interface DwmsTaskInstanceDetailResponse {
  access?: "full" | "relation";
  task: DwmsTaskItem;
  instance: {
    id: string;
    status: DwmsTaskStatus;
    completionPercent: number;
    scheduledFor: string;
    dueAt: string;
    completedAt?: string | null;
  };
  comments: DwmsTaskInstanceComment[];
  events: DwmsTaskInstanceEvent[];
  relatedTaskInstances?: Array<{
    activityId: string;
    instanceId: string;
    status: DwmsTaskStatus | string;
  }>;
  alerts?: Array<{
    id: string;
    title: string;
    description?: string | null;
    status: string;
    severity: string;
    createdAt: string;
    resolvedAt?: string | null;
  }>;
}

export interface DwmsTaskItem {
  instanceId: string;
  taskId: string;
  title: string;
  description?: string | null;
  status: DwmsTaskStatus;
  dueAt: string;
  frequency: DwmsFrequency;
  organizationTimeZone: string;
  owner: DwmsUserRef;
  assignedBy?: DwmsUserRef | null;
  approvedBy?: DwmsUserRef | null;
  acknowledgedAt: string | null;
  completionPercent: number;
  scheduledFor: string;
  completedAt?: string | null;
  completionNote?: string | null;
  completionAttachmentUrl?: string | null;
  completionAttachmentName?: string | null;
  requiresCompletionDocument?: boolean;
  completionDocumentName?: string | null;
  prerequisiteBlocked?: boolean;
  prerequisiteActivityNames?: string[];
  comments?: DwmsTaskInstanceComment[];
  events?: DwmsTaskInstanceEvent[];
  isOverdue: boolean;
  wasOverdue?: boolean;
  taskCreatedAt?: string;
  taskUpdatedAt?: string;
  instanceCreatedAt?: string;
  instanceUpdatedAt?: string;
  isAdhoc: boolean;
  priority?: DwmsPriority | string | null;
  department?: DwmsDepartmentOption | null;
  activity?: DwmsActivityItem | null;
  task?: { title: string };
}

export interface DwmsTaskListResponse {
  date?: string;
  organizationTimeZone?: string;
  tasks?: DwmsTaskItem[];
  count?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DwmsAssignedTaskListResponse {
  tasks?: DwmsAssignedTaskHistoryItem[];
}

export interface DwmsAssignedTaskHistoryItem {
  id: string;
  instanceId: string;
  taskId: string;
  title: string;
  description?: string | null;
  frequency?: DwmsFrequency | string;
  organizationTimeZone?: string | null;
  priority?: DwmsPriority | string | null;
  status: DwmsTaskStatus;
  completionPercent?: number;
  scheduledFor?: string;
  dueAt?: string;
  dueDate: string;
  completedAt?: string | null;
  ownerName?: string | null;
  assignedByName?: string | null;
  approvedByName?: string | null;
  owner?: { id?: string; name?: string | null; email?: string | null } | null;
  assignedBy?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  approvedBy?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  acknowledgedAt?: string | null;
  completionNote?: string | null;
  completionAttachmentUrl?: string | null;
  completionAttachmentName?: string | null;
  requiresCompletionDocument?: boolean;
  completionDocumentName?: string | null;
  isOverdue?: boolean;
  wasOverdue?: boolean;
  isAdhoc?: boolean;
}

export interface DwmsAlertListResponse {
  alerts?: DwmsAlertItem[];
  employeeId?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export type DwmsAlertListTab =
  | "MY_ALERTS"
  | "TEAM_ALERTS"
  | "MY_ABNORMALITIES"
  | "TEAM_ABNORMALITIES"
  | "DEPARTMENTAL"
  | "ORGANISATIONAL"
  | "OPENED_BY_ME";

export interface DwmsAlertListParams {
  tab: DwmsAlertListTab;
  page?: number;
  limit?: number;
  severity?: string;
  search?: string;
}

export interface DwmsTargetUsersResponse {
  users?: DwmsEmployeeOption[];
  departments?: DwmsDepartmentOption[];
  tasks?: DwmsAlertTargetTask[];
}

export interface DwmsAlertTargetTask {
  instanceId: string;
  ownerId: string;
  title: string;
  ownerName: string;
  ownerEmail: string;
  status: DwmsTaskStatus;
  dueAt: string;
  frequency: DwmsFrequency;
}

export interface DwmsDashboardTrendPoint {
  date?: string;
  label?: string;
  value?: number;
  completionRate?: number;
  avgAcknowledgeTimeMin?: number;
  completed?: number;
  total?: number;
  allTasks?: number;
  completedTasks?: number;
  notCompletedTasks?: number;
  overdueTasks?: number;
  alertsCount?: number;
  completedOnTimeRate?: number;
}

export interface DwmsDashboardMetrics {
  completionRate: number;
  totalTasks?: number;
  completedTasks?: number;
  overdueTasks?: number;
  pendingTasks?: number;
  overdueCount?: number;
  completedCount?: number;
  tasksPerformedTodayPercent?: number;
  alertsCount?: number;
  completedOnTimeRate?: number | null;
  avgAcknowledgeTimeMin?: number;
  avgCloseTimeMin?: number;
}

export interface DwmsEmployeeScore extends DwmsDashboardMetrics {
  id: string;
  name: string;
  email: string;
  department?: string;
  departmentName?: string;
  role: string;
}

export interface DwmsDashboardTrends {
  tasksPerformedToday?: DwmsDashboardTrendPoint[];
  timeToAcknowledge?: DwmsDashboardTrendPoint[];
  timeToClose?: DwmsDashboardTrendPoint[];
  pendingAlertAcknowledgments?: DwmsDashboardTrendPoint[];
}

export interface DwmsOverviewDashboardResponse {
  summary?: DwmsDashboardMetrics;
  trends?: DwmsDashboardTrends;
  departmentCompliance?: Array<DwmsDashboardMetrics & DwmsDepartmentOption>;
  employeeScoreboard?: DwmsEmployeeScore[];
}

export interface DwmsDepartmentDashboardResponse {
  summary?: DwmsDashboardMetrics;
  trends?: DwmsDashboardTrends;
  departmentName: string;
  employeeScoreboard?: DwmsEmployeeScore[];
}

export interface DwmsEmployeeDashboardResponse {
  summary?: DwmsDashboardMetrics;
  trends?: DwmsDashboardTrends;
  employee: (DwmsUserRef & { role: string; departmentName: string }) | null;
  reporteesPerformance?: DwmsEmployeeScore[];
}

export interface DwmsAlertItem {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: DwmsSeverity | string;
  raiseCount: number;
  pendingAcknowledgments: number;
  occurrences: Array<{
    id: string;
    raisedAt: string;
    raisedBy?: DwmsUserRef | null;
    acknowledgedAt?: string | null;
    acknowledgmentNote?: string | null;
    acknowledgedBy?: DwmsUserRef | null;
  }>;
  responsibleEmployee?: DwmsUserRef | null;
  createdAt: string;
  updatedAt?: string;
  isAbnormality?: boolean;
  raisedBy?: { id: string; name: string; email: string } | null;
  taskInstance?: {
    id: string;
    task: { title: string };
    owner?: {
      id: string;
      name: string;
      email: string;
      reportingToId: string | null;
    };
  } | null;
  againstUser?: { id: string; name: string; email: string } | null;
  department?: { id: string; name: string } | null;
  departmentId?: string | null;
  againstUserId?: string | null;
  taskInstanceId?: string | null;
}

export interface DwmsAlertComment {
  id: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  author?: DwmsUserRef | null;
}

export interface DwmsAlertDetailResponse {
  alert: DwmsAlertItem;
  employeeId?: string;
  comments: DwmsAlertComment[];
}
export interface CreateDwmsAlertPayload {
  type?: string;
  severity: string;
  title: string;
  description: string;
  targetType: DwmsAlertTargetType;
  taskInstanceId?: string | null;
  againstUserId?: string | null;
  departmentId?: string | null;
}

export interface CreateAssignedTaskPayload {
  activityId?: string | null;
  title: string;
  description?: string | null;
  assignedToId: string;
  dueDate?: string | null;
  frequency?: string;
  priority?: string;
  approvedById?: string | null;
  backupOwnerId?: string | null;
  requiresCompletionDocument?: boolean;
  completionDocumentName?: string | null;
  isAdhoc?: boolean;
}

export interface CreateTaskFromActivityPayload {
  assignedToId?: string | null;
  dueDate?: string | null;
  frequency?: string;
  priority?: string;
  approvedById?: string | null;
  backupOwnerId?: string | null;
}

export interface CreateActivityPayload {
  mainDepartmentId?: string | null;
  subDepartment?: string | null;
  name: string;
  workMethod: string;
  code?: string | null;
  completionDeadline?: number | null;
  purpose?: string | null;
  frequency: string;
  completionOutput?: string | null;
  primaryResponsibleDesignation?: string | null;
  parentActivityIds?: string[];
  parentActivityId?: string | null;
  evidenceRequired?: string | null;
  effectiveFrom?: string;
  status?: string;
}

export interface IngestActivityRowPayload {
  rowNumber?: number;
  assignmentMode?: ActivityIngestionAssignmentMode;
  responsibleEmployeeCode?: string;
  parentActivityCode?: string | null;
  activity: CreateActivityPayload;
}

export type DwmsTaskListScope =
  | "scheduled"
  | "future"
  | "not_acknowledged"
  | "pending"
  | "overdue"
  | "approval_pending"
  | "completed";

export type DwmsTaskSource = "routine" | "assigned";

export interface DwmsTaskSummaryResponse {
  tabs?: {
    all: number;
    overdue: number;
    approvalPending: number;
    completed: number;
    notAcknowledged: number;
    pending: number;
  };
}

export enum ActivityIngestionAssignmentMode {
  INDIVIDUAL = "Individual",
  JOB_ROLE = "Job Role",
  ALL_USERS = "All Users",
  ALL_MANAGEMENT = "All Management",
  ALL_HOD = "All HOD",
}

export interface DwmsActivityIngestionSummary {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  createdAt: string;
  completedAt?: string | null;
  uploadedBy?: DwmsUserRef | null;
}

export interface DwmsActivityIngestionRow {
  id: string;
  rowNumber: number;
  status: string;
  activityName?: string | null;
  activityCode?: string | null;
  responsibleEmployeeCode?: string | null;
  responsibleJobRole?: string | null;
  message?: string | null;
  activityId?: string | null;
  taskId?: string | null;
  createdAt: string;
}

export interface IngestActivitiesResponse {
  message: string;
  ingestion?: DwmsActivityIngestionSummary;
  count: number;
  created: number;
  failed: number;
  results: Array<{
    rowNumber: number;
    success: boolean;
    activityId?: string;
    taskId?: string;
    responsibleEmployeeId?: string;
    assignedCount?: number;
    message: string;
  }>;
}

export interface UpdateTaskStatusPayload {
  status?: "ACTIVE" | "ARCHIVED" | string;
  completionPercent: number;
  completionNote?: string | null;
  completionAttachmentUrl?: string | null;
  completionAttachmentName?: string | null;
}

export function toDwmsSettingsState(
  input?: DwmsSettingsResponse | null,
): DwmsSettingsState {
  const config = input?.config ?? input ?? {};
  return {
    ...DEFAULT_DWMS_SETTINGS,
    ...config,
    approverRoles: config.approverRoles?.length
      ? ["OWNER", ...config.approverRoles.filter((rule) => rule !== "OWNER")]
      : ["OWNER"],
    approverCustomEmployeeIds: config.approverCustomEmployeeIds ?? [],
    alertViewLevel:
      config.alertViewLevel ?? DEFAULT_DWMS_SETTINGS.alertViewLevel,
  };
}
export function toDwmsSettingsPayload(
  settings: DwmsSettingsState,
): DwmsSettingsPayload {
  return {
    approverRoles: [
      "OWNER",
      ...settings.approverRoles.filter((rule) => rule !== "OWNER"),
    ],
    approverCustomEmployeeIds: settings.approverRoles.includes("CUSTOM")
      ? settings.approverCustomEmployeeIds
      : [],
    alertViewLevel: settings.alertViewLevel,
    analyticsViewLevel: settings.analyticsViewLevel,
  };
}

export const DwmsService = {
  async getAccessCapabilities(token: string): Promise<DwmsAccessCapabilities> {
    return getJson<DwmsAccessCapabilities>("/dwms/access", token);
  },

  async getSettings(token: string): Promise<DwmsSettingsState> {
    const data = await getJson<DwmsSettingsResponse>("/dwms/settings", token);
    return toDwmsSettingsState(data);
  },

  async updateSettings(
    token: string,
    body: DwmsSettingsPayload,
  ): Promise<DwmsSettingsState> {
    const data = await sendJson<DwmsSettingsResponse>(
      "/dwms/settings",
      token,
      "PATCH",
      body,
    );
    return toDwmsSettingsState(data);
  },

  async listUsers(token: string): Promise<DwmsEmployeeOption[]> {
    const data = await getJson<{ users?: DwmsEmployeeOption[] }>(
      "/dwms/users",
      token,
    );
    return data.users ?? [];
  },

  async getDepartments(token: string): Promise<DwmsDepartmentOption[]> {
    const data = await getJson<
      Array<DwmsDepartmentOption & { _count?: unknown }>
    >("/departments", token);
    return data.map((department) => ({
      id: department.id,
      name: department.name,
    }));
  },

  async getDashboardOverview(
    token: string,
    days: number,
  ): Promise<DwmsOverviewDashboardResponse> {
    return getJson<DwmsOverviewDashboardResponse>(
      `/dwms/dashboard/overview${buildQuery({ days })}`,
      token,
    );
  },

  async getDashboardDepartment(
    token: string,
    deptId: string,
    days: number,
  ): Promise<DwmsDepartmentDashboardResponse> {
    return getJson<DwmsDepartmentDashboardResponse>(
      `/dwms/dashboard/department/${encodeURIComponent(deptId)}${buildQuery({ days })}`,
      token,
    );
  },

  async getDashboardEmployee(
    token: string,
    empId: string,
    days: number,
  ): Promise<DwmsEmployeeDashboardResponse> {
    return getJson<DwmsEmployeeDashboardResponse>(
      `/dwms/dashboard/employee/${encodeURIComponent(empId)}${buildQuery({ days })}`,
      token,
    );
  },

  async getAlerts(
    token: string,
    params: DwmsAlertListParams,
  ): Promise<DwmsAlertListResponse> {
    return getJson<DwmsAlertListResponse>(
      `/dwms/alerts${buildQuery({
        tab: params.tab,
        page: params.page,
        limit: params.limit,
        severity: params.severity,
        search: params.search,
      })}`,
      token,
    );
  },

  async getAlertTargets(token: string): Promise<DwmsTargetUsersResponse> {
    return getJson<DwmsTargetUsersResponse>("/dwms/alerts/targets", token);
  },

  async createAlert(
    token: string,
    body: CreateDwmsAlertPayload,
  ): Promise<{ alert: DwmsAlertItem }> {
    return sendJson("/dwms/alerts", token, "POST", body);
  },

  async getAlertHistories(
    token: string,
    targetType: DwmsAlertTargetType,
    targetId: string,
  ): Promise<{ alerts: DwmsAlertItem[] }> {
    return getJson(
      `/dwms/alerts/history/${encodeURIComponent(targetId)}${buildQuery({ targetType })}`,
      token,
    );
  },

  async raiseAlertAgain(
    token: string,
    alertId: string,
  ): Promise<{ alert: DwmsAlertItem }> {
    return sendJson(
      `/dwms/alerts/${encodeURIComponent(alertId)}/raise-again`,
      token,
      "POST",
    );
  },

  async acknowledgeAlertOccurrence(
    token: string,
    alertId: string,
    occurrenceId: string,
    note: string,
  ): Promise<unknown> {
    return sendJson(
      `/dwms/alerts/${encodeURIComponent(alertId)}/occurrences/${encodeURIComponent(occurrenceId)}/acknowledge`,
      token,
      "POST",
      { note },
    );
  },

  async getAlertDetail(
    token: string,
    alertId: string,
  ): Promise<DwmsAlertDetailResponse> {
    return getJson(`/dwms/alerts/${encodeURIComponent(alertId)}`, token);
  },

  async addAlertComment(
    token: string,
    alertId: string,
    comment: string,
  ): Promise<{ comment?: DwmsAlertComment }> {
    return sendJson(
      `/dwms/alerts/${encodeURIComponent(alertId)}/comments`,
      token,
      "POST",
      { comment },
    );
  },

  async getAssignedTasksByMe(
    token: string,
  ): Promise<DwmsAssignedTaskListResponse> {
    return getJson<DwmsAssignedTaskListResponse>(
      "/dwms/assignedTasks/byMe",
      token,
    );
  },

  async getApprovalTasks(
    token: string,
    status: "pending" | "approved" | "rejected" = "pending",
  ): Promise<DwmsAssignedTaskListResponse> {
    return getJson<DwmsAssignedTaskListResponse>(
      `/dwms/approvalTasks${buildQuery({ status })}`,
      token,
    );
  },

  async approveTask(
    token: string,
    instanceId: string,
    body?: { comment?: string | null },
  ): Promise<unknown> {
    return sendJson(
      `/dwms/approvalTasks/${encodeURIComponent(instanceId)}/approve`,
      token,
      "PATCH",
      body,
    );
  },

  async rejectTask(
    token: string,
    instanceId: string,
    body?: { comment?: string | null },
  ): Promise<unknown> {
    return sendJson(
      `/dwms/approvalTasks/${encodeURIComponent(instanceId)}/reject`,
      token,
      "PATCH",
      body,
    );
  },

  async getReportees(token: string): Promise<{ users?: DwmsEmployeeOption[] }> {
    return getJson("/dwms/users/reportees", token);
  },

  async getApprovers(
    token: string,
    assignedToId: string,
  ): Promise<{ users?: DwmsEmployeeOption[] }> {
    return getJson(
      `/dwms/users/approvers${buildQuery({ assignedToId })}`,
      token,
    );
  },

  async getActivities(
    token: string,
    status?: DwmsTaskStatus | string,
  ): Promise<{ activities?: DwmsActivityItem[] }> {
    return getJson(`/dwms/activities${buildQuery({ status })}`, token);
  },

  async createActivity(
    token: string,
    body: CreateActivityPayload,
  ): Promise<{ activity?: DwmsActivityItem }> {
    return sendJson("/dwms/activities", token, "POST", body);
  },

  async ingestActivities(
    token: string,
    rows: IngestActivityRowPayload[],
    fileName?: string,
  ): Promise<IngestActivitiesResponse> {
    return sendJson("/dwms/activities/ingest", token, "POST", {
      fileName,
      rows,
    });
  },

  async getActivityIngestions(
    token: string,
  ): Promise<{ ingestions?: DwmsActivityIngestionSummary[] }> {
    return getJson("/dwms/activities/ingestions", token);
  },

  async getActivityIngestion(
    token: string,
    ingestionId: string,
  ): Promise<{
    ingestion?: DwmsActivityIngestionSummary;
    rows?: DwmsActivityIngestionRow[];
  }> {
    return getJson(
      `/dwms/activities/ingestions/${encodeURIComponent(ingestionId)}`,
      token,
    );
  },

  async updateActivity(
    token: string,
    activityId: string,
    body: Partial<CreateActivityPayload>,
  ): Promise<{ activity?: DwmsActivityItem }> {
    return sendJson(
      `/dwms/activities/${encodeURIComponent(activityId)}`,
      token,
      "PATCH",
      body,
    );
  },

  async archiveActivity(token: string, activityId: string): Promise<unknown> {
    return sendJson(
      `/dwms/activities/${encodeURIComponent(activityId)}/archive`,
      token,
      "PATCH",
    );
  },

  async getEmployeeDwmsProfile(
    token: string,
    employeeId: string,
    pages?: {
      routinePage?: number;
      assignedPage?: number;
      currentAlertPage?: number;
      abnormalityPage?: number;
    },
  ): Promise<DwmsEmployeeProfileResponse> {
    const query = new URLSearchParams();
    if (pages?.routinePage) query.set("routinePage", String(pages.routinePage));
    if (pages?.assignedPage)
      query.set("assignedPage", String(pages.assignedPage));
    if (pages?.currentAlertPage) {
      query.set("currentAlertPage", String(pages.currentAlertPage));
    }
    if (pages?.abnormalityPage) {
      query.set("abnormalityPage", String(pages.abnormalityPage));
    }
    const queryString = query.toString();
    return getJson(
      `/dwms/employees/${encodeURIComponent(employeeId)}/profile${queryString ? `?${queryString}` : ""}`,
      token,
    );
  },
  async getEmployeeRoleActivities(
    token: string,
    employeeId: string,
  ): Promise<DwmsEmployeeRoleActivitiesResponse> {
    return getJson(
      `/dwms/employees/${encodeURIComponent(employeeId)}/activities`,
      token,
    );
  },

  async updateEmployeeActivityStatus(
    token: string,
    employeeId: string,
    activityId: string,
    status: EmployeeActivityAssignmentStatus,
  ): Promise<{ item?: DwmsEmployeeRoleActivityItem; message?: string }> {
    return sendJson(
      `/dwms/employees/${encodeURIComponent(employeeId)}/activities/${encodeURIComponent(activityId)}`,
      token,
      "PATCH",
      { status },
    );
  },
  async createAssignedTask(
    token: string,
    body: CreateAssignedTaskPayload,
  ): Promise<unknown> {
    return sendJson("/dwms/assignedTasks", token, "POST", body);
  },

  async createTaskFromActivity(
    token: string,
    activityId: string,
    body: CreateTaskFromActivityPayload,
  ): Promise<unknown> {
    return sendJson(
      `/dwms/activities/${encodeURIComponent(activityId)}/tasks`,
      token,
      "POST",
      body,
    );
  },

  async getTodayTasks(
    token: string,
    date?: string,
    scope?: DwmsTaskListScope,
    page?: number,
    limit?: number,
    source?: DwmsTaskSource,
  ): Promise<DwmsTaskListResponse> {
    return getJson(
      `/dwms/myDwms/tasks${buildQuery({ date, scope, page, limit, source })}`,
      token,
    );
  },

  async getMyDwmsTaskSummary(
    token: string,
    source?: DwmsTaskSource,
  ): Promise<DwmsTaskSummaryResponse> {
    return getJson(
      `/dwms/myDwms/tasks/summary${buildQuery({ source })}`,
      token,
    );
  },

  async getTaskInstanceDetail(
    token: string,
    instanceId: string,
  ): Promise<DwmsTaskInstanceDetailResponse> {
    return getJson(
      "/dwms/myDwms/tasks/" + encodeURIComponent(instanceId),
      token,
    );
  },

  async getMyAlertCount(token: string): Promise<{ count?: number }> {
    return getJson("/dwms/alerts/myCount", token);
  },

  async updateTaskStatus(
    token: string,
    instanceId: string,
    body: UpdateTaskStatusPayload,
  ): Promise<unknown> {
    return sendJson(
      `/dwms/myDwms/tasks/${encodeURIComponent(instanceId)}/status`,
      token,
      "PATCH",
      body,
    );
  },

  async addTaskComment(
    token: string,
    instanceId: string,
    comment: string,
  ): Promise<{ comment?: DwmsTaskInstanceComment }> {
    return sendJson(
      "/dwms/myDwms/tasks/" + encodeURIComponent(instanceId) + "/comments",
      token,
      "POST",
      { comment },
    );
  },

  async acknowledgeTask(token: string, taskId: string): Promise<unknown> {
    return sendJson(
      `/dwms/myDwms/tasks/${encodeURIComponent(taskId)}/acknowledgement`,
      token,
      "PATCH",
    );
  },

  async getBackendStatus(token: string): Promise<unknown> {
    return getJson("/dwms/status", token);
  },
};
