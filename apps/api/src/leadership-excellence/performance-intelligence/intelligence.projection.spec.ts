import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  emptyExecutionState,
  projectExecution,
  type ExecutionSource,
} from '../execution/execution.projection';
import type {
  ExecutionResult,
  ExecutionState,
} from '../execution/execution.types';
import { blankData } from '../performance-planning/planning.rules';
import type {
  ApprovedVersion,
  Assignment,
  Goal,
  KpiDefinition,
  Objective,
  PlanningDocument,
  PlanningView,
  ProgrammeResult,
} from '../performance-planning/planning.types';
import { IntelligenceQueryDto } from './dto/intelligence-query.dto';
import {
  comparePerformance,
  projectIntelligence,
} from './intelligence.projection';
import { csvCell, intelligenceCsv } from './intelligence.csv';

const stamp = (id: string) => ({
  id,
  code: id.toUpperCase(),
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
});
const definition: KpiDefinition = {
  id: 'rate',
  code: 'RATE',
  kraId: 'cost',
  name: 'Cost per accepted unit',
  meaning: 'Total cost divided by accepted units',
  unit: 'KES/unit',
  direction: 'LOWER',
  formula: 'RATIO',
  inputA: 'Cost',
  inputB: 'Units',
  aggregation: 'RATIO',
  source: 'CUSTOM',
};
const goal: Goal = {
  ...stamp('goal'),
  title: 'Reduce waste',
  objectiveId: '',
  parent: null,
  ongoingReason: '',
  measure: 'Waste cost',
  definitionId: 'rate',
  baseline: 60,
  baselineReason: '',
  target: 40,
  unit: 'KES/unit',
  ownerId: 'hod',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  approach: '',
  departmentIds: ['production'],
};
const assignment: Assignment = {
  ...stamp('assignment'),
  goalId: 'goal',
  definitionId: 'rate',
  ownerId: 'owner',
  providerId: 'provider',
  verifierId: 'verifier',
  baseline: 60,
  baselineReason: '',
  startDate: '2026-01-01',
  endDate: '2026-01-03',
  source: 'Daily production ledger',
  updateFrequency: 'DAILY',
  reviewFrequency: 'MONTHLY',
  targetMode: 'SAME',
  target: 40,
  upper: null,
  targets: [],
};
function version(v = 1, effectiveDate = '2026-01-01'): ApprovedVersion {
  return {
    version: v,
    effectiveDate,
    approvedAt: effectiveDate,
    approvedBy: 'approver',
    reason: '',
    definitions: [structuredClone(definition)],
    data: {
      ...blankData(),
      title: 'Production plan',
      ownerId: 'hod',
      approverId: 'approver',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      goals: [structuredClone(goal)],
      assignments: [structuredClone(assignment)],
    },
  };
}
function document(versions = [version()]): PlanningDocument {
  return {
    id: 'production-plan',
    code: 'PROD',
    kind: 'DEPARTMENT',
    scopeId: 'production',
    departmentId: 'production',
    cycle: '2026',
    status: 'APPROVED',
    data: structuredClone(versions.at(-1)!.data),
    versions,
    revisionReason: '',
    effectiveDate: '',
    history: [],
    acknowledgement: null,
  };
}
function source(
  documents = [document()],
  role = 'MANAGEMENT',
  employeeId = 'leader',
): ExecutionSource {
  return {
    revision: 4,
    actor: {
      userId: `user-${employeeId}`,
      employeeId,
      departmentId: 'production',
      name: employeeId,
      role,
    },
    state: { schema: 1, sequence: 1, documents, kras: [], definitions: [] },
    references: {
      departments: [
        { id: 'production', name: 'Production' },
        { id: 'finance', name: 'Finance' },
      ],
      people: ['leader', 'hod', 'owner', 'provider', 'verifier', 'other'].map(
        (id) => ({
          id,
          name: id,
          userId: `user-${id}`,
          departmentId: 'production',
          position: '',
          role: 'EMPLOYEE',
        }),
      ),
      teams: [],
      pillars: [{ code: 'LEX', name: 'Leadership' }],
      timeZone: 'UTC',
    },
  };
}
function planning(input: ExecutionSource): PlanningView {
  return {
    revision: input.revision,
    references: input.references,
    actor: input.actor,
    kras: [],
    definitions: [],
    sharedActions: [],
    programmeResults: input.state.programmeResults || [],
    documents: input.state.documents.map((d) => ({
      ...d,
      permissions: {
        canRead: true,
        canEdit: false,
        canApprove: false,
        canConfigure: false,
        canSeeSources: false,
      },
      issues: [],
    })),
  };
}
const result = (
  day: string,
  inputA: number,
  inputB: number,
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult => ({
  id: `result-${day}`,
  assignmentKey: 'production-plan/assignment/v1',
  periodId: `2026-01-${day}/2026-01-${day}`,
  periodStart: `2026-01-${day}`,
  periodEnd: `2026-01-${day}`,
  inputA,
  inputB,
  actual: inputA / inputB,
  note: 'Private result note',
  evidence: 'Private evidence',
  status: 'VERIFIED',
  updatedAt: `2026-02-${day}T00:00:00Z`,
  updatedBy: 'provider',
  submittedAt: '',
  verificationNote: 'Private verification note',
  official: {
    actual: inputA / inputB,
    inputA,
    inputB,
    verifiedAt: `2026-02-${day}T00:00:00Z`,
    verifiedBy: 'verifier',
  },
  history: [],
  ...overrides,
});
function report(
  input = source(),
  results = [result('02', 4500, 150), result('01', 6000, 100)],
  filters = {},
  today = '2026-02-01',
) {
  const stored = { ...emptyExecutionState(), results };
  return projectIntelligence(
    projectExecution(input, stored, 2, today),
    planning(input),
    filters,
    '2026-02-01T10:00:00Z',
  );
}

describe('Area 07 verified reporting projection', () => {
  test('rates aggregate numerators and denominators, retain chronology and never average unrelated scores', () => {
    const view = report();
    const kpi = view.kpis[0];
    expect(kpi.officialActual).toBe(42);
    expect(kpi.comparableTarget).toBe(40);
    expect(kpi.gap).toBe(2);
    expect(kpi.favourability).toBe('UNFAVOURABLE');
    expect(kpi.trend.map((p) => p.actual)).toEqual([60, 30]);
    expect(kpi.trend[0]).toMatchObject({
      start: '2026-01-01',
      verifiedAt: '2026-02-01T00:00:00Z',
      resultId: 'result-01',
    });
    expect(kpi.coverage).toMatchObject({
      scheduled: 3,
      verified: 2,
      missing: 1,
      partial: true,
    });
    expect(kpi.periods[2].officialActual).toBeNull();
    expect(view.summary.overallScore).toBeNull();
  });

  test.each([
    ['SUM', 90, 80],
    ['CLOSING', 30, 40],
    ['MILESTONE', 30, 40],
  ] as const)(
    '%s follows its approved aggregation',
    (aggregation, actual, target) => {
      const input = source();
      input.state.documents[0].versions[0].definitions[0] = {
        ...definition,
        aggregation,
        formula: 'DIRECT',
        unit: 'count',
      };
      const kpi = report(input).kpis[0];
      expect(kpi.officialActual).toBe(actual);
      expect(kpi.comparableTarget).toBe(target);
    },
  );

  test('unverified corrections keep the previous official value and identify provisional numbers', () => {
    const correction = result('01', 6000, 100, {
      actual: 99,
      inputA: 9900,
      status: 'SUBMITTED',
    });
    const kpi = report(source(), [correction]).kpis[0];
    expect(kpi.officialActual).toBe(60);
    expect(kpi.periods[0]).toMatchObject({
      status: 'SUBMITTED',
      officialActual: 60,
      provisionalActual: 99,
      correctionPending: true,
    });
    expect(kpi.coverage).toMatchObject({
      verified: 1,
      submitted: 1,
      correctionPending: 1,
    });
    expect(
      report(source(), [{ ...correction, official: null }]).kpis[0]
        .officialActual,
    ).toBeNull();
  });

  test('distinguishes missing, not due and not scheduled without treating blanks as zero', () => {
    const input = source();
    input.state.documents[0].versions[0].data.assignments[0].targets = [
      {
        id: '2026-01-02/2026-01-02',
        label: 'Holiday',
        start: '2026-01-02',
        end: '2026-01-02',
        scheduled: false,
        target: null,
        upper: null,
      },
    ];
    const kpi = report(input, [], {}, '2026-01-01').kpis[0];
    expect(kpi.periods.map((p) => p.status)).toEqual([
      'NOT_DUE',
      'NOT_SCHEDULED',
      'NOT_DUE',
    ]);
    expect(kpi.officialActual).toBeNull();
    expect(kpi.comparableTarget).toBeNull();
  });

  test('same-day deadlines respect the pinned submission time and timezone', () => {
    const input = source();
    const execution = projectExecution(
      input,
      emptyExecutionState(),
      0,
      '2026-02-01',
    );
    execution.assignments[0].periods.forEach((period) => {
      period.submissionDate = '2026-02-01';
      period.submissionTime = '17:00';
      period.submissionTimeZone = 'Asia/Kolkata';
    });
    const before = projectIntelligence(
      execution,
      planning(input),
      {},
      '2026-02-01T10:00:00Z',
    ).kpis[0];
    expect(before.coverage).toMatchObject({ due: 0, missing: 0, notDue: 3 });
    expect(before.periods[0]).toMatchObject({
      due: false,
      submissionTime: '17:00',
      submissionTimeZone: 'Asia/Kolkata',
    });
    const after = projectIntelligence(
      execution,
      planning(input),
      {},
      '2026-02-01T12:00:00Z',
    ).kpis[0];
    expect(after.coverage).toMatchObject({ due: 3, missing: 3, notDue: 0 });
    execution.assignments[0].periods.forEach((period) => {
      delete period.submissionTime;
    });
    expect(
      projectIntelligence(
        execution,
        planning(input),
        {},
        '2026-02-01T23:59:00Z',
      ).kpis[0].coverage,
    ).toMatchObject({ due: 0, missing: 0 });
  });

  test('filters dates before aggregation and only compares the selected complete periods', () => {
    expect(
      report(source(), undefined, {
        startDate: '2026-01-02',
        endDate: '2026-01-02',
      }).kpis[0],
    ).toMatchObject({ officialActual: 30, comparableTarget: 40 });
    expect(
      report(source(), undefined, { startDate: '2026-01-04' }).kpis,
    ).toEqual([]);
    expect(() => report(source(), [], { startDate: '2026-02-30' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      report(source(), [], { startDate: '2026-02-01', endDate: '2026-01-01' }),
    ).toThrow(BadRequestException);
  });

  test('varying rate thresholds remain period comparisons, never an invented weighted target', () => {
    const input = source();
    input.state.documents[0].versions[0].data.assignments[0].targets = [
      {
        id: '2026-01-02/2026-01-02',
        label: 'Day 2',
        start: '2026-01-02',
        end: '2026-01-02',
        target: 30,
        upper: null,
      },
    ];
    const kpi = report(input).kpis[0];
    expect(kpi.officialActual).toBe(42);
    expect(kpi.comparableTarget).toBeNull();
    expect(kpi.periods.map((p) => p.target)).toEqual([40, 30, 40]);
  });

  test('retains definition versions and historical observed dates without borrowing targets', () => {
    const first = version();
    const second = version(2, '2026-01-03');
    second.definitions[0] = {
      ...definition,
      unit: 'USD/unit',
      direction: 'HIGHER',
      name: 'New measure',
    };
    second.data.assignments[0].target = 20;
    const input = source([document([first, second])]);
    const results = [
      result('01', 6000, 100),
      result('03', 30, 1, { assignmentKey: 'production-plan/assignment/v2' }),
    ];
    const rows = report(input, results).kpis;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      version: 1,
      unit: 'KES/unit',
      officialActual: 60,
      comparableTarget: 40,
      current: false,
    });
    expect(rows[0].periods.map((p) => p.start)).toEqual([
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(rows[1]).toMatchObject({
      version: 2,
      unit: 'USD/unit',
      officialActual: 30,
      comparableTarget: 20,
      current: true,
    });
    const historical = report(source(), [
      result('01', 6000, 100, {
        periodStart: '2025-12-31',
        periodEnd: '2025-12-31',
      }),
    ]).kpis[0];
    expect(historical.periods[0]).toMatchObject({
      start: '2025-12-31',
      officialActual: 60,
      target: null,
    });
    expect(historical.comparableTarget).toBeNull();
    expect(new Set(historical.periods.map((p) => p.id)).size).toBe(
      historical.periods.length,
    );
  });

  test('a historical official observation survives a calendar period marked not scheduled', () => {
    const input = source();
    input.state.documents[0].versions[0].data.assignments[0].targets = [
      {
        id: '2026-01-01/2026-01-01',
        label: 'Holiday',
        start: '2026-01-01',
        end: '2026-01-01',
        scheduled: false,
        target: null,
        upper: null,
      },
    ];
    const kpi = report(input, [result('01', 6000, 100)]).kpis[0];
    expect(kpi.officialActual).toBe(60);
    expect(kpi.comparableTarget).toBeNull();
    expect(
      kpi.periods.find((p) => p.officialResultId === 'result-01'),
    ).toMatchObject({
      start: '2026-01-01',
      end: '2026-01-01',
      officialActual: 60,
      target: null,
      partial: true,
    });
    expect(kpi.coverage.notScheduled).toBe(1);
    expect(kpi.trend).toHaveLength(1);
    expect(new Set(kpi.periods.map((p) => p.id)).size).toBe(kpi.periods.length);
  });

  test('future approvals and unapproved sibling/draft edits do not enter the report', () => {
    const first = version();
    const future = version(2, '2026-12-01');
    future.definitions[0].name = 'Future secret';
    const doc = document([first, future]);
    doc.data.goals[0].title = 'Draft secret';
    doc.data.assignments[0].target = 9999;
    const view = report(source([doc]));
    expect(view.kpis).toHaveLength(1);
    expect(JSON.stringify(view)).not.toMatch(/Future secret|Draft secret|9999/);
    expect(view.kpis[0].definition?.name).toBe(definition.name);
  });

  test('employees see own performance; HOD scope and leadership filters cannot expand source ACL', () => {
    const doc = document();
    const extra = document();
    extra.id = 'other-plan';
    extra.departmentId = 'finance';
    extra.scopeId = 'finance';
    extra.versions[0].data.assignments[0].providerId = 'other';
    extra.versions[0].data.assignments[0].ownerId = 'other';
    extra.versions[0].data.goals[0].ownerId = 'other';
    expect(
      report(source([doc, extra], 'EMPLOYEE', 'provider')).kpis.map(
        (r) => r.documentId,
      ),
    ).toEqual(['production-plan']);
    expect(
      report(source([doc, extra], 'HOD', 'hod')).kpis.map((r) => r.documentId),
    ).toEqual(['production-plan']);
    expect(report(source([doc, extra])).kpis).toHaveLength(2);
    expect(() =>
      report(source([doc], 'EMPLOYEE', 'provider'), [], {
        scope: 'ORGANIZATION',
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      report(source([doc], 'EMPLOYEE', 'provider'), [], { personId: 'other' }),
    ).toThrow(ForbiddenException);
    expect(() =>
      report(source([doc], 'HOD', 'hod'), [], { departmentId: 'finance' }),
    ).toThrow(ForbiddenException);
    expect(report(source([doc], 'EMPLOYEE', 'verifier')).kpis).toHaveLength(0);
  });

  test('actions and support retain delivery/acknowledgement context separately from result numbers', () => {
    const input = source();
    input.state.documents[0].versions[0].data.actions = [
      {
        ...stamp('action'),
        title: 'Fix process',
        goalId: 'goal',
        parentActionId: '',
        ownerId: 'provider',
        dueDate: '2026-01-01',
        expectedResult: '',
        completionEvidence: '',
        support: '',
        sources: [],
      },
    ];
    const state: ExecutionState = {
      ...emptyExecutionState(),
      actionUpdates: [
        {
          actionKey: 'production-plan/action/action',
          status: 'IN_PROGRESS',
          progress: 80,
          note: 'Private action note',
          evidence: 'Private evidence',
          delayReason: '',
          updatedAt: '',
          updatedBy: '',
          history: [],
        },
      ],
      supportRequests: [
        {
          id: 'support',
          goalKey: 'production-plan/goal/v1',
          actionKey: null,
          title: 'Supply materials',
          request: 'Private request detail',
          requestorId: 'provider',
          assignedToId: 'user-owner',
          dueDate: '2026-01-01',
          status: 'IN_PROGRESS',
          response: 'Private response',
          createdAt: '2025-12-31',
          acknowledgement: { at: '2026-01-01', by: 'owner', name: 'Owner' },
          history: [],
        },
      ],
    };
    const view = projectIntelligence(
      projectExecution(input, state, 0, '2026-02-01'),
      planning(input),
    );
    expect(view.summary).toMatchObject({
      actions: 1,
      overdueActions: 1,
      openSupport: 1,
      unacknowledgedSupport: 0,
    });
    expect(view.actions[0]).toMatchObject({ progress: 80, overdue: true });
    expect(view.support[0]).toMatchObject({
      acknowledgedAt: '2026-01-01',
      assignedToName: 'owner',
    });
    expect(view.kpis[0].officialActual).toBeNull();
    expect(JSON.stringify(view)).not.toContain('Private');
  });

  test.each([
    [30, 40, null, 'LOWER', -10, 'FAVOURABLE'],
    [30, 40, null, 'HIGHER', -10, 'UNFAVOURABLE'],
    [45, 40, 50, 'RANGE', 5, 'ON_TARGET'],
    [55, 40, 50, 'RANGE', 15, 'UNFAVOURABLE'],
    [0, 0, null, 'ZERO', 0, 'ON_TARGET'],
    [null, 40, null, 'LOWER', null, 'UNKNOWN'],
  ] as const)(
    'signed gap respects direction',
    (actual, target, upper, direction, gap, favourability) => {
      expect(comparePerformance(actual, target, upper, direction)).toEqual({
        gap,
        favourability,
      });
    },
  );
});

describe('independent Area 03 measured company results', () => {
  const objective: Objective = {
    ...stamp('objective'),
    title: 'Company cost result',
    meaning: '',
    pillar: 'LEX',
    alignments: ['C'],
    alignmentReason: '',
    ownerId: 'leader',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    sources: [],
    sourceRationale: 'Private SWOT rationale',
    measure: 'Company cost',
    baseline: 90,
    target: 70,
    unit: 'KES',
    direction: 'LOWER',
    definition: 'Company accounts cost',
    dataSource: 'Company accounts',
    reviewFrequency: 'MONTHLY',
  };
  function company() {
    const approved = version();
    approved.data.objectives = [structuredClone(objective)];
    approved.data.goals = [];
    approved.data.assignments = [];
    approved.companyPlanningModel = 'MEASURABLE_OBJECTIVES';
    return {
      ...document([approved]),
      id: 'company',
      kind: 'COMPANY' as const,
      departmentId: '',
      scopeId: 'company',
    };
  }
  const observation = (
    id: string,
    actual: number,
    status: ProgrammeResult['status'] = 'VERIFIED',
  ): ProgrammeResult => ({
    id,
    documentId: 'company',
    itemId: 'objective',
    itemKind: 'OBJECTIVE',
    version: 1,
    scope: 'COMPANY',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    actual,
    numerator: null,
    denominator: null,
    source: 'Private measurement evidence',
    notes: 'Private commentary',
    status,
    recordedBy: 'recorder',
    recordedAt: id === 'corrected' ? '2026-02-03' : '2026-02-01',
    verifiedBy: 'verifier',
    verifiedAt: status === 'VERIFIED' ? '2026-02-02' : '',
    verificationNote: 'Private review note',
  });

  test('company values use own verified measurements while employee KPIs remain separate', () => {
    const input = source([document(), company()]);
    input.state.programmeResults = [
      observation('official', 65),
      observation('corrected', 82, 'PENDING'),
    ];
    const view = report(input);
    expect(view.kpis[0].officialActual).toBe(42);
    expect(view.measuredResults[0]).toMatchObject({
      source: 'AREA_03_MEASURED_RESULT',
      scope: 'COMPANY',
      officialActual: 65,
      comparableTarget: 70,
      pillar: 'LEX',
      alignments: ['C'],
      direction: 'LOWER',
      favourability: 'FAVOURABLE',
    });
    expect(view.measuredResults[0].periods[0]).toMatchObject({
      officialActual: 65,
      provisionalActual: 82,
      sourceResultId: 'corrected',
      officialResultId: 'official',
      correctionPending: true,
    });
    expect(view.summary.companyMeasures).toBe(1);
    expect(JSON.stringify(view)).not.toContain('Private');
    expect(
      report(input, [], { pillar: 'LEX', alignment: 'C' }).measuredResults,
    ).toHaveLength(1);
    expect(report(input, [], { pillar: 'PEX' }).measuredResults).toHaveLength(
      0,
    );
  });

  test('company objectives with no own observation remain empty despite completed employee results', () => {
    const view = report(source([document(), company()]));
    expect(view.kpis[0].officialActual).toBe(42);
    expect(view.measuredResults[0].officialActual).toBeNull();
  });

  test.each([
    ['HOD', 'hod'],
    ['EMPLOYEE', 'provider'],
  ])(
    'authorised %s reports inherit exact approved parent classifications without exposing company result rows',
    (role, employeeId) => {
      const department = document();
      department.versions[0].data.goals[0].parent = {
        documentId: 'company',
        goalId: 'objective',
        version: 1,
        itemKind: 'OBJECTIVE',
      };
      const input = source([department, company()], role, employeeId);
      const execution = projectExecution(
        input,
        emptyExecutionState(),
        0,
        '2026-02-01',
      );
      expect(execution.goals.some((g) => g.documentId === 'company')).toBe(
        false,
      );
      const view = projectIntelligence(execution, planning(input), {
        pillar: 'LEX',
        alignment: 'C',
      });
      expect(view.kpis).toHaveLength(1);
      expect(view.kpis[0]).toMatchObject({ pillar: 'LEX', alignments: ['C'] });
      expect(view.measuredResults).toHaveLength(0);
      expect(JSON.stringify(view)).not.toContain('Private SWOT');
      const hidden = planning(input);
      hidden.documents.find((d) => d.id === 'company')!.permissions.canRead =
        false;
      expect(
        projectIntelligence(execution, hidden, { pillar: 'LEX' }).kpis,
      ).toHaveLength(0);
    },
  );

  test('future and retained sibling approvals cannot duplicate measured result versions', () => {
    const doc = company();
    const future = structuredClone(doc.versions[0]);
    future.version = 2;
    future.effectiveDate = '2026-12-01';
    future.data.objectives[0].target = 10;
    const copied = structuredClone(doc.versions[0]);
    copied.version = 3;
    copied.effectiveDate = '2026-01-10';
    copied.itemVersions = { objective: 1 };
    doc.versions.push(future, copied);
    const view = report(source([doc]));
    expect(view.measuredResults.map((m) => m.version)).toEqual([1]);
    expect(view.measuredResults[0].periods[0].target).toBe(70);
  });

  test('historical company observations preserve exact dates when a later approval splits a schedule', () => {
    const doc = company();
    const revised = structuredClone(doc.versions[0]);
    revised.version = 2;
    revised.effectiveDate = '2026-01-15';
    revised.data.objectives[0].target = 50;
    doc.versions.push(revised);
    const input = source([doc]);
    input.state.programmeResults = [observation('official', 65)];
    const measured = report(input).measuredResults.find(
      (m) => m.version === 1,
    )!;
    expect(measured.officialActual).toBe(65);
    expect(measured.comparableTarget).toBeNull();
    expect(
      measured.periods.find((p) => p.officialResultId === 'official'),
    ).toMatchObject({
      start: '2026-01-01',
      end: '2026-01-31',
      target: null,
      partial: true,
    });
  });
});

describe('report filter and export contracts', () => {
  test('validates query types, enum values and unknown keys', () => {
    expect(
      validateSync(
        plainToInstance(IntelligenceQueryDto, {
          scope: 'EVERYONE',
          cycle: ['2026'],
          pillar: 'bad',
          search: 'a'.repeat(201),
          raw: true,
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ).length,
    ).toBe(5);
    expect(
      validateSync(
        plainToInstance(IntelligenceQueryDto, {
          scope: 'MY',
          cycle: '2026',
          startDate: '2026-01-01',
        }),
      ),
    ).toEqual([]);
  });

  test('export uses projected values and provenance with complete filter context', () => {
    const view = report(source(), undefined, {
      cycle: '2026',
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      search: 'Cost',
    });
    const csv = intelligenceCsv(view);
    expect(csv).toContain('"42","40"');
    expect(csv).toContain('"Filter: cycle","2026"');
    expect(csv).toContain('"Filter: search","Cost"');
    expect(csv).toContain('2026-02-01T10:00:00Z');
    expect(csv).toContain('result-01');
    expect(csv).not.toContain('Private');
    const employee = intelligenceCsv(
      report(source([document()], 'EMPLOYEE', 'verifier')),
    );
    expect(employee).not.toContain('Daily production ledger');
    expect(employee).not.toContain('production-plan/assignment');
  });

  test.each([
    '=SUM(A1:A9)',
    '+SUM(A1:A9)',
    '-2+3',
    '@SUM(1)',
    ' \t=HYPERLINK("url")',
    '\r\n+SUM(1)',
  ])('neutralises spreadsheet formulas: %s', (value) => {
    expect(csvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
  });
  test('keeps numeric negative measurements numeric and quotes commas/newlines', () => {
    expect(csvCell(-10)).toBe('"-10"');
    expect(csvCell('one,"two"\nthree')).toBe('"one,""two""\nthree"');
  });
});
