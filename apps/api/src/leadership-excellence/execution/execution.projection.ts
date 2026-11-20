import { isManager, published } from '../performance-planning/planning.rules';
import { calendarPeriods } from '../performance-planning/planning-calendar';
import { matchesSupportPerson } from './execution-support';
import type {
  ApprovedVersion,
  DeliveryAction,
  Goal,
  Objective,
  PlanningActor,
  PlanningDocument,
  PlanningReferences,
  PlanningState,
} from '../performance-planning/planning.types';
import type {
  ExecutionAction,
  ExecutionAssignment,
  ExecutionGoal,
  ExecutionState,
  ExecutionView,
} from './execution.types';

export interface ExecutionSource {
  revision: number;
  state: PlanningState;
  actor: PlanningActor;
  references: PlanningReferences;
}
export const commitmentKey = (
  documentId: string,
  itemId: string,
  version: number,
) => `${documentId}/${itemId}/v${version}`;
export const actionKey = (documentId: string, id: string) =>
  `${documentId}/action/${id}`;
export const executionToday = (timeZone = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
export const emptyExecutionState = (): ExecutionState => ({
  schema: 1,
  results: [],
  actionUpdates: [],
  supportRequests: [],
});

/** Cumulative per-item approvals must never accidentally publish another draft. */
function approvedItems(document: PlanningDocument, snapshot: ApprovedVersion) {
  const objectives = snapshot.data.objectives.filter(
    (item) =>
      (!snapshot.itemVersions?.[item.id] ||
        snapshot.itemVersions[item.id] === snapshot.version) &&
      (!snapshot.approvedItem ||
        (snapshot.approvedItem.kind === 'objective' &&
          snapshot.approvedItem.itemId === item.id)),
  );
  const goals = snapshot.data.goals.filter(
    (item) =>
      (!snapshot.itemVersions?.[item.id] ||
        snapshot.itemVersions[item.id] === snapshot.version) &&
      (!snapshot.approvedItem ||
        (snapshot.approvedItem.kind === 'goal' &&
          snapshot.approvedItem.itemId === item.id)),
  );
  return document.kind === 'COMPANY'
    ? objectives.map((item) => ({ item, kind: 'OBJECTIVE' as const }))
    : goals.map((item) => ({ item, kind: 'GOAL' as const }));
}
const safeItem = <T extends Objective | Goal>(item: T): T => {
  const copy = structuredClone(item);
  if ('sources' in copy) {
    copy.sources = [];
    copy.sourceRationale = '';
  }
  return copy;
};

/** No raw document, draft, SWOT finding or source evidence leaves this projection. */
export function projectExecution(
  source: ExecutionSource,
  stored: ExecutionState,
  revision: number,
  today = executionToday(source.references.timeZone),
): ExecutionView {
  const { actor, state, references } = source;
  const employeeId = actor.employeeId;
  const manager = isManager(actor);
  const matches = (id: string | undefined) => !!employeeId && id === employeeId;
  const manages = (doc: PlanningDocument) =>
    manager ||
    (actor.role === 'HOD' &&
      !!actor.departmentId &&
      actor.departmentId === doc.departmentId);
  const snapshots = state.documents
    .filter((doc) => doc.kind !== 'SWOT')
    .flatMap((document) => {
      const current = published(document, today);
      if (!current) return [];
      return document.versions
        .filter((version) => version.effectiveDate <= today)
        .flatMap((version) =>
          approvedItems(document, version).map(({ item, kind }) => ({
            document,
            version,
            item,
            kind,
            current:
              (current.itemVersions?.[item.id] ?? current.version) ===
              version.version,
          })),
        );
    });
  const allGoals = new Map<string, ExecutionGoal>();
  // Applicability is decided from ALL approved versions before role filtering.
  // A former provider must not gain new-period access just because v2 is hidden.
  const assignmentVersions = snapshots.flatMap(({ document, version, item }) =>
    version.data.assignments
      .filter((assignment) => assignment.goalId === item.id)
      .map((assignment) => ({
        documentId: document.id,
        assignmentId: assignment.id,
        version: version.version,
        effectiveDate: version.effectiveDate,
      })),
  );
  const assignmentRows: ExecutionAssignment[] = [];
  const actions = new Map<string, ExecutionAction>();
  const relatedPersonal = new Set<string>();
  const addAction = (
    document: PlanningDocument,
    version: ApprovedVersion,
    item: Goal | Objective,
    action: DeliveryAction,
    goalKey: string,
  ) => {
    const canUpdate = matches(action.ownerId);
    const canCheck = manages(document) && !canUpdate;
    if (!manages(document) && !canUpdate && !relatedPersonal.has(goalKey))
      return;
    const key = actionKey(document.id, action.id);
    const previous = actions.get(key);
    if (previous && previous.version > version.version) return;
    const safe = structuredClone(action);
    safe.sources = [];
    actions.set(key, {
      key,
      documentId: document.id,
      version: version.version,
      cycle: document.cycle,
      departmentId: document.departmentId,
      goalKey,
      goalTitle: item.title,
      action: safe,
      canUpdate,
      canCheck,
    });
    if (canUpdate) relatedPersonal.add(goalKey);
  };
  for (const { document, version, item, kind, current } of snapshots) {
    const key = commitmentKey(document.id, item.id, version.version);
    const personal =
      matches(item.ownerId) ||
      (document.kind === 'INDIVIDUAL' && matches(document.scopeId)) ||
      (['TEAM', 'POSITION'].includes(document.kind) &&
        !!employeeId &&
        version.data.contributorIds.includes(employeeId));
    if (personal) relatedPersonal.add(key);
    for (const assignment of version.data.assignments.filter(
      (a) => a.goalId === item.id,
    )) {
      const relevant =
        personal ||
        matches(assignment.providerId) ||
        matches(assignment.verifierId) ||
        matches(assignment.ownerId);
      if (!manages(document) && !relevant) continue;
      const definition = version.definitions.find(
        (d) => d.id === assignment.definitionId,
      );
      if (!definition) continue; // An unpublished or missing definition cannot be guessed from today's library.
      if (relevant) relatedPersonal.add(key);
      const generated = calendarPeriods(
        assignment.startDate,
        assignment.endDate,
        assignment.updateFrequency,
        assignment.calendar,
      );
      const periods = generated.map((period) => {
        const approved = assignment.targets.find(
          (p) =>
            p.id === period.id ||
            (p.start === period.start && p.end === period.end),
        );
        const scheduled = approved?.scheduled ?? period.scheduled;
        return {
          ...period,
          scheduled,
          submissionDate: approved?.submissionDate ?? period.submissionDate,
          target:
            scheduled === false
              ? null
              : approved
                ? approved.target
                : assignment.targetMode === 'SAME'
                  ? assignment.target
                  : null,
          upper:
            scheduled === false
              ? null
              : approved
                ? approved.upper
                : assignment.targetMode === 'SAME'
                  ? assignment.upper
                  : null,
        };
      });
      const peerVersions = assignmentVersions
        .filter(
          (peer) =>
            peer.documentId === document.id &&
            peer.assignmentId === assignment.id,
        )
        // A newer approved revision supersedes older revisions once effective,
        // even if an older revision had a later planned start date.
        .sort((a, b) => a.version - b.version);
      const entryPeriodIds = periods
        .filter((period) => {
          const applicable =
            peerVersions
              .filter((peer) => peer.effectiveDate <= period.start)
              .at(-1) || peerVersions[0];
          return (
            period.scheduled !== false &&
            applicable?.version === version.version
          );
        })
        .map((period) => period.id);
      assignmentRows.push({
        key: `${document.id}/${assignment.id}/v${version.version}`,
        documentId: document.id,
        version: version.version,
        cycle: document.cycle,
        departmentId: document.departmentId,
        goalKey: key,
        goalTitle: item.title,
        scope: document.kind,
        current,
        effectiveDate: version.effectiveDate,
        assignment: structuredClone(assignment),
        definition: structuredClone(definition),
        periods,
        entryPeriodIds,
        canEnter: matches(assignment.providerId),
        canVerify:
          matches(assignment.verifierId) && !matches(assignment.providerId),
      });
    }
    const approvedActions = version.data.actions.filter(
      (a) => a.goalId === item.id,
    );
    if (approvedActions.some((a) => matches(a.ownerId)))
      relatedPersonal.add(key);
    const parentRef = 'parent' in item ? item.parent : null;
    let parent: ExecutionGoal['parent'] = null;
    if (parentRef) {
      const target = snapshots.find(
        (row) =>
          row.document.id === parentRef.documentId &&
          row.version.version === parentRef.version &&
          row.item.id === parentRef.goalId,
      );
      if (target)
        parent = {
          code: target.item.code,
          title: target.item.title,
          kind: target.document.kind,
        };
    }
    allGoals.set(key, {
      key,
      documentId: document.id,
      version: version.version,
      cycle: document.cycle,
      kind: document.kind as ExecutionGoal['kind'],
      departmentId: document.departmentId,
      scopeId: document.scopeId,
      planTitle: version.data.title,
      itemKind: kind,
      item: safeItem(item),
      parentKey: parentRef
        ? commitmentKey(
            parentRef.documentId,
            parentRef.goalId,
            parentRef.version,
          )
        : null,
      parent,
      personal: relatedPersonal.has(key),
      canRequestSupport: manages(document) || relatedPersonal.has(key),
      current,
    });
    if (current)
      for (const action of approvedActions)
        addAction(document, version, item, action, key);
    if (current)
      for (const link of version.data.actionLinks || []) {
        if (
          link.goalId !== item.id ||
          (!manages(document) && !relatedPersonal.has(key))
        )
          continue;
        const parent = state.documents.find(
          (d) => d.id === link.documentId && d.kind === 'DEPARTMENT',
        );
        const parentVersion = parent?.versions.find(
          (v) => v.version === link.version && v.effectiveDate <= today,
        );
        const action = parentVersion?.data.actions.find(
          (a) => a.id === link.actionId,
        );
        if (!parent || !parentVersion || !action) continue;
        const commitment = approvedItems(parent, parentVersion).find(
          (row) => row.item.id === action.goalId,
        );
        if (!commitment) continue;
        const parentKey = commitmentKey(
          parent.id,
          commitment.item.id,
          parentVersion.version,
        );
        if (relatedPersonal.has(key)) relatedPersonal.add(parentKey);
        addAction(parent, parentVersion, commitment.item, action, parentKey);
      }
  }
  // Actions may be explicitly added to an already-approved programme goal.
  // They carry an exact approved parent. Unlinked draft actions never execute.
  for (const document of state.documents.filter((d) => d.kind !== 'SWOT')) {
    for (const action of document.data.actions) {
      if (!action.parent || action.parent.documentId !== document.id) continue;
      const sourceRow = snapshots.find(
        (row) =>
          row.document.id === document.id &&
          row.version.version === action.parent!.version &&
          row.item.id === action.parent!.goalId,
      );
      if (!sourceRow) continue;
      const key = commitmentKey(
        document.id,
        sourceRow.item.id,
        sourceRow.version.version,
      );
      if (matches(action.ownerId)) relatedPersonal.add(key);
      addAction(document, sourceRow.version, sourceRow.item, action, key);
    }
  }
  const visibleGoalKeys = new Set<string>();
  for (const [key, goal] of allGoals) {
    const doc = state.documents.find((d) => d.id === goal.documentId)!;
    if (manages(doc) || relatedPersonal.has(key)) {
      goal.personal = relatedPersonal.has(key);
      goal.canRequestSupport = manages(doc) || relatedPersonal.has(key);
      visibleGoalKeys.add(key);
    }
  }
  const assignments = assignmentRows.filter((a) =>
    visibleGoalKeys.has(a.goalKey),
  );
  const assignmentKeys = new Set(assignments.map((a) => a.key));
  const actionRows = [...actions.values()];
  const actionKeys = new Set(actionRows.map((a) => a.key));
  const actionUpdates = stored.actionUpdates.filter((entry) =>
    actionKeys.has(entry.actionKey),
  );
  for (const action of actionRows) {
    if (actionUpdates.some((entry) => entry.actionKey === action.key)) continue;
    const legacy = (state.programmeActionProgress || []).filter(
      (entry) =>
        entry.documentId === action.documentId &&
        entry.actionId === action.action.id,
    );
    const last = legacy.at(-1);
    if (last)
      actionUpdates.push({
        actionKey: action.key,
        status:
          last.status === 'COMPLETED'
            ? 'COMPLETED'
            : last.status === 'PLANNED'
              ? 'NOT_STARTED'
              : 'IN_PROGRESS',
        progress: last.status === 'COMPLETED' ? 100 : 0,
        note: last.note,
        evidence: last.evidence,
        delayReason: '',
        updatedAt: last.updatedAt,
        updatedBy: last.updatedBy,
        history: legacy.map((event) => ({
          at: event.updatedAt,
          by: event.updatedBy,
          name: '',
          event: event.status,
          detail: event.note,
        })),
      });
  }
  const supportRequests = stored.supportRequests
    .filter(
      (entry) =>
        visibleGoalKeys.has(entry.goalKey) ||
        matchesSupportPerson(actor, references.people, entry.assignedToId) ||
        matchesSupportPerson(actor, references.people, entry.requestorId),
    )
    .map((entry) => ({
      ...structuredClone(entry),
      cycle: allGoals.get(entry.goalKey)?.cycle,
      goalTitle: allGoals.get(entry.goalKey)?.item.title,
      canAcknowledge:
        !entry.acknowledgement &&
        ['OPEN', 'IN_PROGRESS'].includes(entry.status) &&
        matchesSupportPerson(actor, references.people, entry.assignedToId),
      canRespond:
        manager ||
        matchesSupportPerson(actor, references.people, entry.assignedToId),
      canClose:
        manager ||
        matchesSupportPerson(actor, references.people, entry.requestorId),
    }));
  const departmentIds = new Set([
    ...assignments.map((a) => a.departmentId),
    ...[...allGoals.values()]
      .filter((g) => visibleGoalKeys.has(g.key))
      .map((g) => g.departmentId),
  ]);
  return {
    schema: 1,
    revision,
    planningRevision: source.revision,
    today,
    actor,
    canViewDepartment: manager || actor.role === 'HOD',
    references: {
      departments: references.departments.filter(
        (d) =>
          manager || departmentIds.has(d.id) || d.id === actor.departmentId,
      ),
      // Contact selector uses organisation-scoped EMS records, never credentials.
      people: references.people.map(
        ({ id, name, departmentId, position, role, userId }) => ({
          id,
          name,
          departmentId,
          position,
          role,
          userId,
        }),
      ),
    },
    goals: [...allGoals.values()].filter((goal) =>
      visibleGoalKeys.has(goal.key),
    ),
    assignments,
    actions: actionRows,
    results: stored.results.filter((result) =>
      assignmentKeys.has(result.assignmentKey),
    ),
    actionUpdates,
    supportRequests,
  };
}
