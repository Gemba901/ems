import { apiClient } from "@/lib/api-client";
const API_URL = "/api/work";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Carries the backend's machine-readable code (e.g. VERSION_CONFLICT) and any extra
// fields it sent, so screens can react to specific failures instead of parsing messages.
export class WorkApiError extends Error {
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
    throw new WorkApiError(text || `Request failed with status ${res.status}`, res.status, code, details);
  }
  return res.json();
}

function get<T>(path: string, token: string): Promise<T> {
  return apiClient(`${API_URL}${path}`, { headers: authHeaders(token) }, token).then((res) => handleResponse<T>(res));
}

function send<T>(method: "POST" | "PATCH", path: string, body: unknown, token: string): Promise<T> {
  return apiClient(
    `${API_URL}${path}`,
    { method, headers: authHeaders(token), body: JSON.stringify(body) },
    token,
  ).then((res) => handleResponse<T>(res));
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type EmployeeSummary = { id: string; name: string };

export type WorkTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type WorkSprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED";
export type WorkProjectRole = "MANAGER" | "MEMBER";
export type AttendanceLocationStatus = "CAPTURED" | "MISSING";

export const TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const TASK_STATUSES: WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

export const SPRINT_STATUS_LABELS: Record<WorkSprintStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  activeSprint: { id: string; name: string } | null;
  taskCounts: { total: number; done: number };
  memberCount: number;
  myRole: WorkProjectRole | null;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  employee: EmployeeSummary;
  role: WorkProjectRole;
  joinedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  createdBy: EmployeeSummary | null;
  members: ProjectMember[];
}

export interface ProjectMemberInput {
  employeeId: string;
  role: WorkProjectRole;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  members?: ProjectMemberInput[];
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  members?: ProjectMemberInput[];
}

export interface WorkTask {
  id: string;
  project: { id: string; name: string };
  title: string;
  description: string | null;
  status: WorkTaskStatus;
  dueDate: string | null;
  assignee: EmployeeSummary | null;
  sprint: { id: string; name: string; status: WorkSprintStatus } | null;
  createdBy: EmployeeSummary | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigneeId?: string;
  status?: WorkTaskStatus;
  dueDate?: string;
  sprintId?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  status?: WorkTaskStatus;
  dueDate?: string | null;
  sprintId?: string | null;
}

/** "all", "unscheduled", or a sprint id. */
export type TaskView = string;

export interface TaskComment {
  id: string;
  body: string;
  author: EmployeeSummary | null;
  createdAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: WorkSprintStatus;
  startedAt: string | null;
  completedAt: string | null;
  taskCounts: { total: number; done: number; percent: number };
}

export interface SprintSnapshot {
  version: 1;
  completedAt: string;
  totalCount: number;
  completedCount: number;
  tasks: { id: string; title: string; status: WorkTaskStatus; assigneeId: string | null; assigneeName: string | null }[];
}

export interface SprintDetail extends Sprint {
  completionSnapshot: SprintSnapshot | null;
}

export interface SprintPayload {
  name: string;
  goal?: string | null;
  startDate: string;
  endDate: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  workDate: string;
  timezoneAtClockIn: string;
  clockInAt: string;
  clockOutAt: string | null;
  isOpen: boolean;
  durationSeconds: number | null;
  locationStatus: AttendanceLocationStatus;
  edited: boolean;
  lastCorrectedAt: string | null;
  version: number;
}

export type TeamAttendanceRecord = AttendanceRecord & { employee: EmployeeSummary };

export interface AttendanceStatus {
  serverNow: string;
  today: string;
  timeZone: string;
  openRecord: AttendanceRecord | null;
  todayRecord: AttendanceRecord | null;
}

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export type ClockInPayload =
  | { requestId: string; locationStatus: "CAPTURED"; location: CapturedLocation }
  | { requestId: string; locationStatus: "MISSING"; locationMissingReason: string };

export interface AttendanceLocation {
  recordId: string;
  locationStatus: AttendanceLocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  missingReason: string | null;
}

export interface AttendanceCorrection {
  id: string;
  previousClockInAt: string;
  previousClockOutAt: string | null;
  correctedClockInAt: string;
  correctedClockOutAt: string | null;
  reason: string;
  createdAt: string;
  correctedBy: EmployeeSummary | null;
}

export interface CorrectAttendancePayload {
  clockInAt?: string;
  clockOutAt?: string;
  reason: string;
  expectedVersion: number;
}

export interface AttendanceRange {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const WorkService = {
  // Projects
  listProjects(token: string, page = 1, pageSize = 50): Promise<Page<ProjectSummary>> {
    return get(`/projects${query({ page, pageSize })}`, token);
  },
  getProject(projectId: string, token: string): Promise<ProjectDetail> {
    return get(`/projects/${encodeURIComponent(projectId)}`, token);
  },
  createProject(data: CreateProjectPayload, token: string): Promise<ProjectDetail> {
    return send("POST", "/projects", data, token);
  },
  updateProject(projectId: string, data: UpdateProjectPayload, token: string): Promise<ProjectDetail> {
    return send("PATCH", `/projects/${encodeURIComponent(projectId)}`, data, token);
  },
  searchPeople(search: string, token: string): Promise<EmployeeSummary[]> {
    return get(`/people${query({ search })}`, token);
  },

  // Tasks
  myTasks(token: string, includeDone = false): Promise<Page<WorkTask>> {
    return get(`/my-tasks${query({ includeDone, pageSize: 100 })}`, token);
  },
  projectTasks(projectId: string, view: TaskView, token: string): Promise<Page<WorkTask>> {
    return get(`/projects/${encodeURIComponent(projectId)}/tasks${query({ view, pageSize: 100 })}`, token);
  },
  createTask(projectId: string, data: CreateTaskPayload, token: string): Promise<WorkTask> {
    return send("POST", `/projects/${encodeURIComponent(projectId)}/tasks`, data, token);
  },
  getTask(taskId: string, token: string): Promise<WorkTask> {
    return get(`/tasks/${encodeURIComponent(taskId)}`, token);
  },
  updateTask(taskId: string, data: UpdateTaskPayload, token: string): Promise<WorkTask> {
    return send("PATCH", `/tasks/${encodeURIComponent(taskId)}`, data, token);
  },
  listComments(taskId: string, token: string): Promise<Page<TaskComment>> {
    return get(`/tasks/${encodeURIComponent(taskId)}/comments${query({ pageSize: 100 })}`, token);
  },
  addComment(taskId: string, body: string, token: string): Promise<TaskComment> {
    return send("POST", `/tasks/${encodeURIComponent(taskId)}/comments`, { body }, token);
  },

  // Sprints
  listSprints(projectId: string, token: string): Promise<Page<Sprint>> {
    return get(`/projects/${encodeURIComponent(projectId)}/sprints${query({ pageSize: 100 })}`, token);
  },
  getSprint(sprintId: string, token: string): Promise<SprintDetail> {
    return get(`/sprints/${encodeURIComponent(sprintId)}`, token);
  },
  createSprint(projectId: string, data: SprintPayload, token: string): Promise<Sprint> {
    return send("POST", `/projects/${encodeURIComponent(projectId)}/sprints`, data, token);
  },
  updateSprint(sprintId: string, data: Partial<SprintPayload>, token: string): Promise<Sprint> {
    return send("PATCH", `/sprints/${encodeURIComponent(sprintId)}`, data, token);
  },
  startSprint(sprintId: string, token: string): Promise<Sprint> {
    return send("POST", `/sprints/${encodeURIComponent(sprintId)}/start`, {}, token);
  },
  completeSprint(sprintId: string, token: string): Promise<SprintDetail> {
    return send("POST", `/sprints/${encodeURIComponent(sprintId)}/complete`, {}, token);
  },

  // Attendance (the caller is always the employee; no employeeId is ever sent for clocking)
  attendanceStatus(token: string): Promise<AttendanceStatus> {
    return get("/attendance/me/status", token);
  },
  myAttendance(range: AttendanceRange, token: string): Promise<Page<AttendanceRecord>> {
    return get(`/attendance/me${query({ pageSize: 100, ...range })}`, token);
  },
  teamAttendance(range: AttendanceRange & { employeeId?: string }, token: string): Promise<Page<TeamAttendanceRecord>> {
    return get(`/attendance/team${query({ pageSize: 100, ...range })}`, token);
  },
  clockIn(data: ClockInPayload, token: string): Promise<AttendanceRecord> {
    return send("POST", "/attendance/clock-in", data, token);
  },
  clockOut(recordId: string, requestId: string, token: string): Promise<AttendanceRecord> {
    return send("POST", `/attendance/${encodeURIComponent(recordId)}/clock-out`, { requestId }, token);
  },
  attendanceLocation(recordId: string, token: string): Promise<AttendanceLocation> {
    return get(`/attendance/${encodeURIComponent(recordId)}/location`, token);
  },
  attendanceCorrections(recordId: string, token: string): Promise<AttendanceCorrection[]> {
    return get(`/attendance/${encodeURIComponent(recordId)}/corrections`, token);
  },
  correctAttendance(recordId: string, data: CorrectAttendancePayload, token: string): Promise<AttendanceRecord> {
    return send("POST", `/attendance/${encodeURIComponent(recordId)}/corrections`, data, token);
  },
};
