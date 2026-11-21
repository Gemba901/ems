"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  FiveSApiError,
  FiveSService,
  type ActionListQuery,
  type AreaStatusFilter,
  type AuditListQuery,
  type AuditResponsePayload,
  type CorrectiveActionPayload,
  type CreateActionPayload,
  type CreateAuditPayload,
  type CreateRedTagPayload,
  type OverviewQuery,
  type RedTagDecision,
  type RedTagListQuery,
  type Responsibility,
  type RoutineOutcome,
  type RoutinePayload,
  type StandardPayload,
  type StandardStatus,
  type UpdateActionPayload,
  type UpdateCorrectiveActionPayload,
  type UpdateAreaPayload,
  type UpdateAuditPayload,
  type UpdateRedTagPayload,
  type UpdateRoutinePayload,
} from "@/services/five-s.service";

// Every key starts with the org and user, so one person's records are never served from cache
// to another session in the same tab. The backend enforces every permission again.
function useScope() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const scope = ["five-s", user?.organizationId ?? "", user?.userId ?? ""] as const;
  return { token: accessToken ?? "", enabled: !!accessToken && !!user, scope };
}

// 4xx answers won't change on retry, so show them straight away.
function retryTransient(failureCount: number, error: unknown) {
  if (error instanceof FiveSApiError && error.status < 500) return false;
  return failureCount < 2;
}

// Most 5S writes change several screens (area summaries, overview, actions), so mutations
// refresh the whole module cache. It is small and only active screens refetch.
function useInvalidateAll() {
  const qc = useQueryClient();
  const { scope } = useScope();
  return () => qc.invalidateQueries({ queryKey: scope });
}

function useFiveSQuery<T>(key: readonly unknown[], fn: (token: string) => Promise<T>, options: { enabled?: boolean } = {}) {
  const { token, enabled, scope } = useScope();
  return useQuery({
    queryKey: [...scope, ...key],
    queryFn: () => fn(token),
    enabled: enabled && (options.enabled ?? true),
    retry: retryTransient,
  });
}

function useFiveSMutation<V, R>(fn: (vars: V, token: string) => Promise<R>) {
  const { token } = useScope();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: V) => fn(vars, token),
    onSuccess: () => invalidate(),
  });
}

// ── Context ───────────────────────────────────────────────────────────────────

export function useFiveSCapabilities() {
  return useFiveSQuery(["capabilities"], (t) => FiveSService.capabilities(t));
}

export function useFiveSDirectory() {
  return useFiveSQuery(["directory"], (t) => FiveSService.directory(t));
}

export function useFiveSOverview(params: OverviewQuery) {
  return useFiveSQuery(["overview", params], (t) => FiveSService.overview(params, t));
}

export function useFiveSAnalytics(params: OverviewQuery) {
  return useFiveSQuery(["analytics", params], (t) => FiveSService.analytics(params, t));
}

// ── Areas ─────────────────────────────────────────────────────────────────────

export function useFiveSAreas(params: { departmentId?: string; ownerId?: string; status?: AreaStatusFilter } = {}) {
  return useFiveSQuery(["areas", params], (t) => FiveSService.listAreas(params, t));
}

export function useFiveSArea(id: string | undefined) {
  return useFiveSQuery(["area", id], (t) => FiveSService.getArea(id!, t), { enabled: !!id });
}

export function useUpdateArea() {
  return useFiveSMutation(({ id, body }: { id: string; body: UpdateAreaPayload }, t) => FiveSService.updateArea(id, body, t));
}

// ── Audits ────────────────────────────────────────────────────────────────────

export function useFiveSAudits(params: AuditListQuery) {
  return useFiveSQuery(["audits", params], (t) => FiveSService.listAudits(params, t));
}

export function useFiveSAudit(id: string | undefined) {
  return useFiveSQuery(["audit", id], (t) => FiveSService.getAudit(id!, t), { enabled: !!id });
}

export function useCreateAudit() {
  return useFiveSMutation((body: CreateAuditPayload, t) => FiveSService.createAudit(body, t));
}

export function useUpdateAudit() {
  return useFiveSMutation(({ id, body }: { id: string; body: UpdateAuditPayload }, t) => FiveSService.updateAudit(id, body, t));
}

// Autosave: writes the answer and puts the returned draft straight into the cache, without
// refetching everything on every tap.
export function useSaveAuditResponses() {
  const { token, scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, responses }: { id: string; responses: AuditResponsePayload[] }) => FiveSService.saveResponses(id, responses, token),
    onSuccess: (detail) => qc.setQueryData([...scope, "audit", detail.id], detail),
  });
}

export function useSubmitAudit() {
  return useFiveSMutation((id: string, t) => FiveSService.submitAudit(id, t));
}

export function useDeleteAudit() {
  return useFiveSMutation((id: string, t) => FiveSService.deleteAudit(id, t));
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function useFiveSActions(params: ActionListQuery) {
  return useFiveSQuery(["actions", params], (t) => FiveSService.listActions(params, t));
}

export function useFiveSAction(id: string | undefined) {
  return useFiveSQuery(["action", id], (t) => FiveSService.getAction(id!, t), { enabled: !!id });
}

export function useCreateAction() {
  return useFiveSMutation((body: CreateActionPayload, t) => FiveSService.createAction(body, t));
}

export function useUpdateAction() {
  return useFiveSMutation(({ id, body }: { id: string; body: UpdateActionPayload }, t) => FiveSService.updateAction(id, body, t));
}

export function useAddCorrectiveAction() {
  return useFiveSMutation(({ id, body }: { id: string; body: CorrectiveActionPayload }, t) => FiveSService.addCorrectiveAction(id, body, t));
}

export function useUpdateCorrectiveAction() {
  return useFiveSMutation(
    ({ id, stepId, body }: { id: string; stepId: string; body: UpdateCorrectiveActionPayload }, t) =>
      FiveSService.updateCorrectiveAction(id, stepId, body, t),
  );
}

export function useRemoveCorrectiveAction() {
  return useFiveSMutation(({ id, stepId }: { id: string; stepId: string }, t) => FiveSService.removeCorrectiveAction(id, stepId, t));
}

export function useSubmitAction() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: { completionDescription: string; completionEvidenceUrls?: string[] } }, t) =>
      FiveSService.submitAction(id, body, t),
  );
}

export function useVerifyAction() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: { outcome: "VERIFIED" | "REWORK"; remarks?: string } }, t) => FiveSService.verifyAction(id, body, t),
  );
}

export function useRaiseKaizen() {
  return useFiveSMutation(({ id, body }: { id: string; body: { kaizenOwnerId?: string } }, t) => FiveSService.raiseKaizen(id, body, t));
}

export function useRaiseSga() {
  return useFiveSMutation(({ id, body }: { id: string; body: { ownerId?: string } }, t) => FiveSService.raiseSga(id, body, t));
}

// ── Red tags ──────────────────────────────────────────────────────────────────

export function useFiveSRedTags(params: RedTagListQuery) {
  return useFiveSQuery(["red-tags", params], (t) => FiveSService.listRedTags(params, t));
}

export function useFiveSRedTag(id: string | undefined) {
  return useFiveSQuery(["red-tag", id], (t) => FiveSService.getRedTag(id!, t), { enabled: !!id });
}

export function useCreateRedTag() {
  return useFiveSMutation((body: CreateRedTagPayload, t) => FiveSService.createRedTag(body, t));
}

export function useUpdateRedTag() {
  return useFiveSMutation(({ id, body }: { id: string; body: UpdateRedTagPayload }, t) => FiveSService.updateRedTag(id, body, t));
}

export function useDecideRedTag() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: { decision: RedTagDecision; decisionNotes?: string | null; approvalReference?: string | null } }, t) =>
      FiveSService.decideRedTag(id, body, t),
  );
}

export function useResolveRedTag() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: { resolutionDetails: string; resolvedOn: string } }, t) => FiveSService.resolveRedTag(id, body, t),
  );
}

// ── Standards ─────────────────────────────────────────────────────────────────

export function useFiveSStandards(params: { areaId?: string; status?: StandardStatus; view?: "current" | "all" }) {
  return useFiveSQuery(["standards", params], (t) => FiveSService.listStandards(params, t));
}

export function useFiveSStandard(id: string | undefined) {
  return useFiveSQuery(["standard", id], (t) => FiveSService.getStandard(id!, t), { enabled: !!id });
}

// Join 12: prefill for a standard written from a closed Kaizen or SGA
export function useStandardSource(params: { kaizenId?: string; sgaId?: string }) {
  return useFiveSQuery(["standard-source", params], (t) => FiveSService.getStandardSource(params, t), {
    enabled: !!(params.kaizenId || params.sgaId),
  });
}

export function useCreateStandard() {
  return useFiveSMutation((body: StandardPayload, t) => FiveSService.createStandard(body, t));
}

export function useUpdateStandard() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: Partial<Omit<StandardPayload, "areaId">> }, t) => FiveSService.updateStandard(id, body, t),
  );
}

export function useApproveStandard() {
  return useFiveSMutation((id: string, t) => FiveSService.approveStandard(id, t));
}

export function useReviseStandard() {
  return useFiveSMutation((id: string, t) => FiveSService.reviseStandard(id, t));
}

export function useDeleteStandardDraft() {
  return useFiveSMutation((id: string, t) => FiveSService.deleteStandardDraft(id, t));
}

// ── Routines ──────────────────────────────────────────────────────────────────

export function useFiveSRoutines(params: { areaId?: string; responsibleId?: string; status?: AreaStatusFilter }) {
  return useFiveSQuery(["routines", params], (t) => FiveSService.listRoutines(params, t));
}

export function useRoutineSchedule(id: string | undefined, params: { from?: string; to?: string } = {}) {
  return useFiveSQuery(["routine-schedule", id, params], (t) => FiveSService.routineSchedule(id!, params, t), { enabled: !!id });
}

export function useCreateRoutine() {
  return useFiveSMutation((body: RoutinePayload, t) => FiveSService.createRoutine(body, t));
}

export function useUpdateRoutine() {
  return useFiveSMutation(({ id, body }: { id: string; body: UpdateRoutinePayload }, t) => FiveSService.updateRoutine(id, body, t));
}

export function useRecordRoutineCompletion() {
  return useFiveSMutation(
    ({ id, body }: { id: string; body: { scheduledDate: string; outcome: RoutineOutcome; exception?: string } }, t) =>
      FiveSService.recordCompletion(id, body, t),
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function useFiveSResponsibilities(enabled: boolean) {
  return useFiveSQuery(["responsibilities"], (t) => FiveSService.responsibilities(t), { enabled });
}

export function useAssignResponsibility() {
  return useFiveSMutation((body: { employeeId: string; responsibility: Responsibility }, t) => FiveSService.assignResponsibility(body, t));
}

export function useRemoveResponsibility() {
  return useFiveSMutation((id: string, t) => FiveSService.removeResponsibility(id, t));
}

export function useFiveSChangeLog(enabled: boolean, params: { entityType?: string; limit?: number } = {}) {
  return useFiveSQuery(["change-log", params], (t) => FiveSService.changeLog(params, t), { enabled });
}

export function useSampleDataStatus() {
  return useFiveSQuery(["sample-data"], (t) => FiveSService.sampleStatus(t));
}

export function useAddSampleData() {
  return useFiveSMutation((_: void, t) => FiveSService.addSampleData(t));
}

export function useRemoveSampleData() {
  return useFiveSMutation((_: void, t) => FiveSService.removeSampleData(t));
}
