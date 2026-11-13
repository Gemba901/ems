import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  calendarPeriods,
  MAX_TARGET_PERIODS,
  resolveAssignmentCalendar,
  TARGET_PERIOD_LIMIT_MESSAGE,
} from './planning-calendar';
import type {
  ActionLink,
  ApprovedParentGoal,
  ApprovedVersion,
  Assignment,
  DocumentPermissions,
  Finding,
  Frequency,
  Goal,
  ItemKind,
  KpiDefinition,
  Objective,
  ParentGoal,
  PlanData,
  PlanningActor,
  PlanningDocument,
  PlanningReferences,
  PlanningState,
  SourceLink,
  TargetPeriod,
} from './planning.types';

export const PILLAR_CODES = [
  'LEX',
  'PEX',
  'OPX',
  'CMX',
  'SGEX',
  'FPEX',
] as const;
export const OBJECTIVE_PILLAR_BUDGETS = Object.freeze({
  LEX: 10,
  PEX: 20,
  OPX: 30,
  CMX: 20,
  SGEX: 10,
  FPEX: 10,
});
export const validObjectivePriority = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 10;
export const validObjectiveWeightage = (
  value: unknown,
  pillar: string,
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 1 &&
  value <=
    OBJECTIVE_PILLAR_BUDGETS[pillar as keyof typeof OBJECTIVE_PILLAR_BUDGETS] &&
  Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
export function objectiveAllocations(objectives: Objective[]) {
  return PILLAR_CODES.map((pillar) => {
    const rows = objectives.filter((o) => o.pillar === pillar);
    const target = OBJECTIVE_PILLAR_BUDGETS[pillar];
    const total =
      rows.reduce(
        (sum, o) =>
          sum +
          (typeof o.weightage === 'number' && Number.isFinite(o.weightage)
            ? Math.round(o.weightage * 100)
            : 0),
        0,
      ) / 100;
    const missing = rows.filter((o) => o.weightage == null).length;
    const invalid = rows.filter(
      (o) =>
        o.weightage != null && !validObjectiveWeightage(o.weightage, pillar),
    ).length;
    return {
      pillar,
      target,
      total,
      count: rows.length,
      missing,
      invalid,
      balanced:
        rows.length > 0 &&
        !missing &&
        !invalid &&
        Math.round(total * 100) === target * 100,
    };
  });
}
export function findingReviewIssues(
  finding: Finding,
  references: PlanningReferences,
): string[] {
  const issues: string[] = [];
  if (!finding.title?.trim()) issues.push('Describe what was found.');
  if (!finding.explanation?.trim())
    issues.push('Add the supporting facts and context.');
  if (!finding.impact?.trim()) issues.push('Explain the business impact.');
  issues.push(...findingAlignmentIssues(finding));
  if (!finding.evidence?.trim() && !finding.sourceUrl?.trim())
    issues.push('Identify the source or evidence and the period covered.');
  if (!validFindingWeightage(finding.weightage))
    issues.push('Enter finding weightage from 1 to 10.');
  if (finding.basis === 'NEEDS_CHECKING' || finding.response === 'VERIFY')
    issues.push(
      'Resolve the missing evidence before marking this finding reviewed.',
    );
  if (!finding.response) issues.push('Choose a management response.');
  if (!finding.decisionNote?.trim())
    issues.push('Explain the review decision.');
  if (['MONITOR', 'MAINTAIN', 'USE', 'DEFER'].includes(finding.response)) {
    if (!references.people.some((p) => p.id === finding.followupOwnerId))
      issues.push('Select the follow-up owner.');
    if (!validDate(finding.reviewDate))
      issues.push('Choose the next review date.');
  }
  return issues;
}
function findingAlignmentIssues(finding: Finding): string[] {
  const alignments = planningAlignmentValues(finding);
  if (
    !alignments.length ||
    !alignments.every((value) =>
      ['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(value),
    )
  )
    return ['Select one or more QCDSMT alignments or Business focus.'];
  if (alignments.includes('OTHER') && !finding.otherBusinessFocus?.trim())
    return ['Describe the Business focus.'];
  return [];
}
export const FREQUENCIES: Frequency[] = [
  'DAILY',
  'WEEKLY',
  'FORTNIGHTLY',
  'TWICE_MONTHLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
];
export const MANAGEMENT = ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT'];
export const isManager = (actor: PlanningActor) =>
  MANAGEMENT.includes(actor.role);
export const isCoordinator = (actor: PlanningActor) => isManager(actor);
export const blankData = (): PlanData => ({
  title: '',
  ownerId: '',
  approverId: '',
  coordinatorIds: [],
  contributorIds: [],
  startDate: '',
  endDate: '',
  consideredPillars: [],
  findings: [],
  objectives: [],
  goals: [],
  assignments: [],
  actions: [],
  actionLinks: [],
});
export const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
/** Stable scope key: preserve annual keys; custom periods carry both boundaries. */
export function resolvePlanningPeriod(input: Record<string, unknown>): {
  cycle: string;
  startDate: string;
  endDate: string;
} {
  const suppliedCycle = cleanText(input.cycle, 30);
  let startDate = cleanText(input.startDate, 10);
  let endDate = cleanText(input.endDate, 10);
  const suppliedDates = !!startDate || !!endDate;
  if (suppliedDates && (!startDate || !endDate))
    throw new BadRequestException('Choose both the From and To dates.');
  if (!suppliedDates) {
    if (/^\d{4}$/.test(suppliedCycle)) {
      startDate = `${suppliedCycle}-01-01`;
      endDate = `${suppliedCycle}-12-31`;
    } else {
      const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(
        suppliedCycle,
      );
      if (match) [, startDate, endDate] = match;
    }
  }
  if (!validDate(startDate) || !validDate(endDate))
    throw new BadRequestException(
      'Choose valid From and To calendar dates for the planning period.',
    );
  if (startDate > endDate)
    throw new BadRequestException(
      'The To date must be on or after the From date.',
    );
  if (startDate < '2000-01-01' || endDate > '2200-12-31')
    throw new BadRequestException(
      'Planning dates must be between 2000 and 2200.',
    );
  const year = startDate.slice(0, 4);
  const cycle =
    startDate === `${year}-01-01` && endDate === `${year}-12-31`
      ? year
      : `${startDate}..${endDate}`;
  if (suppliedDates && suppliedCycle && suppliedCycle !== cycle)
    throw new BadRequestException(
      'The selected planning period does not match the From and To dates.',
    );
  return { cycle, startDate, endDate };
}
const day = (value: string, amount: number) => {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const monthEnd = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
export function periods(
  start: string,
  end: string,
  frequency: Frequency,
): TargetPeriod[] {
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    !FREQUENCIES.includes(frequency)
  )
    return [];
  const rows: TargetPeriod[] = [];
  let current = start;
  while (current <= end) {
    if (rows.length >= MAX_TARGET_PERIODS)
      throw new BadRequestException(TARGET_PERIOD_LIMIT_MESSAGE);
    const date = new Date(current + 'T00:00:00Z'),
      year = date.getUTCFullYear(),
      month = date.getUTCMonth();
    let until = current;
    if (frequency === 'WEEKLY') until = day(current, 6);
    else if (frequency === 'FORTNIGHTLY') until = day(current, 13);
    else if (frequency === 'TWICE_MONTHLY')
      until =
        date.getUTCDate() <= 15
          ? `${year}-${String(month + 1).padStart(2, '0')}-15`
          : monthEnd(year, month);
    else if (frequency === 'MONTHLY') until = monthEnd(year, month);
    else if (frequency === 'QUARTERLY')
      until = monthEnd(year, Math.floor(month / 3) * 3 + 2);
    else if (frequency === 'HALF_YEARLY')
      until = monthEnd(year, month < 6 ? 5 : 11);
    else if (frequency === 'YEARLY') until = `${year}-12-31`;
    until = until > end ? end : until;
    rows.push({
      id: `${current}/${until}`,
      label: current === until ? current : `${current} – ${until}`,
      start: current,
      end: until,
      target: null,
      upper: null,
    });
    current = day(until, 1);
  }
  return rows;
}
export const published = (document: PlanningDocument, today: string) => {
  const eligible = document.versions
    .filter((v) => v.effectiveDate <= today)
    .sort((a, b) => a.version - b.version);
  const last = eligible.at(-1);
  if (!last || !document.versions.some((v) => v.approvedItem)) return last;
  // Per-item snapshots carry only their own approval authority. A later unrelated
  // approval cannot prematurely publish a future-dated revision copied in its data.
  const result = structuredClone(last),
    objectives = new Map<string, Objective>(),
    goals = new Map<string, Goal>(),
    itemVersions: Record<string, number> = {};
  for (const version of eligible) {
    if (!version.approvedItem) {
      for (const item of version.data.objectives) {
        objectives.set(item.id, item);
        itemVersions[item.id] = version.version;
      }
      for (const item of version.data.goals) {
        goals.set(item.id, item);
        itemVersions[item.id] = version.version;
      }
    } else {
      const { kind, itemId } = version.approvedItem;
      if (kind === 'objective') {
        const row = version.data.objectives.find((i) => i.id === itemId);
        if (row) {
          objectives.set(row.id, row);
          itemVersions[row.id] = version.version;
        }
      } else {
        const row = version.data.goals.find((i) => i.id === itemId);
        if (row) {
          goals.set(row.id, row);
          itemVersions[row.id] = version.version;
        }
      }
    }
  }
  result.data.objectives = structuredClone([...objectives.values()]);
  result.data.goals = structuredClone([...goals.values()]);
  result.itemVersions = itemVersions;
  return result;
};
export function permissions(
  document: PlanningDocument,
  actor: PlanningActor,
): DocumentPermissions {
  const data = document.data;
  const selected = data.contributorIds.includes(actor.employeeId);
  const swotAccess =
    isCoordinator(actor) ||
    (!!actor.employeeId && data.ownerId === actor.employeeId) ||
    selected ||
    data.coordinatorIds.includes(actor.employeeId);
  const scopeManager =
    actor.role === 'HOD' &&
    !!actor.departmentId &&
    document.departmentId === actor.departmentId;
  const own =
    document.kind === 'INDIVIDUAL' && document.scopeId === actor.employeeId;
  const canManage =
    isCoordinator(actor) || data.coordinatorIds.includes(actor.employeeId);
  const editable =
    document.kind === 'SWOT'
      ? swotAccess
      : document.kind === 'COMPANY'
        ? canManage
        : canManage || scopeManager || own;
  const approverRole = ['SWOT', 'COMPANY'].includes(document.kind)
    ? isManager(actor)
    : isManager(actor) || scopeManager;
  return {
    canRead:
      document.kind === 'SWOT'
        ? swotAccess
        : document.kind === 'COMPANY' ||
          editable ||
          (document.kind === 'DEPARTMENT' &&
            !!actor.departmentId &&
            document.scopeId === actor.departmentId) ||
          (document.kind === 'TEAM' &&
            (document.data.contributorIds.includes(actor.employeeId) ||
              document.versions.some((v) =>
                v.data.contributorIds.includes(actor.employeeId),
              ))) ||
          (document.kind === 'POSITION' &&
            !!actor.employeeId &&
            ((actor.positionIds || []).includes(document.scopeId) ||
              document.data.contributorIds.includes(actor.employeeId) ||
              document.versions.some((v) =>
                v.data.contributorIds.includes(actor.employeeId),
              ))),
    canEdit: editable && document.status === 'DRAFT',
    canConfigure:
      (isManager(actor) || scopeManager) && document.status === 'DRAFT',
    canApprove:
      approverRole &&
      !!actor.employeeId &&
      data.approverId === actor.employeeId,
    canSeeSources: swotAccess,
  };
}
export function assertEdit(document: PlanningDocument, actor: PlanningActor) {
  if (!permissions(document, actor).canEdit)
    throw new ForbiddenException(
      'This plan is locked or you do not have permission to edit it.',
    );
}
/** A read projection only: an objective is never copied into the goal register. */
export function objectiveAsGoal(objective: Objective): Goal {
  return {
    ...objective,
    objectiveId: objective.id,
    parent: null,
    ongoingReason: '',
    definitionId: '',
    measure: objective.measure || '',
    baseline: objective.baseline ?? null,
    baselineReason: objective.baselineReason || '',
    target: objective.target ?? null,
    unit: objective.unit || '',
    approach: objective.approach || '',
    departmentIds: [...(objective.departmentIds || [])],
  };
}
export function approvedPlanningItems(
  document: PlanningDocument,
  version: ApprovedVersion,
): {
  itemKind: 'OBJECTIVE' | 'GOAL';
  goal: Goal;
}[] {
  if (
    document.kind === 'COMPANY' &&
    version.companyPlanningModel === 'MEASURABLE_OBJECTIVES'
  )
    return version.data.objectives
      .filter(
        (objective) =>
          !version.approvedItem ||
          (version.approvedItem.kind === 'objective' &&
            version.approvedItem.itemId === objective.id),
      )
      .map((objective) => ({
        itemKind: 'OBJECTIVE',
        goal: objectiveAsGoal(objective),
      }));
  return version.data.goals
    .filter(
      (goal) =>
        !version.approvedItem ||
        (version.approvedItem.kind === 'goal' &&
          version.approvedItem.itemId === goal.id),
    )
    .map((goal) => ({ itemKind: 'GOAL', goal }));
}
/** Resolves exactly one immutable approved row, including legacy goal versions. */
export function resolveApprovedParent(
  state: PlanningState,
  reference: ParentGoal,
) {
  const document = state.documents.find(
    (d) =>
      d.id === reference.documentId &&
      ['COMPANY', 'DEPARTMENT'].includes(d.kind),
  );
  const version = document?.versions.find(
    (v) => v.version === reference.version,
  );
  if (!document || !version) return null;
  const item = approvedPlanningItems(document, version).find(
    (row) =>
      row.itemKind === (reference.itemKind || 'GOAL') &&
      row.goal.id === reference.goalId,
  );
  return item ? { document, version, ...item } : null;
}
export function parentReferenceIssues(
  child: PlanningDocument,
  reference: ParentGoal,
  state: PlanningState,
  actor?: PlanningActor,
  previous?: ParentGoal | null,
): string[] {
  const resolved = resolveApprovedParent(state, reference);
  if (!resolved || resolved.document.cycle !== child.cycle)
    return [
      'Choose an authorised approved parent objective or goal for this plan and planning period.',
    ];
  const { document: parent, goal } = resolved;
  const matchingScope =
    child.kind === 'DEPARTMENT'
      ? parent.kind === 'COMPANY' &&
        ((reference.itemKind === 'OBJECTIVE' &&
          !!parent.versions
            .find((v) => v.version === reference.version)
            ?.data.objectives.find((o) => o.id === reference.goalId)
            ?.result?.trim()) ||
          goal.departmentIds.includes(child.scopeId))
      : child.kind === 'INDIVIDUAL' && parent.kind === 'COMPANY'
        ? true
        : ['TEAM', 'POSITION', 'INDIVIDUAL'].includes(child.kind) &&
          parent.kind === 'DEPARTMENT' &&
          (child.kind === 'INDIVIDUAL' ||
            parent.scopeId === child.departmentId);
  const retaining =
    child.kind === 'INDIVIDUAL' &&
    previous?.documentId === reference.documentId &&
    previous.goalId === reference.goalId &&
    previous.version === reference.version &&
    (previous.itemKind || 'GOAL') === (reference.itemKind || 'GOAL');
  if (
    !matchingScope ||
    (actor && !permissions(parent, actor).canRead && !retaining)
  )
    return [
      'Choose an authorised approved parent objective or goal for this plan and planning period.',
    ];
  return [];
}
/** Planning may link an approved snapshot before it becomes operational. */
export function approvedParentGoals(
  state: PlanningState,
  actor: PlanningActor,
  today = new Date().toISOString().slice(0, 10),
): ApprovedParentGoal[] {
  // An agreed individual contribution grants a summary of its exact approved
  // parent, never access to the department's other goals or private draft.
  const retained = state.documents.flatMap((document) => {
    if (document.kind !== 'INDIVIDUAL') return [];
    const visible = sanitizeForReader(document, actor, today);
    return visible
      ? [visible.data, ...visible.versions.map((v) => v.data)].flatMap((data) =>
          data.goals.flatMap((goal) =>
            goal.parent
              ? [
                  {
                    ...goal.parent,
                    cycle: visible.cycle,
                    contribution: { documentId: visible.id, goalId: goal.id },
                    current: document.data.goals.some(
                      (saved) =>
                        saved.id === goal.id &&
                        saved.parent?.documentId === goal.parent!.documentId &&
                        saved.parent?.goalId === goal.parent!.goalId &&
                        saved.parent?.version === goal.parent!.version &&
                        (saved.parent?.itemKind || 'GOAL') ===
                          (goal.parent!.itemKind || 'GOAL'),
                    ),
                  },
                ]
              : [],
          ),
        )
      : [];
  });
  return state.documents.flatMap((document) => {
    const kind = document.kind;
    if (kind !== 'COMPANY' && kind !== 'DEPARTMENT') return [];
    const canRead = permissions(document, actor).canRead;
    return [...document.versions]
      .sort((a, b) => b.version - a.version)
      .flatMap((version) =>
        approvedPlanningItems(document, version).flatMap(
          ({ goal, itemKind }) => {
            // Cumulative snapshots keep earlier rows for reading, but only the
            // item actually approved in this version creates a new parent choice.
            if (version.approvedItem && version.approvedItem.itemId !== goal.id)
              return [];
            const links =
              kind === 'DEPARTMENT'
                ? retained.filter(
                    (parent) =>
                      parent.documentId === document.id &&
                      parent.cycle === document.cycle &&
                      parent.version === version.version &&
                      parent.goalId === goal.id &&
                      (parent.itemKind || 'GOAL') === itemKind,
                  )
                : [];
            if (!canRead && !links.length) return [];
            return [
              {
                documentId: document.id,
                kind,
                cycle: document.cycle,
                scopeId: document.scopeId,
                departmentId: document.departmentId,
                version: version.version,
                effectiveDate: version.effectiveDate,
                ...(itemKind === 'OBJECTIVE' ? { itemKind } : {}),
                ...(!canRead
                  ? {
                      retainedFor: [
                        ...new Map(
                          links
                            .filter((parent) => parent.current)
                            .map(({ contribution }) => [
                              `${contribution.documentId}/${contribution.goalId}`,
                              contribution,
                            ]),
                        ).values(),
                      ],
                    }
                  : {}),
                goal: {
                  id: goal.id,
                  code: goal.code,
                  title: goal.title,
                  departmentIds: [...goal.departmentIds],
                  startDate: goal.startDate,
                  endDate: goal.endDate,
                },
              },
            ];
          },
        ),
      );
  });
}
export function cleanText(value: unknown, max = 4000): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException(
      `Text must contain at most ${max} characters.`,
    );
  return value.trim();
}
/** Canonical finding/objective selections. An explicitly empty list is a real edit;
 * only records/clients that omit the list can fall back to a legacy single tag. */
export function planningAlignmentValues(input: {
  alignments?: unknown;
  alignment?: unknown;
}): string[] {
  if (Object.prototype.hasOwnProperty.call(input, 'alignments'))
    return Array.isArray(input.alignments) ? input.alignments : [];
  return typeof input.alignment === 'string' &&
    ['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(input.alignment)
    ? [input.alignment]
    : [];
}
export const objectiveAlignmentValues = planningAlignmentValues;
export function cleanNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new BadRequestException(
      'Enter a finite number, or leave the value blank.',
    );
  return value;
}
export const validFindingWeightage = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 10;
export function cleanFindingWeightage(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (!validFindingWeightage(value))
    throw new BadRequestException(
      'Enter weightage as a whole number from 1 to 10, or leave it blank.',
    );
  return value;
}
export function findingPriority(value: unknown): Finding['priority'] {
  if (!validFindingWeightage(value)) return '';
  return value <= 3 ? 'LOW' : value <= 7 ? 'MEDIUM' : 'HIGH';
}
export function strings(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 600 ||
    value.some((v) => typeof v !== 'string' || v.length > 200)
  )
    throw new BadRequestException('Invalid selection list.');
  return [...new Set(value)];
}
export function sourceLinks(value: unknown): SourceLink[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new BadRequestException('Select at most 100 reviewed findings.');
  const output = value.map((v) => {
    if (
      !v ||
      typeof v !== 'object' ||
      typeof v.documentId !== 'string' ||
      typeof v.findingId !== 'string' ||
      !Number.isInteger(v.version) ||
      v.version < 1
    )
      throw new BadRequestException(
        'A SWOT reference needs its finding ID and reviewed version.',
      );
    return {
      documentId: v.documentId,
      findingId: v.findingId,
      version: v.version,
    };
  });
  if (
    new Set(output.map((v) => `${v.documentId}/${v.findingId}/${v.version}`))
      .size !== output.length
  )
    throw new BadRequestException(
      'The same SWOT source is selected more than once.',
    );
  return output;
}
export function sourceFinding(state: PlanningState, source: SourceLink) {
  const document = state.documents.find(
    (d) => d.kind === 'SWOT' && d.id === source.documentId,
  );
  return (
    document?.findingReviews?.find(
      (review) =>
        review.version === source.version &&
        review.finding.id === source.findingId,
    )?.finding ||
    document?.versions
      .find((v) => v.version === source.version)
      ?.data.findings.find((f) => f.id === source.findingId)
  );
}
export function eligibleSources(state: PlanningState) {
  return state.documents
    .filter((d) => d.kind === 'SWOT')
    .flatMap((d) => [
      ...(d.findingReviews || [])
        .filter(
          (review) =>
            review.finding.reviewStatus === 'REVIEWED' &&
            review.finding.basis !== 'NEEDS_CHECKING',
        )
        .map((review) => ({
          documentId: d.id,
          findingId: review.finding.id,
          version: review.version,
          finding: review.finding,
        })),
      ...d.versions.flatMap((v) =>
        v.data.findings
          .filter(
            (f) =>
              f.basis !== 'NEEDS_CHECKING' &&
              (!f.reviewStatus || f.reviewStatus === 'REVIEWED'),
          )
          .map((f) => ({
            documentId: d.id,
            findingId: f.id,
            version: v.version,
            finding: f,
          })),
      ),
    ]);
}
export const itemList = (kind: ItemKind) =>
  (
    ({
      finding: 'findings',
      objective: 'objectives',
      goal: 'goals',
      assignment: 'assignments',
      action: 'actions',
    }) as const
  )[kind];
export function itemDefaults(kind: ItemKind): Record<string, unknown> {
  if (kind === 'finding')
    return {
      pillar: '',
      category: 'W',
      title: '',
      relatedPillars: [],
      alignment: '',
      alignments: [],
      otherBusinessFocus: '',
      explanation: '',
      impact: '',
      evidence: '',
      sourceUrl: '',
      basis: 'MANAGEMENT',
      weightage: null,
      priority: '',
      response: '',
      decisionNote: '',
      followupOwnerId: '',
      reviewDate: '',
    };
  if (kind === 'objective')
    return {
      title: '',
      result: '',
      alignment: '',
      otherBusinessFocus: '',
      direction: '',
      baselinePeriod: '',
      definition: '',
      dataSource: '',
      reviewFrequency: '',
      guardrails: '',
      meaning: '',
      pillar: '',
      alignments: [],
      alignmentReason: '',
      ownerId: '',
      startDate: '',
      endDate: '',
      sources: [],
      sourceRationale: '',
      priority: null,
      weightage: null,
      measure: '',
      baseline: null,
      baselineReason: '',
      target: null,
      unit: '',
      departmentIds: [],
      approach: '',
      selectionReason: '',
    };
  if (kind === 'goal')
    return {
      title: '',
      objectiveId: '',
      goalNo: null,
      departmentCode: '',
      definition: '',
      direction: '',
      baselinePeriod: '',
      source: '',
      frequency: '',
      parent: null,
      ongoingReason: '',
      measure: '',
      definitionId: '',
      baseline: null,
      baselineReason: '',
      target: null,
      unit: '',
      ownerId: '',
      startDate: '',
      endDate: '',
      approach: '',
      departmentIds: [],
      noActionReason: '',
    };
  if (kind === 'assignment')
    return {
      goalId: '',
      ownerId: '',
      definitionId: '',
      baseline: null,
      baselineReason: '',
      startDate: '',
      endDate: '',
      providerId: '',
      verifierId: '',
      source: '',
      updateFrequency: 'MONTHLY',
      reviewFrequency: 'MONTHLY',
      targetMode: 'SAME',
      target: null,
      upper: null,
      targets: [],
    };
  return {
    title: '',
    goalId: '',
    parentActionId: '',
    parent: null,
    ownerId: '',
    dueDate: '',
    expectedResult: '',
    completionEvidence: '',
    support: '',
    sources: [],
  };
}
export function cleanItem(
  kind: ItemKind,
  input: Record<string, unknown>,
  refs: PlanningReferences,
): Record<string, unknown> {
  const defaults = itemDefaults(kind),
    data: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    // Priority is a server-derived result; client values are never authoritative.
    if (kind === 'finding' && key === 'priority') continue;
    const value = input[key] ?? fallback;
    if (key === 'weightage')
      data[key] =
        kind === 'finding' ? cleanFindingWeightage(value) : cleanNumber(value);
    else if (kind === 'objective' && key === 'priority')
      data[key] = cleanNumber(value);
    else if (['baseline', 'target', 'upper', 'goalNo'].includes(key))
      data[key] = cleanNumber(value);
    else if (key === 'sources') data[key] = sourceLinks(value);
    else if (key === 'parent') {
      if (value === null) data.parent = null;
      else {
        const parent = value as Record<string, unknown>;
        if (
          typeof parent !== 'object' ||
          !Number.isInteger(parent.version) ||
          Number(parent.version) < 1
        )
          throw new BadRequestException('Select an approved parent goal.');
        data.parent = {
          documentId: cleanText(parent.documentId, 100),
          goalId: cleanText(parent.goalId, 100),
          version: parent.version,
          ...(parent.itemKind !== undefined
            ? { itemKind: parent.itemKind }
            : {}),
        };
        if (
          parent.itemKind !== undefined &&
          !['OBJECTIVE', 'GOAL'].includes(String(parent.itemKind))
        )
          throw new BadRequestException(
            'Select a valid approved objective or goal reference.',
          );
      }
    } else if (key === 'targets') {
      if (!Array.isArray(value) || value.length > MAX_TARGET_PERIODS)
        throw new BadRequestException('Invalid target periods.');
      data.targets = value.map((v) => {
        if (!v || typeof v !== 'object' || Array.isArray(v))
          throw new BadRequestException(
            'Each period target must be a valid target row.',
          );
        return {
          id: cleanText(v.id, 50),
          target: cleanNumber(v.target),
          upper: cleanNumber(v.upper),
        };
      });
    } else if (Array.isArray(fallback)) data[key] = strings(value);
    else data[key] = cleanText(value, key === 'title' ? 350 : 4000);
  }
  for (const key of ['ownerId', 'providerId', 'verifierId', 'followupOwnerId'])
    if (data[key] && !refs.people.some((p) => p.id === data[key]))
      throw new BadRequestException('Select a person from this organisation.');
  for (const key of ['startDate', 'endDate', 'dueDate', 'reviewDate'])
    if (data[key] && !validDate(String(data[key])))
      throw new BadRequestException('Enter a valid calendar date.');
  if (data.startDate && data.endDate && data.startDate > data.endDate)
    throw new BadRequestException(
      'The end date must be on or after the start date.',
    );
  if (data.pillar && !PILLAR_CODES.includes(data.pillar as never))
    throw new BadRequestException('Select one of the six fixed pillars.');
  if (kind === 'finding') {
    data.priority = findingPriority(data.weightage);
    if (
      !['', 'Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(
        String(data.alignment),
      )
    )
      throw new BadRequestException(
        'Select valid QCDSMT alignments or Business focus.',
      );
    if (
      !data.title ||
      !data.pillar ||
      !['S', 'W', 'O', 'T'].includes(String(data.category))
    )
      throw new BadRequestException(
        'Select a pillar and category, and write a short finding.',
      );
    if (
      (data.relatedPillars as string[]).some(
        (p) => !PILLAR_CODES.includes(p as never),
      )
    )
      throw new BadRequestException('Invalid related pillar.');
    data.relatedPillars = (data.relatedPillars as string[]).filter(
      (p) => p !== data.pillar,
    );
    if (
      !['MANAGEMENT', 'EVIDENCED', 'NEEDS_CHECKING'].includes(
        String(data.basis),
      ) ||
      ![
        '',
        'OBJECTIVE',
        'ACTION',
        'MONITOR',
        'NONE',
        'MAINTAIN',
        'USE',
        'DEFER',
        'VERIFY',
      ].includes(String(data.response))
    )
      throw new BadRequestException('Invalid SWOT decision.');
    if (data.sourceUrl) {
      let url: URL;
      try {
        url = new URL(String(data.sourceUrl));
      } catch {
        throw new BadRequestException(
          'Enter an http or https supporting link.',
        );
      }
      if (!['http:', 'https:'].includes(url.protocol))
        throw new BadRequestException(
          'Enter an http or https supporting link.',
        );
    }
  }
  if (
    ['objective', 'finding'].includes(kind) &&
    !Object.prototype.hasOwnProperty.call(input, 'alignments')
  )
    data.alignments = objectiveAlignmentValues(input);
  if (
    ['objective', 'finding'].includes(kind) &&
    (data.alignments as string[]).some(
      (v) => !['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(v),
    )
  )
    throw new BadRequestException(
      'Select valid QCDSMT alignments or Business focus.',
    );
  if (kind === 'objective') {
    if (data.priority != null && !validObjectivePriority(data.priority))
      throw new BadRequestException(
        'Objective priority must be a whole number from 1 to 10.',
      );
    if (
      data.weightage != null &&
      !validObjectiveWeightage(data.weightage, String(data.pillar))
    )
      throw new BadRequestException(
        `Objective weightage must be from 1 to ${OBJECTIVE_PILLAR_BUDGETS[String(data.pillar) as keyof typeof OBJECTIVE_PILLAR_BUDGETS] || 'the selected pillar limit'}%, with up to two decimal places. Select its pillar first.`,
      );
  }
  if (
    ['goal', 'objective'].includes(kind) &&
    (data.departmentIds as string[]).some(
      (id) => !refs.departments.some((d) => d.id === id),
    )
  )
    throw new BadRequestException('Select departments from this organisation.');
  if (['objective', 'goal'].includes(kind)) {
    if (
      data.direction &&
      !['HIGHER', 'LOWER', 'MAINTAIN_MIN', 'MAINTAIN_MAX'].includes(
        String(data.direction),
      )
    )
      throw new BadRequestException('Choose a valid measurement direction.');
    if (
      data.alignment &&
      !['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(String(data.alignment))
    )
      throw new BadRequestException('Choose one main business alignment.');
    for (const key of ['frequency'])
      if (data[key] && !FREQUENCIES.includes(data[key] as Frequency))
        throw new BadRequestException('Choose a valid review frequency.');
    if (
      data.goalNo != null &&
      (!Number.isSafeInteger(data.goalNo) || Number(data.goalNo) < 1)
    )
      throw new BadRequestException(
        'Goal number must be a positive safe integer.',
      );
  }
  if (kind === 'assignment') {
    if (
      !FREQUENCIES.includes(data.updateFrequency as Frequency) ||
      !FREQUENCIES.includes(data.reviewFrequency as Frequency) ||
      !['SAME', 'VARIED'].includes(String(data.targetMode))
    )
      throw new BadRequestException(
        'Select valid frequencies and a target method.',
      );
    const targetRows = data.targets as TargetPeriod[];
    if (new Set(targetRows.map((p) => p.id)).size !== targetRows.length)
      throw new BadRequestException(
        'Each reporting period may have only one target.',
      );
    const chosen = new Map(
      (data.targets as TargetPeriod[]).map((p) => [p.id, p]),
    );
    const calendar = resolveAssignmentCalendar(refs.calendar, input.calendar);
    if (calendar) data.calendar = calendar;
    data.targets = calendarPeriods(
      String(data.startDate),
      String(data.endDate),
      data.updateFrequency as Frequency,
      calendar,
    ).map((p) => ({
      ...p,
      target:
        p.scheduled === false
          ? null
          : data.targetMode === 'SAME'
            ? data.target
            : (chosen.get(p.id)?.target ?? null),
      upper:
        p.scheduled === false
          ? null
          : data.targetMode === 'SAME'
            ? data.upper
            : (chosen.get(p.id)?.upper ?? null),
    }));
  }
  return data;
}
export function sourceIssues(
  objective: Objective,
  state: PlanningState,
): string[] {
  const issues: string[] = [];
  if (!objective.sources.length)
    return ['Link at least one reviewed SWOT finding.'];
  let matching = false;
  for (const ref of objective.sources) {
    const finding = sourceFinding(state, ref);
    if (!finding)
      issues.push('The selected reviewed SWOT version does not exist.');
    else if (
      finding.basis === 'NEEDS_CHECKING' ||
      (finding.reviewStatus && finding.reviewStatus !== 'REVIEWED')
    )
      issues.push('A finding marked Needs checking cannot justify approval.');
    else if (
      finding.pillar === objective.pillar ||
      finding.relatedPillars.includes(objective.pillar as never)
    )
      matching = true;
  }
  if (!matching && !objective.sourceRationale)
    issues.push(
      'Explain why findings from other pillars support this objective.',
    );
  return issues;
}
/** Validate a reference, not a copied action. Source approval stays pinned. */
export function actionLinkIssues(
  document: PlanningDocument,
  link: ActionLink,
  state: PlanningState,
  today: string,
): string[] {
  const errors: string[] = [];
  const goal = document.data.goals.find((g) => g.id === link.goalId);
  const source = state.documents.find((d) => d.id === link.documentId);
  const version = source?.versions.find(
    (v) => v.version === link.version && v.effectiveDate <= today,
  );
  const action = version?.data.actions.find((a) => a.id === link.actionId);
  if (
    !['TEAM', 'POSITION', 'INDIVIDUAL'].includes(document.kind) ||
    !goal ||
    source?.kind !== 'DEPARTMENT' ||
    (document.kind !== 'INDIVIDUAL' &&
      source.departmentId !== document.departmentId) ||
    source.cycle !== document.cycle ||
    !action ||
    !goal.parent ||
    goal.parent.documentId !== source.id ||
    goal.parent.version !== link.version ||
    goal.parent.goalId !== action.goalId ||
    !version?.data.goals.some((parent) => parent.id === goal.parent!.goalId)
  ) {
    return [
      "Select an approved action belonging to this contribution's linked department goal and version.",
    ];
  }
  if (
    validDate(goal.startDate) &&
    validDate(goal.endDate) &&
    (action.dueDate < goal.startDate || action.dueDate > goal.endDate)
  )
    errors.push(
      `${action.code}: the shared action due date must fit the contribution period.`,
    );
  if (document.kind === 'INDIVIDUAL' && action.ownerId !== document.scopeId)
    errors.push(
      `${action.code}: select an action assigned to this employee; reassign the department action through its approved revision if needed.`,
    );
  if (
    ['TEAM', 'POSITION'].includes(document.kind) &&
    !document.data.contributorIds.includes(action.ownerId)
  )
    errors.push(
      `${action.code}: select an action assigned to a member of this team or position.`,
    );
  return errors;
}
export function planSetupIssues(
  document: PlanningDocument,
  state: PlanningState,
  refs: PlanningReferences,
): string[] {
  const data = document.data,
    errors: string[] = [];
  const person = (id: string) => refs.people.find((p) => p.id === id);
  const need = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  need(data.title, 'Give the plan a name.');
  need(person(data.ownerId), 'Select the plan owner from EMS.');
  need(
    validDate(data.startDate) &&
      validDate(data.endDate) &&
      data.startDate <= data.endDate,
    'Set a valid planning period.',
  );
  if (validDate(data.startDate) && validDate(data.endDate))
    need(
      data.startDate >= '2000-01-01' && data.endDate <= '2200-12-31',
      'Planning dates must be between 2000 and 2200.',
    );
  if (document.cycle.includes('..')) {
    try {
      const period = resolvePlanningPeriod({ cycle: document.cycle });
      need(
        data.startDate >= period.startDate && data.endDate <= period.endDate,
        'Plan dates must stay within the selected planning period.',
      );
    } catch {
      need(false, 'Select a valid planning period.');
    }
  }
  const approver = person(data.approverId);
  if (['TEAM', 'POSITION', 'INDIVIDUAL'].includes(document.kind)) {
    const department = refs.departments.find(
      (item) => item.id === document.departmentId,
    );
    need(department, "Confirm the plan's department assignment in EMS.");
    if (document.kind !== 'INDIVIDUAL')
      need(
        state.documents.some(
          (item) =>
            item.kind === 'DEPARTMENT' &&
            item.scopeId === document.departmentId &&
            item.cycle === document.cycle,
        ),
        `Create the ${department?.name || 'related department'} plan for ${document.cycle} before submitting. Your draft can be saved now.`,
      );
  }
  if (document.kind === 'POSITION') {
    need(
      refs.positions?.some(
        (p) =>
          p.id === document.scopeId && p.departmentId === document.departmentId,
      ),
      'Select an existing position from the shared EMS position register.',
    );
    const position = refs.positions?.find((p) => p.id === document.scopeId);
    if (position)
      need(
        position.holderIds.length === data.contributorIds.length &&
          position.holderIds.every((id) => data.contributorIds.includes(id)),
        'The position holders changed in EMS. Confirm the current holders in plan settings before approving this revision.',
      );
  }
  need(
    approver &&
      (['SWOT', 'COMPANY'].includes(document.kind)
        ? MANAGEMENT.includes(approver.role)
        : MANAGEMENT.includes(approver.role) ||
          (approver.role === 'HOD' &&
            approver.departmentId === document.departmentId)),
    'Select one authorised approver for this plan.',
  );
  return errors;
}

export function assignmentReadinessIssues(
  document: PlanningDocument,
  state: PlanningState,
  refs: PlanningReferences,
  goalId?: string,
): string[] {
  const data = document.data,
    errors: string[] = [];
  const person = (id: string) => refs.people.find((p) => p.id === id);
  const need = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  const dates = (start: string, end: string, label: string) => {
    need(
      validDate(start) && validDate(end) && start <= end,
      `${label}: enter valid start and end dates.`,
    );
    if (validDate(start) && validDate(end))
      need(
        start >= data.startDate && end <= data.endDate,
        `${label}: dates must stay within the plan period.`,
      );
  };
  for (const assignment of data.assignments) {
    if (goalId && assignment.goalId !== goalId) continue;
    const contribution = data.goals.find((g) => g.id === assignment.goalId);
    const definition = state.definitions.find(
      (k) => k.id === assignment.definitionId,
    );
    need(definition, `${assignment.code}: choose a KPI definition.`);
    need(contribution, `${assignment.code}: choose a goal in this plan.`);
    need(
      person(assignment.ownerId || ''),
      `${assignment.code}: select the accountable assignment owner.`,
    );
    need(
      person(assignment.providerId) && person(assignment.verifierId),
      `${assignment.code}: select a data provider and verifier.`,
    );
    need(
      assignment.providerId !== assignment.verifierId,
      `${assignment.code}: provider and verifier must be different people.`,
    );
    need(assignment.source, `${assignment.code}: identify the data source.`);
    need(
      (typeof assignment.baseline === 'number' &&
        Number.isFinite(assignment.baseline)) ||
        assignment.baselineReason,
      `${assignment.code}: enter a baseline or its unavailable reason.`,
    );
    dates(assignment.startDate, assignment.endDate, assignment.code);
    if (
      contribution &&
      validDate(contribution.startDate) &&
      validDate(contribution.endDate) &&
      validDate(assignment.startDate) &&
      validDate(assignment.endDate)
    )
      need(
        assignment.startDate >= contribution.startDate &&
          assignment.endDate <= contribution.endDate,
        `${assignment.code}: dates must stay within the contribution goal period.`,
      );
    need(
      FREQUENCIES.includes(assignment.updateFrequency) &&
        FREQUENCIES.includes(assignment.reviewFrequency),
      `${assignment.code}: select valid update and review frequencies.`,
    );
    need(
      ['SAME', 'VARIED'].includes(assignment.targetMode),
      `${assignment.code}: select a target method.`,
    );
    const expected = calendarPeriods(
      assignment.startDate,
      assignment.endDate,
      assignment.updateFrequency,
      assignment.calendar,
    );
    need(
      expected.length &&
        assignment.targets.length === expected.length &&
        new Set(assignment.targets.map((t) => t.id)).size ===
          assignment.targets.length,
      `${assignment.code}: generate all reporting periods.`,
    );
    for (const period of expected) {
      const target = assignment.targets.find((t) => t.id === period.id);
      if (period.scheduled === false) {
        need(
          target && target.target === null && target.upper === null,
          `${assignment.code}: ${period.label} is Not scheduled; leave its target empty.`,
        );
        continue;
      }
      need(
        target &&
          typeof target.target === 'number' &&
          Number.isFinite(target.target),
        `${assignment.code}: set the target for ${period.label}.`,
      );
      if (definition?.direction === 'RANGE')
        need(
          target &&
            target.target !== null &&
            target.upper !== null &&
            target.upper >= target.target,
          `${assignment.code}: provide lower and upper limits for ${period.label}.`,
        );
      if (definition?.direction === 'ZERO')
        need(
          target?.target === 0,
          `${assignment.code}: the planned target must be zero.`,
        );
    }
  }
  for (let i = 0; i < data.assignments.length; i++) {
    const left = data.assignments[i];
    for (const right of data.assignments.slice(i + 1)) {
      if (goalId && left.goalId !== goalId && right.goalId !== goalId) continue;
      if (
        left.definitionId &&
        left.definitionId === right.definitionId &&
        (left.goalId === right.goalId ||
          (!!left.ownerId && left.ownerId === right.ownerId)) &&
        validDate(left.startDate) &&
        validDate(left.endDate) &&
        validDate(right.startDate) &&
        validDate(right.endDate) &&
        left.startDate <= right.endDate &&
        right.startDate <= left.endDate
      )
        errors.push(
          `${left.code} and ${right.code}: overlapping assignments for the same KPI and goal or owner. Reuse one assignment or give them distinct active periods.`,
        );
    }
  }
  return [...new Set(errors)];
}

export function validatePlan(
  document: PlanningDocument,
  state: PlanningState,
  refs: PlanningReferences,
  today: string,
): string[] {
  const data = document.data,
    errors: string[] = [];
  const person = (id: string) => refs.people.find((p) => p.id === id);
  const need = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  const dates = (start: string, end: string, label: string) => {
    need(
      validDate(start) && validDate(end) && start <= end,
      `${label}: enter valid start and end dates.`,
    );
    if (validDate(start) && validDate(end))
      need(
        start >= data.startDate && end <= data.endDate,
        `${label}: dates must stay within the plan period.`,
      );
  };
  errors.push(...planSetupIssues(document, state, refs));
  if (document.kind === 'SWOT') {
    for (const pillar of PILLAR_CODES)
      need(
        data.consideredPillars.includes(pillar),
        `Consider ${pillar}, even when there are no findings.`,
      );
    for (const finding of data.findings) {
      errors.push(
        ...findingAlignmentIssues(finding).map(
          (issue) => `${finding.code}: ${issue}`,
        ),
      );
      need(
        finding.title && finding.title.length <= 350,
        `${finding.code}: enter a short finding.`,
      );
      need(
        validFindingWeightage(finding.weightage),
        `${finding.code}: enter weightage as a whole number from 1 to 10.`,
      );
      if (validFindingWeightage(finding.weightage))
        need(
          finding.priority === findingPriority(finding.weightage),
          `${finding.code}: save the finding to recalculate its priority from weightage.`,
        );
      need(finding.response, `${finding.code}: choose a management response.`);
      if (finding.response === 'MONITOR') {
        need(
          person(finding.followupOwnerId),
          `${finding.code}: choose a follow-up owner.`,
        );
        need(
          validDate(finding.reviewDate),
          `${finding.code}: choose a review date.`,
        );
      }
    }
    return errors;
  }
  if (document.kind === 'COMPANY') {
    need(data.objectives.length, 'Create at least one objective.');
    for (const allocation of objectiveAllocations(data.objectives)) {
      if (!allocation.count) continue;
      need(
        allocation.balanced,
        `${allocation.pillar}: objective weightages must total exactly ${allocation.target}%. Currently ${allocation.total}%.${allocation.missing ? ` ${allocation.missing} objective weightage(s) are missing.` : ''}${allocation.invalid ? ' Correct the invalid weightages.' : ''}`,
      );
    }
    for (const objective of data.objectives) {
      need(
        validObjectivePriority(objective.priority),
        `${objective.code}: enter objective priority as a whole number from 1 to 10.`,
      );
      need(
        validObjectiveWeightage(objective.weightage, objective.pillar),
        `${objective.code}: enter objective weightage from 1 to ${OBJECTIVE_PILLAR_BUDGETS[objective.pillar as keyof typeof OBJECTIVE_PILLAR_BUDGETS] || 'the pillar limit'}%, with up to two decimals.`,
      );
      need(
        objective.title && objective.meaning,
        `${objective.code}: explain the objective's direction and meaning.`,
      );
      need(
        PILLAR_CODES.includes(objective.pillar as never),
        `${objective.code}: select the primary pillar.`,
      );
      need(
        objectiveAlignmentValues(objective).length > 0 &&
          objectiveAlignmentValues(objective).every((value) =>
            ['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(value),
          ),
        `${objective.code}: select one or more QCDSMT alignments or Business focus.`,
      );
      if (objectiveAlignmentValues(objective).includes('OTHER'))
        need(
          objective.otherBusinessFocus?.trim(),
          `${objective.code}: describe the Business focus.`,
        );
      need(person(objective.ownerId), `${objective.code}: select an owner.`);
      dates(objective.startDate, objective.endDate, objective.code);
      need(
        objective.measure?.trim() && objective.unit?.trim(),
        `${objective.code}: enter the objective's measure and unit.`,
      );
      need(
        typeof objective.target === 'number' &&
          Number.isFinite(objective.target),
        `${objective.code}: enter the objective's target (zero is valid).`,
      );
      need(
        (typeof objective.baseline === 'number' &&
          Number.isFinite(objective.baseline)) ||
          objective.baselineReason?.trim(),
        `${objective.code}: enter a baseline or explain why it is unavailable.`,
      );
      need(
        objective.approach?.trim(),
        `${objective.code}: explain how the objective can be achieved.`,
      );
      need(
        objective.selectionReason?.trim(),
        `${objective.code}: explain why this objective was selected.`,
      );
      need(
        objective.departmentIds?.length &&
          objective.departmentIds.every((id) =>
            refs.departments.some((d) => d.id === id),
          ),
        `${objective.code}: choose contributing departments from EMS.`,
      );
      errors.push(
        ...sourceIssues(objective, state).map(
          (issue) => `${objective.code}: ${issue}`,
        ),
      );
    }
    // Company commitments now live on the objective itself. Older linked goals
    // stay in existing history; they are not required or republished as new goals.
    return errors;
  }
  need(data.goals.length, 'Add at least one goal or role contribution.');
  for (const goal of data.goals) {
    need(goal.title, `${goal.code}: describe the result.`);
    need(person(goal.ownerId), `${goal.code}: select the responsible person.`);
    dates(goal.startDate, goal.endDate, goal.code);
    if (['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind)) {
      need(
        goal.measure && goal.unit,
        `${goal.code}: enter the measure and unit.`,
      );
      need(
        typeof goal.target === 'number' && Number.isFinite(goal.target),
        `${goal.code}: enter a target (zero is valid).`,
      );
      if (document.kind !== 'INDIVIDUAL')
        need(
          (typeof goal.baseline === 'number' &&
            Number.isFinite(goal.baseline)) ||
            goal.baselineReason,
          `${goal.code}: enter a baseline or explain why it is unavailable.`,
        );
    }
    if (document.kind === 'DEPARTMENT') {
      const owner = person(goal.ownerId);
      need(
        owner &&
          (MANAGEMENT.includes(owner.role) ||
            (owner.role === 'HOD' &&
              owner.departmentId === document.departmentId)),
        `${goal.code}: choose the accountable HOD or an authorised management owner.`,
      );
    }
    {
      const resolved = goal.parent && resolveApprovedParent(state, goal.parent);
      const parent = resolved?.document;
      const linked = resolved?.goal;
      if (goal.parent)
        errors.push(
          ...parentReferenceIssues(document, goal.parent, state).map(
            (issue) => `${goal.code}: ${issue}`,
          ),
        );
      if (document.kind === 'DEPARTMENT') {
        if (goal.parent || !goal.ongoingReason)
          need(
            parent?.kind === 'COMPANY' &&
              parent.cycle === document.cycle &&
              linked,
            `${goal.code}: select an approved company goal, or explain the essential department responsibility.`,
          );
        if (linked && goal.parent?.itemKind !== 'OBJECTIVE')
          need(
            linked.departmentIds.includes(document.scopeId),
            `${goal.code}: this department must be identified as a contributor to the company goal.`,
          );
      } else if (goal.parent || !goal.ongoingReason)
        need(
          (parent?.kind === 'DEPARTMENT' ||
            (document.kind === 'INDIVIDUAL' && parent?.kind === 'COMPANY')) &&
            parent.cycle === document.cycle &&
            (document.kind === 'INDIVIDUAL' ||
              parent.scopeId === document.departmentId) &&
            linked,
          `${goal.code}: link an approved ${document.kind === 'INDIVIDUAL' ? 'company or department' : 'department'} goal, or identify an ongoing role responsibility.`,
        );
      if (
        linked &&
        validDate(linked.startDate) &&
        validDate(linked.endDate) &&
        validDate(goal.startDate) &&
        validDate(goal.endDate)
      )
        need(
          goal.startDate >= linked.startDate && goal.endDate <= linked.endDate,
          `${goal.code}: dates must stay within the approved parent goal period.`,
        );
      need(
        data.assignments.some((k) => k.goalId === goal.id),
        `${goal.code}: add a KPI assignment with planned targets.`,
      );
      need(
        data.actions.some((a) => a.goalId === goal.id) ||
          (data.actionLinks || []).some((a) => a.goalId === goal.id) ||
          goal.noActionReason?.trim(),
        `${goal.code}: add a delivery action, link an existing action, or explain why no separate action plan is needed.`,
      );
    }
  }
  errors.push(...assignmentReadinessIssues(document, state, refs));
  const seenLinks = new Set<string>();
  for (const link of data.actionLinks || []) {
    const key = `${link.documentId}/${link.actionId}`;
    need(
      !seenLinks.has(key),
      'The same department action is linked more than once in this plan.',
    );
    seenLinks.add(key);
    errors.push(...actionLinkIssues(document, link, state, today));
  }
  for (const action of data.actions) {
    const contribution = data.goals.find((g) => g.id === action.goalId);
    need(
      action.title && contribution,
      `${action.code}: name the action and link its goal.`,
    );
    need(
      person(action.ownerId),
      `${action.code}: choose a responsible person.`,
    );
    need(
      validDate(action.dueDate) &&
        action.dueDate >= data.startDate &&
        action.dueDate <= data.endDate,
      `${action.code}: set a due date within the plan period.`,
    );
    if (
      contribution &&
      validDate(action.dueDate) &&
      validDate(contribution.startDate) &&
      validDate(contribution.endDate)
    )
      need(
        action.dueDate >= contribution.startDate &&
          action.dueDate <= contribution.endDate,
        `${action.code}: the due date must stay within the contribution goal period.`,
      );
    need(
      action.expectedResult && action.completionEvidence,
      `${action.code}: state the expected result and required completion evidence.`,
    );
  }
  return [...new Set(errors)];
}
export function sanitizeForReader(
  document: PlanningDocument,
  actor: PlanningActor,
  today: string,
): PlanningDocument | null {
  const access = permissions(document, actor);
  if (!access.canRead) return null;
  const copy = structuredClone(document);
  const canDraft =
    isCoordinator(actor) ||
    access.canApprove ||
    document.data.coordinatorIds.includes(actor.employeeId) ||
    document.kind === 'SWOT' ||
    access.canEdit ||
    (document.kind === 'INDIVIDUAL' && document.scopeId === actor.employeeId);
  if (!canDraft) {
    const scopeManager =
      actor.role === 'HOD' &&
      !!actor.departmentId &&
      document.departmentId === actor.departmentId;
    if (['TEAM', 'POSITION'].includes(document.kind) && !scopeManager) {
      // Membership is a commitment of the approved version. A transfer must
      // neither reveal the replacement holder's plan nor erase the former
      // holder's own history; draft membership is not a read grant.
      copy.versions = copy.versions.filter((v) =>
        v.data.contributorIds.includes(actor.employeeId),
      );
    }
    const version = published(copy, today);
    if (!version) return null;
    copy.data = structuredClone(version.data);
    copy.status = 'APPROVED';
    copy.versions = copy.versions.filter((v) => v.effectiveDate <= today);
    for (const approved of copy.versions) {
      delete approved.legacyCompanyGoals;
      // An unrelated cumulative snapshot may contain a future revision. Readers
      // receive only the row whose approval this version actually represents.
      if (approved.approvedItem) {
        const { kind, itemId } = approved.approvedItem;
        approved.data.objectives = approved.data.objectives.filter(
          (item) => kind === 'objective' && item.id === itemId,
        );
        approved.data.goals = approved.data.goals.filter(
          (item) => kind === 'goal' && item.id === itemId,
        );
      }
    }
    copy.history = [];
    copy.revisionReason = '';
    copy.effectiveDate = version.effectiveDate;
  }
  // The service redacts each source against its actual SWOT assessment ACL.
  return copy;
}
export function validateDefinition(definition: KpiDefinition) {
  if (
    !definition.name ||
    !definition.meaning ||
    !definition.unit ||
    !definition.inputA ||
    (definition.formula !== 'DIRECT' && !definition.inputB)
  )
    throw new BadRequestException(
      'Complete the KPI name, meaning, unit and formula inputs.',
    );
  if (
    !['DIRECT', 'RATIO', 'PERCENT'].includes(definition.formula) ||
    !['HIGHER', 'LOWER', 'RANGE', 'ZERO', 'MILESTONE'].includes(
      definition.direction,
    ) ||
    !['SUM', 'RATIO', 'CLOSING', 'MILESTONE'].includes(definition.aggregation)
  )
    throw new BadRequestException('Invalid KPI calculation settings.');
  if (definition.formula === 'DIRECT' && definition.aggregation === 'RATIO')
    throw new BadRequestException(
      'A direct reading cannot use ratio aggregation.',
    );
  if (definition.formula !== 'DIRECT' && definition.aggregation !== 'RATIO')
    throw new BadRequestException(
      'Ratio and percentage results must aggregate their inputs.',
    );
}
