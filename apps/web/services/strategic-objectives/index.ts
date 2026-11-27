import {
  approvedVersion,
  assertValid,
  currentVersion,
  demoSession,
  generateCode,
  goalDraft,
  newDraft,
  objectiveDraft,
  publishedVersion,
  requireEditable,
  requirePermission,
  requireSameObjective,
  revision,
  validateGoal,
  validateObjective,
  visibleVersion,
} from "./rules";
import { createSeedState } from "./seed";
import { pillars } from "./stubs/pillars";
import { departments } from "./stubs/departments";
import { employees } from "./stubs/employees";
import { planningPeriods } from "./stubs/planning-periods";
import type {
  DemoRole,
  Dependencies,
  GoalRecord,
  GoalView,
  MockState,
  ObjectiveRecord,
  ObjectiveView,
  PlanRecord,
  RecordView,
  StrategicObjectivesService,
  Version,
} from "./types";

export type * from "./types";

// Application composition point: replace only this adapter after backend approval.
export function createStrategicObjectivesService(): StrategicObjectivesService {
  return createMockStrategicObjectivesService();
}

// One instance per mounted shell, not a server-global store or localStorage.
// Swap this factory for an API adapter implementing the same interface later.
export function createMockStrategicObjectivesService(
  options: { initial?: MockState; now?: () => string; id?: () => string } = {},
): StrategicObjectivesService {
  const state = structuredClone(options.initial ?? createSeedState());
  const refs: Dependencies = structuredClone({
    pillars: [...pillars],
    departments: [...departments],
    employees: [...employees],
    planningPeriods: [...planningPeriods],
  });
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.id ?? (() => crypto.randomUUID());
  const today = () => now().slice(0, 10);
  let role: DemoRole = "LEADERSHIP";
  const session = () => demoSession(role, refs);
  // Reserve temporary codes too, so approval never makes an issued code reusable.
  const issuedCodes = new Set(
    [...state.objectives, ...state.goals].map((item) => item.code),
  );
  const objective = (id: string) => {
    const found = state.objectives.find((item) => item.id === id);
    if (!found) throw new Error("The linked objective was not found.");
    return found;
  };
  const goal = (id: string) => {
    const found = state.goals.find((item) => item.id === id);
    if (!found) throw new Error("This goal was not found.");
    return found;
  };
  function view<T>(record: PlanRecord<T>): RecordView<T> | null {
    const selected = visibleVersion(record, role, today());
    if (!selected) return null;
    const readable =
      role === "READER"
        ? record.versions.filter(
            (entry) =>
              entry.status === "Approved" &&
              !!entry.effectiveDate &&
              entry.effectiveDate <= today(),
          )
        : record.versions;
    return structuredClone({
      id: record.id,
      code: record.code,
      current: selected,
      history: readable.filter((entry) => entry.number !== selected.number),
      audit: record.audit.filter(
        (entry) =>
          role !== "READER" ||
          (entry.action === "Approved" &&
            readable.some((version) => version.number === entry.version)),
      ),
    });
  }
  function goalView(record: GoalRecord): GoalView | null {
    if (!visibleVersion(objective(record.objectiveId), role, today()))
      return null;
    const item = view(record);
    return item ? { ...item, objectiveId: record.objectiveId } : null;
  }
  function objectiveView(record: ObjectiveRecord): ObjectiveView | null {
    const item = view(record);
    return item
      ? {
          ...item,
          goals: state.goals
            .filter((entry) => entry.objectiveId === record.id)
            .map(goalView)
            .filter((entry): entry is GoalView => !!entry),
        }
      : null;
  }
  function saveVersion<T>(record: PlanRecord<T>, data: T, expected: number) {
    const current = requireEditable(record, expected);
    const at = now();
    record.versions[record.versions.length - 1] = {
      ...current,
      data: structuredClone(data),
      updatedAt: at,
      updatedBy: session().employeeId,
    };
    record.audit.push({
      action: "Saved draft",
      actorId: session().employeeId,
      at,
      version: current.number,
    });
  }
  function approve<T>(
    record: PlanRecord<T>,
    kind: "OBJ" | "GOAL",
    parent: ObjectiveRecord,
  ) {
    const at = now();
    const current = currentVersion(record);
    const next = approvedVersion(current, session().employeeId, at);
    const data =
      kind === "OBJ"
        ? currentVersion(parent).data
        : publishedVersion(parent, next.effectiveDate!)!.data;
    const period = refs.planningPeriods.find(
      (item) => item.id === data.planningPeriodId,
    )!;
    const code = record.code.includes("-DRAFT-")
      ? generateCode(kind, [...issuedCodes], data.primaryPillarCode, period)
      : record.code;
    record.versions[record.versions.length - 1] = next;
    record.code = code;
    issuedCodes.add(code);
    record.audit.push({
      action: "Approved",
      actorId: session().employeeId,
      at,
      version: next.number,
    });
  }
  function startRevision<T>(
    record: PlanRecord<T>,
    reason: string,
    effectiveDate: string,
  ) {
    requirePermission(session(), "edit");
    const at = now();
    const next: Version<T> = revision(
      record,
      reason,
      effectiveDate,
      session().employeeId,
      at,
    );
    record.versions.push(next);
    record.audit.push({
      action: "Revision started",
      actorId: session().employeeId,
      at,
      version: next.number,
    });
  }
  return {
    async getSession() {
      return session();
    },
    async setDemoRole(next) {
      demoSession(next, refs);
      role = next;
      return session();
    },
    async getPillars() {
      return structuredClone(refs.pillars);
    },
    async getDepartments() {
      return structuredClone(refs.departments);
    },
    async getEmployees() {
      return structuredClone(refs.employees);
    },
    async getPlanningPeriods() {
      return structuredClone(refs.planningPeriods);
    },
    async getObjectives() {
      return state.objectives
        .map(objectiveView)
        .filter((item): item is ObjectiveView => !!item);
    },
    async createObjective(input = {}) {
      requirePermission(session(), "edit");
      const at = now();
      const code = generateCode("OBJ", [...issuedCodes]);
      const record: ObjectiveRecord = {
        id: nextId(),
        code,
        versions: [newDraft(objectiveDraft(input), session().employeeId, at)],
        audit: [
          { action: "Created", actorId: session().employeeId, at, version: 1 },
        ],
      };
      state.objectives.push(record);
      issuedCodes.add(code);
      return objectiveView(record)!;
    },
    async saveObjective(id, input, expectedVersion) {
      requirePermission(session(), "edit");
      const record = objective(id);
      saveVersion(
        record,
        objectiveDraft(input, currentVersion(record).data),
        expectedVersion,
      );
      return objectiveView(record)!;
    },
    async approveObjective(id, expectedVersion) {
      requirePermission(session(), "approve");
      const record = objective(id);
      const draft = requireEditable(record, expectedVersion);
      assertValid(validateObjective(draft.data, refs));
      // A changed period must not silently invalidate already published goals.
      for (const child of state.goals.filter(
        (item) => item.objectiveId === id,
      )) {
        const published = publishedVersion(
          child,
          draft.effectiveDate ?? today(),
        );
        if (published)
          assertValid(validateGoal(published.data, draft.data, refs));
      }
      approve(record, "OBJ", record);
      return objectiveView(record)!;
    },
    async saveGoal(objectiveId, input, id, expectedVersion) {
      requirePermission(session(), "edit");
      objective(objectiveId); // Drafts may be incomplete, but always have one real parent.
      if (id) {
        const record = goal(id);
        requireSameObjective(record.objectiveId, objectiveId);
        if (expectedVersion === undefined)
          throw new Error("Provide the version you are editing.");
        saveVersion(
          record,
          goalDraft(input, currentVersion(record).data),
          expectedVersion,
        );
        return goalView(record)!;
      }
      const at = now();
      const code = generateCode("GOAL", [...issuedCodes]);
      const record: GoalRecord = {
        id: nextId(),
        objectiveId,
        code,
        versions: [newDraft(goalDraft(input), session().employeeId, at)],
        audit: [
          { action: "Created", actorId: session().employeeId, at, version: 1 },
        ],
      };
      state.goals.push(record);
      issuedCodes.add(code);
      return goalView(record)!;
    },
    async approveGoal(id, expectedVersion) {
      requirePermission(session(), "approve");
      const record = goal(id);
      const draft = requireEditable(record, expectedVersion);
      const parent = objective(record.objectiveId);
      const approvedParent = publishedVersion(
        parent,
        draft.effectiveDate ?? today(),
      );
      if (!approvedParent)
        throw new Error(
          "Approve the linked objective before approving this goal.",
        );
      assertValid(validateGoal(draft.data, approvedParent.data, refs));
      approve(record, "GOAL", parent);
      return goalView(record)!;
    },
    async reviseObjective(id, reason, effectiveDate) {
      const record = objective(id);
      startRevision(record, reason, effectiveDate);
      return objectiveView(record)!;
    },
    async reviseGoal(id, reason, effectiveDate) {
      const record = goal(id);
      startRevision(record, reason, effectiveDate);
      return goalView(record)!;
    },
    async getApprovedCompanyGoals(departmentId) {
      // Read contract for Department Goals. IDs refer to this register, never new copies.
      return structuredClone(
        state.goals.flatMap((record) => {
          const approved = publishedVersion(record, today());
          const parent = objective(record.objectiveId);
          const approvedParent = publishedVersion(parent, today());
          if (
            !approved ||
            !approvedParent ||
            (departmentId &&
              !approved.data.contributingDepartmentIds.includes(departmentId))
          )
            return [];
          return [
            {
              id: record.id,
              code: record.code,
              objectiveId: parent.id,
              objectiveCode: parent.code,
              objectiveTitle: approvedParent.data.title,
              version: approved.number,
              data: approved.data,
            },
          ];
        }),
      );
    },
  };
}
