"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  WorkApiError,
  WorkService,
  type AttendanceRange,
  type ClockInPayload,
  type CorrectAttendancePayload,
  type CreateProjectPayload,
  type CreateTaskPayload,
  type SprintPayload,
  type TaskView,
  type UpdateProjectPayload,
  type UpdateTaskPayload,
} from "@/services/work.service";

// Mirrors apps/api/src/work/work-access.policy.ts. These only decide what the UI offers;
// the backend enforces every permission again.
export const PROJECT_CREATOR_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
export const ATTENDANCE_MANAGER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR];

// Every key starts with the org and user, so one person's attendance or tasks can never be
// served from cache to another session in the same tab. Logout also clears the whole cache.
function useScope() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const scope = ["work", user?.organizationId ?? "", user?.userId ?? ""] as const;
  return { token: accessToken ?? "", enabled: !!accessToken && !!user, scope, user };
}

// 4xx answers (no access, no employee profile, not found) won't change on retry, so show
// them straight away; only network and server errors are retried.
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof WorkApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function useWorkPermissions() {
  const role = useAuthStore((s) => s.user?.roleLevel);
  return {
    canCreateProjects: !!role && PROJECT_CREATOR_ROLES.includes(role),
    canManageAttendance: !!role && ATTENDANCE_MANAGER_ROLES.includes(role),
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects() {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "projects"],
    queryFn: () => WorkService.listProjects(token),
    retry: retryTransient,
    enabled,
  });
}

export function useProject(projectId: string) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "project", projectId],
    queryFn: () => WorkService.getProject(projectId, token),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

export function useCreateProject() {
  const { token, scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectPayload) => WorkService.createProject(data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...scope, "projects"] }),
  });
}

export function useUpdateProject(projectId: string) {
  const { token, scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProjectPayload) => WorkService.updateProject(projectId, data, token),
    onSuccess: (project) => {
      qc.setQueryData([...scope, "project", projectId], project);
      qc.invalidateQueries({ queryKey: [...scope, "projects"] });
    },
  });
}

export function usePeopleSearch(search: string, enabledFlag = true) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "people", search],
    queryFn: () => WorkService.searchPeople(search, token),
    enabled: enabled && enabledFlag,
    staleTime: 60_000,
    retry: false,
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useMyTasks(includeDone: boolean) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "my-tasks", includeDone],
    queryFn: () => WorkService.myTasks(token, includeDone),
    retry: retryTransient,
    enabled,
  });
}

export function useProjectTasks(projectId: string, view: TaskView) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "tasks", projectId, view],
    queryFn: () => WorkService.projectTasks(projectId, view, token),
    retry: retryTransient,
    enabled: enabled && !!projectId && !!view,
  });
}

export function useTask(taskId: string | null) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "task", taskId],
    queryFn: () => WorkService.getTask(taskId!, token),
    enabled: enabled && !!taskId,
    retry: false,
  });
}

// Task changes move counts on the project list, sprint headers and boards, so refresh them all.
function useInvalidateTaskViews() {
  const { scope } = useScope();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...scope, "tasks"] });
    qc.invalidateQueries({ queryKey: [...scope, "my-tasks"] });
    qc.invalidateQueries({ queryKey: [...scope, "sprints"] });
    qc.invalidateQueries({ queryKey: [...scope, "sprint"] });
    qc.invalidateQueries({ queryKey: [...scope, "projects"] });
  };
}

export function useCreateTask(projectId: string) {
  const { token } = useScope();
  const invalidate = useInvalidateTaskViews();
  return useMutation({
    mutationFn: (data: CreateTaskPayload) => WorkService.createTask(projectId, data, token),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const { token, scope } = useScope();
  const qc = useQueryClient();
  const invalidate = useInvalidateTaskViews();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTaskPayload }) => WorkService.updateTask(taskId, data, token),
    onSuccess: (task) => {
      qc.setQueryData([...scope, "task", task.id], task);
      invalidate();
    },
  });
}

export function useTaskComments(taskId: string | null) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "comments", taskId],
    queryFn: () => WorkService.listComments(taskId!, token),
    retry: retryTransient,
    enabled: enabled && !!taskId,
  });
}

export function useAddComment(taskId: string) {
  const { token, scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => WorkService.addComment(taskId, body, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...scope, "comments", taskId] });
      qc.invalidateQueries({ queryKey: [...scope, "task", taskId] });
    },
  });
}

// ── Sprints ───────────────────────────────────────────────────────────────────

export function useSprints(projectId: string) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "sprints", projectId],
    queryFn: () => WorkService.listSprints(projectId, token),
    retry: retryTransient,
    enabled: enabled && !!projectId,
  });
}

export function useSprint(sprintId: string | null) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "sprint", sprintId],
    queryFn: () => WorkService.getSprint(sprintId!, token),
    enabled: enabled && !!sprintId,
    retry: false,
  });
}

function useInvalidateSprints() {
  const { scope } = useScope();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...scope, "sprints"] });
    qc.invalidateQueries({ queryKey: [...scope, "sprint"] });
    qc.invalidateQueries({ queryKey: [...scope, "tasks"] });
    qc.invalidateQueries({ queryKey: [...scope, "my-tasks"] });
    qc.invalidateQueries({ queryKey: [...scope, "projects"] });
  };
}

export function useCreateSprint(projectId: string) {
  const { token } = useScope();
  const invalidate = useInvalidateSprints();
  return useMutation({
    mutationFn: (data: SprintPayload) => WorkService.createSprint(projectId, data, token),
    onSuccess: invalidate,
  });
}

export function useUpdateSprint() {
  const { token } = useScope();
  const invalidate = useInvalidateSprints();
  return useMutation({
    mutationFn: ({ sprintId, data }: { sprintId: string; data: Partial<SprintPayload> }) =>
      WorkService.updateSprint(sprintId, data, token),
    onSuccess: invalidate,
  });
}

export function useStartSprint() {
  const { token } = useScope();
  const invalidate = useInvalidateSprints();
  return useMutation({
    mutationFn: (sprintId: string) => WorkService.startSprint(sprintId, token),
    onSuccess: invalidate,
  });
}

export function useCompleteSprint() {
  const { token } = useScope();
  const invalidate = useInvalidateSprints();
  return useMutation({
    mutationFn: (sprintId: string) => WorkService.completeSprint(sprintId, token),
    onSuccess: invalidate,
  });
}

// ── Attendance ────────────────────────────────────────────────────────────────

export function useAttendanceStatus() {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "attendance", "status"],
    queryFn: () => WorkService.attendanceStatus(token),
    retry: retryTransient,
    enabled,
    refetchOnWindowFocus: "always",
    gcTime: 0,
  });
}

export function useMyAttendance(range: AttendanceRange, enabledFlag = true) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "attendance", "me", range],
    queryFn: () => WorkService.myAttendance(range, token),
    retry: retryTransient,
    enabled: enabled && enabledFlag,
    gcTime: 0,
  });
}

export function useTeamAttendance(range: AttendanceRange & { employeeId?: string }, enabledFlag: boolean) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "attendance", "team", range],
    queryFn: () => WorkService.teamAttendance(range, token),
    retry: retryTransient,
    enabled: enabled && enabledFlag,
    gcTime: 0,
  });
}

// Coordinates are fetched only when someone opens the location dialog, never cached
// after it closes, and never retried in the background.
export function useAttendanceLocation(recordId: string | null) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "attendance", "location", recordId],
    queryFn: () => WorkService.attendanceLocation(recordId!, token),
    enabled: enabled && !!recordId,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useAttendanceCorrections(recordId: string | null) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, "attendance", "corrections", recordId],
    queryFn: () => WorkService.attendanceCorrections(recordId!, token),
    enabled: enabled && !!recordId,
    gcTime: 0,
    retry: false,
  });
}

function useInvalidateAttendance() {
  const { scope } = useScope();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [...scope, "attendance"] });
}

export function useClockIn() {
  const { token } = useScope();
  const invalidate = useInvalidateAttendance();
  return useMutation({
    mutationFn: (data: ClockInPayload) => WorkService.clockIn(data, token),
    onSettled: invalidate,
  });
}

export function useClockOut() {
  const { token } = useScope();
  const invalidate = useInvalidateAttendance();
  return useMutation({
    mutationFn: ({ recordId, requestId }: { recordId: string; requestId: string }) =>
      WorkService.clockOut(recordId, requestId, token),
    onSettled: invalidate,
  });
}

export function useCorrectAttendance() {
  const { token } = useScope();
  const invalidate = useInvalidateAttendance();
  return useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: CorrectAttendancePayload }) =>
      WorkService.correctAttendance(recordId, data, token),
    onSettled: invalidate,
  });
}
