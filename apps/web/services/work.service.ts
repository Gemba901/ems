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

function send<T>(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, token: string): Promise<T> {
  return apiClient(
    `${API_URL}${path}`,
    { method, headers: authHeaders(token), ...(body !== undefined && { body: JSON.stringify(body) }) },
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
export type WorkProjectStatus = "ACTIVE" | "COMPLETED";
export type DayType = "WORKING" | "NON_WORKING" | "HOLIDAY";
// ON_SITE: company sites only. REMOTE: approved home only. HYBRID: either.
export type WorkArrangement = "ON_SITE" | "REMOTE" | "HYBRID";
export type WorkPlaceKind = "SITE" | "HOME";
export type LocationCheck = "INSIDE" | "OUTSIDE" | "NO_LOCATION" | "NO_APPROVED_PLACE" | "LOW_ACCURACY";
export type HomeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export const ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  ON_SITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

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
  status: WorkProjectStatus;
  targetDate: string | null;
  completedAt: string | null;
  // Several sprints can run at once; oldest-started first.
  activeSprints: { id: string; name: string }[];
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
  targetDate?: string;
  members?: ProjectMemberInput[];
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: WorkProjectStatus;
  members?: ProjectMemberInput[];
}

export interface WorkTask {
  id: string;
  project: { id: string; name: string };
  title: string;
  description: string | null;
  status: WorkTaskStatus;
  dueDate: string | null;
  completedAt: string | null;
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
  lead: EmployeeSummary | null;
  members: EmployeeSummary[];
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

// Lead and members must belong to the project. The lead always counts as a member.
export interface SprintTeamPayload {
  leadId?: string | null;
  memberIds?: string[];
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
  // From the schedule saved at clock-in; null on days that weren't scheduled.
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  // Checked once at clock-in; null on records from before location checks.
  locationCheck: LocationCheck | null;
  checkedPlaceKind: WorkPlaceKind | null;
  checkedPlaceName: string | null;
  distanceMeters: number | null;
}

export type TeamAttendanceRecord = AttendanceRecord & { employee: EmployeeSummary };

export interface AttendanceStatus {
  serverNow: string;
  today: string;
  timeZone: string;
  openRecord: AttendanceRecord | null;
  todayRecord: AttendanceRecord | null;
  todaySchedule: {
    dayType: DayType;
    holidayName: string | null;
    startsAt: string | null;
    endsAt: string | null;
    lateAfter: string | null;
  };
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
  locationCheck: LocationCheck | null;
  arrangementAtClockIn: WorkArrangement | null;
  // The approved place the clock-in was compared with, as it was then.
  checkedPlace: { kind: WorkPlaceKind; name: string; latitude: number; longitude: number; radiusMeters: number } | null;
  distanceMeters: number | null;
}

// ── Locations ────────────────────────────────────────────────────────────────

export interface WorkSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
}

export interface LocationSettings {
  homeRadiusMeters: number;
  sites: WorkSite[];
  canEdit: boolean;
}

export type SitePayload = { name: string; latitude: number; longitude: number; radiusMeters?: number };

export type HomeLocation = { latitude: number; longitude: number; approvedAt: string };

export interface HomeRequest {
  id: string;
  employee: EmployeeSummary;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  note: string | null;
  status: HomeRequestStatus;
  createdAt: string;
  reviewedBy: EmployeeSummary | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  currentHome: HomeLocation | null;
}

export interface MyLocation {
  arrangement: WorkArrangement;
  home: HomeLocation | null;
  homeRadiusMeters: number;
  canRequestHome: boolean;
  latestRequest: Omit<HomeRequest, "employee" | "currentHome"> | null;
  sites: WorkSite[];
}

export interface EmployeeArrangement {
  employee: EmployeeSummary;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  arrangement: WorkArrangement;
  hasHome: boolean;
  homeApprovedAt: string | null;
  pendingRequest: boolean;
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

// ── Settings & holidays ──────────────────────────────────────────────────────

export interface WorkSettings {
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  lunchBreakEnabled: boolean;
  lunchStartTime: string | null;
  lunchEndTime: string | null;
  holidayCountry: string | null;
  observeOnNextWorkingDay: boolean;
  // 0 = Sunday … 6 = Saturday; shared with Leave.
  workingDays: number[];
  timeZone: string;
  scheduledMinutesPerDay: number;
  canEdit: boolean;
}

export type UpdateWorkSettingsPayload = Partial<Omit<WorkSettings, "timeZone" | "scheduledMinutesPerDay" | "canEdit">>;

export type HolidaySource = "PUBLIC" | "COMPANY";

export interface Holiday {
  id: string;
  date: string;
  weekday: number;
  name: string;
  source: HolidaySource;
  isActive: boolean;
}

export interface HolidayYear {
  year: number;
  country: string | null;
  items: Holiday[];
  // Extra days off when a holiday falls on a non-working day.
  observedDays: { date: string; name: string }[];
}

export interface HolidayCountry {
  code: string;
  name: string;
}

// ── Team, context & analytics ────────────────────────────────────────────────

export type AnalyticsScope = "personal" | "department" | "organisation";

export interface WorkContext {
  employeeId: string;
  department: { id: string; name: string } | null;
  directReportCount: number;
  canManageAttendance: boolean;
  canEditSettings: boolean;
  analyticsScopes: AnalyticsScope[];
  departments: { id: string; name: string }[];
}

export interface AttendanceTotals {
  expectedDays: number;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  leaveDays: number;
  offDayWorkDays: number;
  outsideLocationDays: number;
  averageLateMinutes: number;
  workedMinutes: number;
  attendanceRate: number | null;
  punctualityRate: number | null;
}

export type TeamTodayStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "ON_LEAVE" | "NOT_IN" | "DAY_OFF" | "HOLIDAY";

export interface TeamMember {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  avatarUrl: string | null;
  department: { id: string; name: string } | null;
  employmentStatus: string;
  today: { status: TeamTodayStatus; dayType: DayType; clockInAt: string | null; clockOutAt: string | null; lateMinutes: number };
  attendance: AttendanceTotals;
  tasks: { open: number; overdue: number };
  leave: { type: string; startDate: string; endDate: string }[];
}

export interface TeamMemberDetail extends TeamMember {
  openTasks: { id: string; title: string; status: WorkTaskStatus; dueDate: string | null; project: { id: string; name: string } }[];
  recentAttendance: {
    id: string;
    workDate: string;
    clockInAt: string;
    clockOutAt: string | null;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    locationCheck: LocationCheck | null;
    checkedPlaceName: string | null;
    distanceMeters: number | null;
  }[];
}

export type OnTimeCounts = { onTime: number; late: number; noDeadline: number };
export type ProjectOutcome = { id: string; name: string; targetDate: string | null; completedOn: string | null; daysLate: number };

export interface Analytics {
  scope: AnalyticsScope;
  subject:
    | { scope: "personal"; employee: EmployeeSummary }
    | { scope: "department"; department: { id: string; name: string } }
    | { scope: "organisation" };
  from: string;
  to: string;
  today: string;
  headcount: number;
  attendance: AttendanceTotals & {
    trend: { date: string; expected: number; present: number; onTime: number; late: number; absent: number }[];
  };
  projects: {
    tasksCompleted: OnTimeCounts;
    tasksOverdue: number;
    tasksOpen: number;
    sprintsCompleted: OnTimeCounts;
    projectsCompleted: OnTimeCounts & { items: ProjectOutcome[] };
    projectsOverdue: ProjectOutcome[];
  };
  breakdown: {
    id: string;
    name: string;
    headcount: number;
    attendance: AttendanceTotals;
    tasksCompleted: OnTimeCounts;
    tasksOverdue: number;
  }[];
}

export interface AnalyticsQuery {
  scope: AnalyticsScope;
  from?: string;
  to?: string;
  departmentId?: string;
  employeeId?: string;
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
  createSprint(projectId: string, data: SprintPayload & SprintTeamPayload, token: string): Promise<Sprint> {
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
  updateSprintTeam(sprintId: string, data: SprintTeamPayload, token: string): Promise<SprintDetail> {
    return send("PATCH", `/sprints/${encodeURIComponent(sprintId)}/team`, data, token);
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

  // Settings & holidays
  workSettings(token: string): Promise<WorkSettings> {
    return get("/settings", token);
  },
  updateWorkSettings(data: UpdateWorkSettingsPayload, token: string): Promise<WorkSettings> {
    return send("PATCH", "/settings", data, token);
  },
  holidayCountries(token: string): Promise<HolidayCountry[]> {
    return get("/holidays/countries", token);
  },
  holidays(year: number, token: string): Promise<HolidayYear> {
    return get(`/holidays${query({ year })}`, token);
  },
  createHoliday(data: { date: string; name: string }, token: string): Promise<Holiday> {
    return send("POST", "/holidays", data, token);
  },
  updateHoliday(holidayId: string, data: { date?: string; name?: string; isActive?: boolean }, token: string): Promise<Holiday> {
    return send("PATCH", `/holidays/${encodeURIComponent(holidayId)}`, data, token);
  },
  deleteHoliday(holidayId: string, token: string): Promise<{ id: string }> {
    return send("DELETE", `/holidays/${encodeURIComponent(holidayId)}`, undefined, token);
  },
  importHolidays(year: number, token: string): Promise<HolidayYear & { added: number }> {
    return send("POST", "/holidays/import", { year }, token);
  },

  // Locations
  locationSettings(token: string): Promise<LocationSettings> {
    return get("/locations", token);
  },
  updateLocationSettings(data: { homeRadiusMeters: number }, token: string): Promise<LocationSettings> {
    return send("PATCH", "/locations", data, token);
  },
  createSite(data: SitePayload, token: string): Promise<WorkSite> {
    return send("POST", "/locations/sites", data, token);
  },
  updateSite(siteId: string, data: Partial<SitePayload> & { isActive?: boolean }, token: string): Promise<WorkSite> {
    return send("PATCH", `/locations/sites/${encodeURIComponent(siteId)}`, data, token);
  },
  deleteSite(siteId: string, token: string): Promise<{ id: string }> {
    return send("DELETE", `/locations/sites/${encodeURIComponent(siteId)}`, undefined, token);
  },
  arrangements(params: { search?: string; arrangement?: WorkArrangement; page?: number }, token: string): Promise<Page<EmployeeArrangement>> {
    return get(`/locations/arrangements${query({ pageSize: 50, ...params })}`, token);
  },
  setArrangement(employeeId: string, data: { arrangement: WorkArrangement; clearHome?: boolean }, token: string) {
    return send<{ employeeId: string; arrangement: WorkArrangement; hasHome: boolean }>("PATCH", `/locations/arrangements/${encodeURIComponent(employeeId)}`, data, token);
  },
  myLocation(token: string): Promise<MyLocation> {
    return get("/locations/me", token);
  },
  requestHome(data: { location: CapturedLocation; note?: string }, token: string): Promise<MyLocation> {
    return send("POST", "/locations/me/home-request", data, token);
  },
  cancelHomeRequest(token: string): Promise<MyLocation> {
    return send("DELETE", "/locations/me/home-request", undefined, token);
  },
  homeRequests(status: HomeRequestStatus, token: string): Promise<HomeRequest[]> {
    return get(`/locations/home-requests${query({ status })}`, token);
  },
  reviewHomeRequest(requestId: string, data: { decision: "APPROVED" | "REJECTED"; note?: string }, token: string): Promise<HomeRequest> {
    return send("POST", `/locations/home-requests/${encodeURIComponent(requestId)}/review`, data, token);
  },

  // Team, context & analytics
  context(token: string): Promise<WorkContext> {
    return get("/me", token);
  },
  team(token: string): Promise<TeamMember[]> {
    return get("/team", token);
  },
  teamMember(employeeId: string, token: string): Promise<TeamMemberDetail> {
    return get(`/team/${encodeURIComponent(employeeId)}`, token);
  },
  analytics(params: AnalyticsQuery, token: string): Promise<Analytics> {
    return get(`/analytics${query({ ...params })}`, token);
  },
};
