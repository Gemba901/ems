import { apiClient } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
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
export type EscalationContactRule = "ASSIGNER" | "MANAGER" | "CUSTOM";
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
export type DwmsAlertStatus = "OPEN" | "IN_PROGRESS" | "CLOSED" | "ESCALATED";
export type DwmsAlertClosureApprovalStatus =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
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

export interface DwmsSettingsResponse {
  approverRoles?: DwmsApproverRule[];
  approverCustomEmployeeIds?: string[];
  alertViewLevel?: ViewLevel;
  analyticsViewLevel?: ViewLevel;
  escalateUnacknowledgedMins?: number;
  escalateUnacknowledgedMediumMins?: number;
  escalateUnacknowledgedHighMins?: number;
  escalateUnacknowledgedCriticalMins?: number;
  abnormalityMediumMins?: number;
  abnormalityHighMins?: number;
  abnormalityCriticalMins?: number;
  escalationContactRules?: string[];
  customEscalationContactIds?: string[];
  config?: DwmsSettingsResponse;
}

export interface DwmsSettingsState {
  approverRoles: DwmsApproverRule[];
  approverCustomEmployeeIds: string[];
  alertViewLevel: ViewLevel;
  analyticsViewLevel: ViewLevel;
  escalateUnacknowledgedMins: number;
  escalateUnacknowledgedMediumHours: number;
  escalateUnacknowledgedHighHours: number;
  escalateUnacknowledgedCriticalHours: number;
  abnormalityMediumHours: number;
  abnormalityHighHours: number;
  abnormalityCriticalHours: number;
  escalationContactRules: EscalationContactRule[];
  customEscalationContactIds: string[];
}

export interface DwmsSettingsPayload {
  approverRoles: DwmsApproverRule[];
  approverCustomEmployeeIds: string[];
  alertViewLevel: ViewLevel;
  analyticsViewLevel: ViewLevel;
  escalateUnacknowledgedMins: number;
  escalateUnacknowledgedMediumMins: number;
  escalateUnacknowledgedHighMins: number;
  escalateUnacknowledgedCriticalMins: number;
  abnormalityMediumMins: number;
  abnormalityHighMins: number;
  abnormalityCriticalMins: number;
  escalationContactRules: EscalationContactRule[];
  customEscalationContactIds: string[];
}

export const DEFAULT_DWMS_SETTINGS: DwmsSettingsState = {
  approverRoles: ["MANAGEMENT"],
  approverCustomEmployeeIds: [],
  alertViewLevel: "OWN",
  analyticsViewLevel: "DEPARTMENT",
  escalateUnacknowledgedMins: 60,
  escalateUnacknowledgedMediumHours: 24,
  escalateUnacknowledgedHighHours: 8,
  escalateUnacknowledgedCriticalHours: 2,
  abnormalityMediumHours: 24,
  abnormalityHighHours: 8,
  abnormalityCriticalHours: 2,
  escalationContactRules: ["ASSIGNER"],
  customEscalationContactIds: [],
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

const DWMS_ESCALATION_RULE_VALUES: EscalationContactRule[] = [
  "ASSIGNER",
  "MANAGER",
  "CUSTOM",
];

export const DWMS_ESCALATION_RULE_OPTIONS: {
  value: EscalationContactRule;
  label: string;
  description: string;
}[] = [
  {
    value: "ASSIGNER",
    label: "Assigner",
    description: "The employee who assigned the task can be alerted.",
  },
  {
    value: "MANAGER",
    label: "Managers",
    description: "Managers in the assignee's reporting chain can be alerted.",
  },
  {
    value: "CUSTOM",
    label: "Custom Employees",
    description: "Specific employees can be alerted.",
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
}

export interface DwmsTargetUsersResponse {
  users?: DwmsEmployeeOption[];
  departments?: DwmsDepartmentOption[];
  tasks?: DwmsAlertTargetTask[];
}

export interface DwmsAlertTargetTask {
  instanceId: string;
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
}

export interface DwmsDashboardMetrics {
  completionRate: number;
  totalTasks?: number;
  completedTasks?: number;
  overdueTasks?: number;
  pendingTasks?: number;
  openAlerts?: number;
  overdueCount?: number;
  completedCount?: number;
  tasksPerformedTodayPercent?: number;
  openAlertsCount?: number;
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
  openAlerts?: DwmsDashboardTrendPoint[];
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
  status: DwmsAlertStatus;
  correctiveAction?: string | null;
  closureNote?: string | null;
  resolvedAt?: string | null;
  closureApprovalStatus?: DwmsAlertClosureApprovalStatus | string;
  closureApproverId?: string | null;
  closureRequestedById?: string | null;
  closureRequestedAt?: string | null;
  closureRejectedAt?: string | null;
  closureRejectionNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  repeatCount?: number;
  isRepeated?: boolean;
  isAbnormality?: boolean;
  abnormalitySourceAlertId?: string | null;
  raisedBy?: { id: string; name: string; email: string } | null;
  closureRequestedBy?: { id: string; name: string; email: string } | null;
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
  sourceAlert?: Partial<DwmsAlertItem> | null;
  abnormalities?: Array<Partial<DwmsAlertItem> | null>;
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
  overdueAlertTo?: string | null;
  overdueAlertContactId?: string | null;
  overdueAlertToEmployeeIds?: string[];
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
  responsibleEmployeeCode: string;
  parentActivityCode?: string | null;
  activity: CreateActivityPayload;
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

function normalizeEscalationContactRules(
  rules?: string[] | null,
): EscalationContactRule[] {
  const normalized = [
    ...new Set(
      (rules ?? []).filter((rule): rule is EscalationContactRule =>
        DWMS_ESCALATION_RULE_VALUES.includes(rule as EscalationContactRule),
      ),
    ),
  ];
  return normalized.length > 0 ? normalized : ["ASSIGNER"];
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
    escalationContactRules: normalizeEscalationContactRules(
      config.escalationContactRules,
    ),
    customEscalationContactIds: config.customEscalationContactIds ?? [],
    escalateUnacknowledgedMins: Number(
      config.escalateUnacknowledgedMins ??
        DEFAULT_DWMS_SETTINGS.escalateUnacknowledgedMins,
    ),
    escalateUnacknowledgedMediumHours: toHours(
      Number(
        config.escalateUnacknowledgedMediumMins ??
          DEFAULT_DWMS_SETTINGS.escalateUnacknowledgedMediumHours * 60,
      ),
    ),
    escalateUnacknowledgedHighHours: toHours(
      Number(
        config.escalateUnacknowledgedHighMins ??
          DEFAULT_DWMS_SETTINGS.escalateUnacknowledgedHighHours * 60,
      ),
    ),
    escalateUnacknowledgedCriticalHours: toHours(
      Number(
        config.escalateUnacknowledgedCriticalMins ??
          DEFAULT_DWMS_SETTINGS.escalateUnacknowledgedCriticalHours * 60,
      ),
    ),
    abnormalityMediumHours: toHours(
      Number(
        config.abnormalityMediumMins ??
          DEFAULT_DWMS_SETTINGS.abnormalityMediumHours * 60,
      ),
    ),
    abnormalityHighHours: toHours(
      Number(
        config.abnormalityHighMins ??
          DEFAULT_DWMS_SETTINGS.abnormalityHighHours * 60,
      ),
    ),
    abnormalityCriticalHours: toHours(
      Number(
        config.abnormalityCriticalMins ??
          DEFAULT_DWMS_SETTINGS.abnormalityCriticalHours * 60,
      ),
    ),
  };
}

export function toDwmsSettingsPayload(
  settings: DwmsSettingsState,
): DwmsSettingsPayload {
  const escalationContactRules = normalizeEscalationContactRules(
    settings.escalationContactRules,
  );

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
    escalateUnacknowledgedMins: Math.round(
      Number(settings.escalateUnacknowledgedMins),
    ),
    escalateUnacknowledgedMediumMins: toMinutes(
      Number(settings.escalateUnacknowledgedMediumHours),
    ),
    escalateUnacknowledgedHighMins: toMinutes(
      Number(settings.escalateUnacknowledgedHighHours),
    ),
    escalateUnacknowledgedCriticalMins: toMinutes(
      Number(settings.escalateUnacknowledgedCriticalHours),
    ),
    abnormalityMediumMins: toMinutes(Number(settings.abnormalityMediumHours)),
    abnormalityHighMins: toMinutes(Number(settings.abnormalityHighHours)),
    abnormalityCriticalMins: toMinutes(
      Number(settings.abnormalityCriticalHours),
    ),
    escalationContactRules,
    customEscalationContactIds: escalationContactRules.includes("CUSTOM")
      ? settings.customEscalationContactIds
      : [],
  };
}

export const DwmsService = {
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

  async getAlerts(token: string): Promise<DwmsAlertListResponse> {
    return getJson<DwmsAlertListResponse>("/dwms/alerts", token);
  },

  async getAlertTargets(token: string): Promise<DwmsTargetUsersResponse> {
    return getJson<DwmsTargetUsersResponse>("/dwms/alerts/targets", token);
  },

  async createAlert(
    token: string,
    body: CreateDwmsAlertPayload,
  ): Promise<DwmsAlertItem> {
    return sendJson("/dwms/alerts", token, "POST", body);
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
  async respondToAlert(
    token: string,
    alertId: string,
    body: { correctiveAction: string },
  ): Promise<unknown> {
    return sendJson(`/dwms/alerts/${alertId}/response`, token, "PATCH", body);
  },

  async requestAlertClosure(
    token: string,
    alertId: string,
    body: { closureNote: string },
  ): Promise<unknown> {
    return sendJson(
      `/dwms/alerts/${alertId}/closure-request`,
      token,
      "PATCH",
      body,
    );
  },

  async closeAlert(
    token: string,
    alertId: string,
    body: { closureNote: string },
  ): Promise<unknown> {
    return sendJson(`/dwms/alerts/${alertId}/close`, token, "PATCH", body);
  },

  async approveAlertClosure(
    token: string,
    alertId: string,
    body?: { comment?: string | null },
  ): Promise<unknown> {
    return sendJson(
      `/dwms/approvalAlerts/${encodeURIComponent(alertId)}/approve`,
      token,
      "PATCH",
      body,
    );
  },

  async rejectAlertClosure(
    token: string,
    alertId: string,
    body?: { comment?: string | null },
  ): Promise<unknown> {
    return sendJson(
      `/dwms/approvalAlerts/${encodeURIComponent(alertId)}/reject`,
      token,
      "PATCH",
      body,
    );
  },

  async remindAlertOwner(token: string, alertId: string): Promise<unknown> {
    return sendJson(`/dwms/alerts/${alertId}/remind`, token, "POST");
  },

  async reassignEscalatedTask(
    token: string,
    alertId: string,
    newOwnerId: string,
  ): Promise<unknown> {
    return sendJson(`/dwms/alerts/${alertId}/reassign`, token, "POST", {
      newOwnerId,
    });
  },

  async escalateAlertFurther(token: string, alertId: string): Promise<unknown> {
    return sendJson(`/dwms/alerts/${alertId}/escalate`, token, "POST");
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
  async getApprovalAlerts(
    token: string,
    status: "pending" | "approved" | "rejected" = "pending",
  ): Promise<DwmsAlertListResponse> {
    return getJson<DwmsAlertListResponse>(
      `/dwms/approvalAlerts${buildQuery({ status })}`,
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

  async getOverdueAlertRecipients(
    token: string,
    assignedToId: string,
  ): Promise<{ users?: DwmsEmployeeOption[] }> {
    return getJson(
      `/dwms/users/overdueAlertRecipients${buildQuery({ assignedToId })}`,
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
    date: string,
  ): Promise<{ tasks?: DwmsTaskItem[] }> {
    return getJson(
      `/dwms/myDwms/tasks${buildQuery({ date, timeZone: getBrowserTimeZone() })}`,
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

  async getOpenAlertCount(token: string): Promise<{ count?: number }> {
    return getJson("/dwms/alerts/myResponsibleCount", token);
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

function toHours(minutes: number) {
  return Number.isFinite(minutes) ? Number((minutes / 60).toFixed(2)) : 0;
}

function toMinutes(hours: number) {
  return Number.isFinite(hours) ? Math.max(0, Math.round(hours * 60)) : 0;
}
