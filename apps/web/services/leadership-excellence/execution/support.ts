import type {
  PlanningActor,
  PlanningPerson,
} from "../performance-planning/types";
import { sameGoalReference } from "./helpers";
import type {
  ExecutionAction,
  ExecutionGoal,
  ExecutionSupportRequest,
  ExecutionView,
} from "./types";

export function supportPerson(id: string, people: PlanningPerson[]) {
  if (!id) return undefined;
  return people.find((person) => person.id === id || person.userId === id);
}

export function isSupportActor(
  id: string,
  actor: PlanningActor,
  people: PlanningPerson[],
) {
  if (!id) return false;
  const person = supportPerson(id, people);
  return (
    id === actor.employeeId ||
    id === actor.userId ||
    !!(person &&
      (person.id === actor.employeeId || person.userId === actor.userId))
  );
}

export function supportAcknowledgementState(request: ExecutionSupportRequest) {
  if (request.acknowledgement) return "ACCEPTED";
  return request.status === "OPEN" || request.status === "IN_PROGRESS"
    ? "PENDING"
    : "NOT_RECORDED";
}

export function supportAcceptanceElapsed(request: ExecutionSupportRequest) {
  if (!request.acknowledgement) return null;
  const elapsed =
    Date.parse(request.acknowledgement.at) - Date.parse(request.createdAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  let remaining = Math.floor(elapsed / 1_000);
  const parts: string[] = [];
  for (const [unit, size] of [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ] as const) {
    const value = Math.floor(remaining / size);
    remaining %= size;
    if (value) parts.push(`${value} ${unit}${value === 1 ? "" : "s"}`);
    if (parts.length === 2) break;
  }
  return parts.join(" ") || "0 seconds";
}

export function supportSummary(
  requests: ExecutionSupportRequest[],
  actor: PlanningActor,
  people: PlanningPerson[],
) {
  const totals = { sent: 0, received: 0, pending: 0, accepted: 0, notRecorded: 0 };
  for (const request of requests) {
    if (isSupportActor(request.requestorId, actor, people)) totals.sent++;
    if (isSupportActor(request.assignedToId, actor, people)) totals.received++;
    const state = supportAcknowledgementState(request);
    if (state === "ACCEPTED") totals.accepted++;
    else if (state === "PENDING") totals.pending++;
    else totals.notRecorded++;
  }
  return totals;
}

export function groupSupportRequests(
  requests: ExecutionSupportRequest[],
  people: PlanningPerson[],
) {
  const groups = new Map<
    string,
    {
      key: string;
      requestorId: string;
      assignedToId: string;
      sent: number;
      accepted: number;
      pending: number;
      notRecorded: number;
    }
  >();
  for (const request of requests) {
    const requestorId =
      supportPerson(request.requestorId, people)?.id || request.requestorId;
    const assignedToId =
      supportPerson(request.assignedToId, people)?.id || request.assignedToId;
    const key = JSON.stringify([requestorId, assignedToId]);
    const group = groups.get(key) || {
      key,
      requestorId,
      assignedToId,
      sent: 0,
      accepted: 0,
      pending: 0,
      notRecorded: 0,
    };
    group.sent++;
    const state = supportAcknowledgementState(request);
    if (state === "ACCEPTED") group.accepted++;
    else if (state === "PENDING") group.pending++;
    else group.notRecorded++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.sent - a.sent);
}

export function supportRequestsInScope(
  data: ExecutionView,
  {
    scope,
    cycle,
    department,
    goals,
    actions,
  }: {
    scope: "personal" | "department";
    cycle: string;
    department: string;
    goals: ExecutionGoal[];
    actions: ExecutionAction[];
  },
) {
  return data.supportRequests.filter((request) => {
    const goal =
      data.goals.find((g) => g.key === request.goalKey) ||
      data.goals.find((g) => sameGoalReference(g.key, request.goalKey));
    const action = data.actions.find((a) => a.key === request.actionKey);
    if (cycle && (request.cycle || goal?.cycle || action?.cycle) !== cycle)
      return false;
    const linked =
      goals.some((g) => sameGoalReference(g.key, request.goalKey)) ||
      actions.some((a) => a.key === request.actionKey);
    const direct =
      isSupportActor(request.requestorId, data.actor, data.references.people) ||
      isSupportActor(request.assignedToId, data.actor, data.references.people);
    // A recipient can have a minimal request projection without access to its
    // goal. An explicit department still requires linked work in that scope.
    return linked || (direct && (scope === "personal" || !department));
  });
}
