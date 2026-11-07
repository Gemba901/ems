import { BadRequestException } from '@nestjs/common';
import {
  approvedParentGoals,
  blankData,
  actionLinkIssues,
  cleanItem,
  cleanFindingWeightage,
  cleanNumber,
  findingPriority,
  itemDefaults,
  periods,
  permissions,
  published,
  sanitizeForReader,
  sourceIssues,
  validatePlan,
} from './planning.rules';
import { emptyPlanningState } from './planning.seed';
import type {
  Objective,
  PlanningActor,
  PlanningDocument,
  PlanningReferences,
  PlanningState,
  PlanningCalendar,
} from './planning.types';

const manager: PlanningActor = {
  userId: 'u1',
  employeeId: 'p1',
  departmentId: 'd1',
  name: 'Manager',
  role: 'MANAGEMENT',
};
const employee: PlanningActor = {
  userId: 'u2',
  employeeId: 'p2',
  departmentId: 'd1',
  name: 'Employee',
  role: 'EMPLOYEE',
};
const refs: PlanningReferences = {
  departments: [{ id: 'd1', name: 'Production' }],
  teams: [],
  pillars: [],
  people: [
    {
      id: 'p1',
      name: 'Manager',
      departmentId: 'd1',
      position: 'CEO',
      role: 'MANAGEMENT',
      userId: 'u1',
    },
    {
      id: 'p2',
      name: 'Employee',
      departmentId: 'd1',
      position: 'Operator',
      role: 'EMPLOYEE',
      userId: 'u2',
    },
  ],
};
const document = (
  kind: PlanningDocument['kind'] = 'SWOT',
): PlanningDocument => ({
  id: 'doc',
  code: 'PLAN-2026-1',
  kind,
  scopeId: 'COMPANY',
  departmentId: 'd1',
  cycle: '2026',
  status: 'DRAFT',
  data: {
    ...blankData(),
    title: 'Plan',
    ownerId: 'p1',
    approverId: 'p1',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  },
  versions: [],
  revisionReason: '',
  effectiveDate: '',
  history: [],
  acknowledgement: null,
});

describe('Area 03 planning rules', () => {
  test.each([
    [1, 'LOW'],
    [2, 'LOW'],
    [3, 'LOW'],
    [4, 'MEDIUM'],
    [5, 'MEDIUM'],
    [6, 'MEDIUM'],
    [7, 'HIGH'],
    [8, 'HIGH'],
    [9, 'HIGH'],
    [10, 'HIGH'],
  ])(
    'weightage %s derives %s priority regardless of the client value',
    (weightage, priority) => {
      const finding = cleanItem(
        'finding',
        {
          pillar: 'OPX',
          category: 'W',
          title: 'Unplanned downtime',
          weightage,
          priority: { forged: 'HIGH' },
        },
        refs,
      );
      expect(finding).toMatchObject({ weightage, priority });
      expect(findingPriority(weightage)).toBe(priority);
    },
  );
  test.each([undefined, null, ''])(
    'blank weightage %s stays unassessed and never inherits a manual priority',
    (weightage) => {
      expect(itemDefaults('finding').weightage).toBeNull();
      expect(
        cleanItem(
          'finding',
          {
            pillar: 'OPX',
            category: 'W',
            title: 'Unplanned downtime',
            weightage,
            priority: 'HIGH',
          },
          refs,
        ),
      ).toMatchObject({ weightage: null, priority: '' });
      expect(cleanFindingWeightage(weightage)).toBeNull();
    },
  );
  test.each([
    0,
    -1,
    11,
    1.5,
    '7',
    '0',
    ' ',
    'NaN',
    NaN,
    Infinity,
    true,
    [],
    {},
  ])('invalid weightage %p is rejected even for a draft', (weightage) => {
    expect(() =>
      cleanItem(
        'finding',
        { pillar: 'OPX', category: 'W', title: 'Gap', weightage },
        refs,
      ),
    ).toThrow(/weightage.*whole number from 1 to 10/i);
  });
  test.each([undefined, null, 0, 11, 1.5, '7', NaN])(
    'finalisation rejects stored weightage %p without changing the saved finding',
    (weightage) => {
      const d = document();
      d.data.consideredPillars = ['LEX', 'PEX', 'OPX', 'CMX', 'SGEX', 'FPEX'];
      d.data.findings = [
        {
          ...cleanItem(
            'finding',
            {
              pillar: 'OPX',
              category: 'W',
              title: 'Legacy or restored finding',
              response: 'OBJECTIVE',
            },
            refs,
          ),
          id: 'f1',
          code: 'F1',
          weightage,
          priority: 'HIGH',
        } as never,
      ];
      const before = structuredClone(d);
      expect(validatePlan(d, emptyPlanningState(), refs, '2026-11-04')).toEqual(
        ['F1: enter weightage as a whole number from 1 to 10.'],
      );
      expect(d).toEqual(before);
    },
  );
  test('finalisation catches a stored priority that does not match weightage', () => {
    const d = document();
    d.data.consideredPillars = ['LEX', 'PEX', 'OPX', 'CMX', 'SGEX', 'FPEX'];
    d.data.findings = [
      {
        ...cleanItem(
          'finding',
          {
            pillar: 'OPX',
            category: 'W',
            title: 'Restored finding',
            weightage: 2,
            response: 'OBJECTIVE',
          },
          refs,
        ),
        id: 'f1',
        code: 'F1',
        priority: 'HIGH',
      } as never,
    ];
    expect(validatePlan(d, emptyPlanningState(), refs, '2026-11-04')).toEqual([
      'F1: save the finding to recalculate its priority from weightage.',
    ]);
  });
  test.each(['COMPANY', 'DEPARTMENT'] as const)(
    '%s approved parent choices include future snapshots, preserve old versions and exclude draft content',
    (kind) => {
      const parent = document(kind);
      parent.scopeId = kind === 'COMPANY' ? 'COMPANY' : 'd1';
      const goal = {
        ...cleanItem(
          'goal',
          {
            title: 'Approved commitment',
            departmentIds: ['d1'],
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            approach: 'Private supporting detail',
          },
          refs,
        ),
        id: 'goal',
        code: 'G1',
      } as PlanningDocument['data']['goals'][number];
      parent.data.goals = [goal];
      const state = { ...emptyPlanningState(), documents: [parent] };
      expect(approvedParentGoals(state, employee)).toEqual([]);
      parent.versions.push({
        version: 1,
        data: structuredClone(parent.data),
        effectiveDate: '2026-11-04',
        approvedAt: '2026-11-04',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      });
      expect(approvedParentGoals(state, employee)).toHaveLength(1);
      parent.versions.push({
        ...structuredClone(parent.versions[0]),
        version: 2,
        effectiveDate: '2027-01-01',
        data: {
          ...structuredClone(parent.data),
          goals: [{ ...goal, title: 'Approved future commitment' }],
        },
      });
      parent.data.goals[0].title = 'Unapproved revision';
      const before = structuredClone(state);
      const choices = approvedParentGoals(state, employee);
      expect(choices.map((choice) => choice.version)).toEqual([2, 1]);
      expect(choices[0]).toEqual({
        documentId: parent.id,
        kind,
        cycle: '2026',
        scopeId: parent.scopeId,
        departmentId: 'd1',
        version: 2,
        effectiveDate: '2027-01-01',
        goal: {
          id: 'goal',
          code: 'G1',
          title: 'Approved future commitment',
          departmentIds: ['d1'],
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      });
      expect(choices[1].goal.title).toBe('Approved commitment');
      expect(state).toEqual(before);
      expect(
        sanitizeForReader(parent, employee, '2026-11-04')?.versions,
      ).toHaveLength(1);
      expect(published(parent, '2026-11-04')?.version).toBe(1);
      if (kind === 'DEPARTMENT') {
        expect(
          approvedParentGoals(state, { ...employee, departmentId: 'other' }),
        ).toEqual([]);
        expect(
          approvedParentGoals(state, { ...employee, departmentId: '' }),
        ).toEqual([]);
      }
      parent.kind = 'SWOT';
      expect(approvedParentGoals(state, manager)).toEqual([]);
    },
  );
  test('HR has no blanket confidential SWOT access; explicit contributors and coordinators retain assigned access', () => {
    const d = document();
    const hr = { ...employee, role: 'HR' };
    expect(permissions(d, hr).canRead).toBe(false);
    expect(permissions(d, hr).canEdit).toBe(false);
    expect(sanitizeForReader(d, hr, '2026-11-04')).toBeNull();
    d.data.contributorIds = ['p2'];
    expect(permissions(d, hr).canRead).toBe(true);
    expect(permissions(d, hr).canEdit).toBe(true);
    expect(permissions(d, hr).canConfigure).toBe(false);
    expect(permissions(d, hr).canApprove).toBe(false);
    d.data.contributorIds = [];
    d.data.coordinatorIds = ['p2'];
    expect(permissions(d, hr).canRead).toBe(true);
    d.status = 'APPROVED';
    expect(permissions(d, hr).canEdit).toBe(false);
    d.data.coordinatorIds = [];
    expect(permissions(d, hr).canRead).toBe(false);
  });
  test('HR can edit a company draft only when explicitly designated its coordinator', () => {
    const d = document('COMPANY');
    const hr = { ...employee, role: 'HR' };
    expect(permissions(d, hr).canEdit).toBe(false);
    expect(sanitizeForReader(d, hr, '2026-11-04')).toBeNull();
    d.data.coordinatorIds = ['p2'];
    expect(permissions(d, hr).canEdit).toBe(true);
    expect(sanitizeForReader(d, hr, '2026-11-04')?.status).toBe('DRAFT');
    expect(permissions(d, hr).canConfigure).toBe(false);
  });
  test.each(['POSITION', 'TEAM'] as const)(
    'a former %s member sees only their entitled approved versions after reassignment',
    (kind) => {
      const d = document(kind);
      d.scopeId = 'scope';
      d.data.contributorIds = ['replacement'];
      d.data.title = 'Unapproved replacement draft';
      d.versions = [
        {
          version: 1,
          data: {
            ...d.data,
            title: 'Former member commitment',
            contributorIds: ['p2'],
          },
          approvedAt: '',
          approvedBy: 'u1',
          effectiveDate: '2026-01-01',
          definitions: [],
          reason: '',
        },
        {
          version: 2,
          data: {
            ...d.data,
            title: 'Replacement private commitment',
            contributorIds: ['replacement'],
          },
          approvedAt: '',
          approvedBy: 'u1',
          effectiveDate: '2026-06-01',
          definitions: [],
          reason: 'Reassignment',
        },
      ];
      const former = sanitizeForReader(d, employee, '2026-11-04')!;
      expect(former.data.title).toBe('Former member commitment');
      expect(former.versions.map((v) => v.version)).toEqual([1]);
      expect(former.history).toEqual([]);
      const replacement = {
        ...employee,
        employeeId: 'replacement',
        positionIds: ['scope'],
      };
      expect(
        sanitizeForReader(d, replacement, '2026-11-04')?.versions.map(
          (v) => v.version,
        ),
      ).toEqual([2]);
      expect(sanitizeForReader(d, replacement, '2026-02-01')).toBeNull();
      d.data.contributorIds.push('draft-only');
      expect(
        sanitizeForReader(
          d,
          { ...employee, employeeId: 'draft-only', positionIds: ['scope'] },
          '2026-11-04',
        ),
      ).toBeNull();
    },
  );
  test('department essential responsibilities still need independent goal measures, baseline/target and action-or-explanation', () => {
    const d = document('DEPARTMENT');
    d.scopeId = 'd1';
    const goal = {
      ...cleanItem(
        'goal',
        {
          title: 'Essential quality responsibility',
          ownerId: 'p1',
          ongoingReason: 'Maintain mandatory product quality checks',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
        refs,
      ),
      id: 'g1',
      code: 'G1',
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
    } as never;
    d.data.goals = [goal];
    const state = { ...emptyPlanningState(), documents: [d] };
    const issues = () => validatePlan(d, state, refs, '2026-11-04');
    expect(issues()).not.toContain(
      'G1: select an approved company goal, or explain the essential department responsibility.',
    );
    expect(issues()).toContain('G1: enter the measure and unit.');
    expect(issues()).toContain('G1: enter a target (zero is valid).');
    expect(issues()).toContain(
      'G1: enter a baseline or explain why it is unavailable.',
    );
    expect(issues().some((i) => i.includes('no separate action plan'))).toBe(
      true,
    );
    Object.assign(d.data.goals[0], {
      measure: 'Defects',
      unit: 'units',
      target: 0,
      baseline: 0,
      noActionReason:
        'Existing routine inspections deliver this responsibility.',
    });
    expect(
      issues().filter((i) =>
        /measure and unit|enter a target|enter a baseline|no separate action plan/.test(
          i,
        ),
      ),
    ).toEqual([]);
    d.data.goals[0].parent = {
      documentId: 'missing',
      goalId: 'missing',
      version: 1,
    };
    expect(issues()).toContain(
      'G1: select an approved company goal, or explain the essential department responsibility.',
    );
  });
  test('same owner/measure overlapping assignments are blocked; distinct active periods remain possible', () => {
    const d = document('DEPARTMENT');
    const assignment = (id: string, startDate: string, endDate: string) =>
      ({
        ...cleanItem(
          'assignment',
          {
            goalId: 'g1',
            ownerId: 'p1',
            definitionId: 'ref-kpi-downtime',
            startDate,
            endDate,
            target: 1,
          },
          refs,
        ),
        id,
        code: id,
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      }) as never;
    d.data.assignments = [
      assignment('A1', '2026-01-01', '2026-06-30'),
      assignment('A2', '2026-06-30', '2026-12-31'),
    ];
    const check = () =>
      validatePlan(
        d,
        { ...emptyPlanningState(), documents: [d] },
        refs,
        '2026-11-04',
      ).filter((i) => i.includes('overlapping assignments'));
    expect(check()).toHaveLength(1);
    d.data.assignments[1] = assignment('A2', '2026-07-01', '2026-12-31');
    expect(check()).toEqual([]);
  });
  test('duplicate target rows cannot silently overwrite each other on draft save', () => {
    expect(() =>
      cleanItem(
        'assignment',
        {
          targets: [
            { id: '2026-01-01/2026-01-31', target: 1 },
            { id: '2026-01-01/2026-01-31', target: 2 },
          ],
        },
        refs,
      ),
    ).toThrow('Each reporting period may have only one target.');
  });
  test('server-owned working calendar keeps holiday targets empty and pins submission dates', () => {
    const calendar: PlanningCalendar = {
      id: 'work',
      version: 'v1',
      source: 'WORK_SETTINGS',
      approved: false,
      timeZone: 'Asia/Kolkata',
      startDate: '',
      endDate: '',
      workingDays: [1, 2, 3, 4, 5],
      holidays: ['2026-11-04'],
      weekStart: 1,
      fortnightAnchor: '2026-01-05',
      twiceMonthlySplit: 15,
      submissionDueDays: 2,
    };
    const assignment = cleanItem(
      'assignment',
      {
        startDate: '2026-11-04',
        endDate: '2026-11-05',
        updateFrequency: 'DAILY',
        target: 0,
        calendar: { holidays: [], submissionDueDays: 3 },
      },
      { ...refs, calendar },
    );
    expect(assignment.calendar).toMatchObject({
      holidays: ['2026-11-04'],
      submissionDueDays: 3,
    });
    expect(assignment.targets).toMatchObject([
      { scheduled: false, target: null },
      { scheduled: true, target: 0, submissionDate: '2026-11-08' },
    ]);
  });
  test('shared department actions retain source version and cannot be claimed by another employee', () => {
    const source = document('DEPARTMENT');
    source.id = 'dept';
    source.scopeId = 'd1';
    source.data.actions = [
      {
        ...cleanItem(
          'action',
          {
            title: 'Inspect equipment',
            goalId: 'department-goal',
            ownerId: 'p2',
            dueDate: '2026-11-15',
          },
          refs,
        ),
        id: 'action',
        code: 'A1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    source.versions = [
      {
        version: 1,
        data: structuredClone(source.data),
        approvedAt: '',
        approvedBy: 'u1',
        effectiveDate: '2026-01-01',
        definitions: [],
        reason: '',
      },
    ];
    const child = document('INDIVIDUAL');
    child.id = 'personal';
    child.scopeId = 'p2';
    child.data.goals = [
      {
        ...cleanItem(
          'goal',
          {
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            parent: {
              documentId: 'dept',
              goalId: 'department-goal',
              version: 1,
            },
          },
          refs,
        ),
        id: 'personal-goal',
        code: 'PG',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    const link = {
      id: 'link',
      goalId: 'personal-goal',
      documentId: 'dept',
      actionId: 'action',
      version: 1,
    };
    const state = { ...emptyPlanningState(), documents: [source, child] };
    expect(actionLinkIssues(child, link, state, '2026-11-04')).toEqual([]);
    source.data.actions[0].ownerId = 'p1';
    expect(actionLinkIssues(child, link, state, '2026-11-04')).toEqual([]);
    child.scopeId = 'p1';
    expect(actionLinkIssues(child, link, state, '2026-11-04')[0]).toContain(
      'assigned to this employee',
    );
  });
  test('position holders read approved commitments without gaining access to drafts', () => {
    const d = document('POSITION');
    d.scopeId = 'position';
    expect(
      sanitizeForReader(
        d,
        { ...employee, positionIds: ['position'] },
        '2026-11-04',
      ),
    ).toBeNull();
    d.versions = [
      {
        version: 1,
        data: { ...d.data, contributorIds: ['p2'] },
        approvedAt: '',
        approvedBy: 'u1',
        effectiveDate: '2026-01-01',
        definitions: [],
        reason: '',
      },
    ];
    expect(sanitizeForReader(d, employee, '2026-11-04')?.status).toBe(
      'APPROVED',
    );
    expect(permissions(d, employee).canEdit).toBe(false);
    expect(
      permissions(d, { ...employee, employeeId: 'stranger' }).canRead,
    ).toBe(false);
  });
  test.each(['DEPARTMENT', 'TEAM', 'INDIVIDUAL'] as const)(
    '%s goals must stay inside the linked approved parent goal dates',
    (kind) => {
      const parent = document(kind === 'DEPARTMENT' ? 'COMPANY' : 'DEPARTMENT');
      parent.id = 'parent';
      parent.scopeId = kind === 'DEPARTMENT' ? 'COMPANY' : 'd1';
      parent.data.goals = [
        {
          ...cleanItem(
            'goal',
            {
              title: 'Parent contribution',
              ownerId: 'p1',
              startDate: '2026-03-01',
              endDate: '2026-09-30',
              departmentIds: ['d1'],
            },
            refs,
          ),
          id: 'parent-goal',
          code: 'PG1',
          createdAt: '',
          createdBy: '',
          updatedAt: '',
          updatedBy: '',
        } as never,
      ];
      parent.versions = [
        {
          version: 1,
          data: structuredClone(parent.data),
          effectiveDate: '2026-01-01',
          approvedAt: '2026-01-01',
          approvedBy: 'u1',
          definitions: [],
          reason: '',
        },
      ];
      const child = document(kind);
      child.id = 'child';
      child.scopeId = kind === 'DEPARTMENT' ? 'd1' : 'p2';
      child.data.goals = [
        {
          ...cleanItem(
            'goal',
            {
              title: 'Child contribution',
              ownerId: 'p2',
              startDate: '2026-01-01',
              endDate: '2026-12-31',
              parent: {
                documentId: 'parent',
                goalId: 'parent-goal',
                version: 1,
              },
            },
            refs,
          ),
          id: 'goal',
          code: 'G1',
          createdAt: '',
          createdBy: '',
          updatedAt: '',
          updatedBy: '',
        } as never,
      ];
      const state = { ...emptyPlanningState(), documents: [parent, child] };
      const issue =
        'G1: dates must stay within the approved parent goal period.';
      expect(validatePlan(child, state, refs, '2026-11-03')).toContain(issue);
      child.data.goals[0].startDate = '2026-03-01';
      child.data.goals[0].endDate = '2026-09-30';
      expect(validatePlan(child, state, refs, '2026-11-03')).not.toContain(
        issue,
      );
      parent.versions[0].effectiveDate = '2027-01-01';
      const parentIssue =
        kind === 'DEPARTMENT'
          ? 'G1: select an approved company goal, or explain the essential department responsibility.'
          : 'G1: link an approved department goal, or identify an ongoing role responsibility.';
      expect(validatePlan(child, state, refs, '2026-11-03')).not.toContain(
        parentIssue,
      );
      parent.cycle = '2027';
      expect(validatePlan(child, state, refs, '2026-11-03')).toContain(
        parentIssue,
      );
      parent.cycle = child.cycle;
      if (kind === 'DEPARTMENT') {
        parent.versions[0].data.goals[0].departmentIds = [];
        expect(validatePlan(child, state, refs, '2026-11-03')).toContain(
          'G1: this department must be identified as a contributor to the company goal.',
        );
        parent.versions[0].data.goals[0].departmentIds = ['d1'];
      } else {
        parent.scopeId = 'another-department';
        expect(validatePlan(child, state, refs, '2026-11-03')).toContain(
          parentIssue,
        );
        parent.scopeId = 'd1';
      }
      parent.data.goals[0].startDate = '2026-01-01';
      parent.data.goals[0].endDate = '2026-12-31';
      child.data.goals[0].endDate = '2026-10-01';
      expect(validatePlan(child, state, refs, '2026-11-03')).toContain(issue);
    },
  );
  test('KPI periods and action due dates stay within their contribution goal without silently changing drafts', () => {
    const d = document('DEPARTMENT');
    d.scopeId = 'd1';
    d.data.goals = [
      {
        ...cleanItem(
          'goal',
          {
            title: 'Contribution',
            ownerId: 'p1',
            startDate: '2026-03-01',
            endDate: '2026-09-30',
          },
          refs,
        ),
        id: 'goal',
        code: 'G1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    const assignment = cleanItem(
      'assignment',
      { goalId: 'goal', startDate: '2026-01-01', endDate: '2026-12-31' },
      refs,
    );
    expect(assignment.startDate).toBe('2026-01-01');
    d.data.assignments = [
      {
        ...assignment,
        id: 'assignment',
        code: 'K1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    d.data.actions = [
      {
        ...cleanItem(
          'action',
          { title: 'Action', goalId: 'goal', dueDate: '2026-12-01' },
          refs,
        ),
        id: 'action',
        code: 'A1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    const state = { ...emptyPlanningState(), documents: [d] };
    const kpiIssue = 'K1: dates must stay within the contribution goal period.';
    const actionIssue =
      'A1: the due date must stay within the contribution goal period.';
    const issues = validatePlan(d, state, refs, '2026-11-03');
    expect(issues).toContain(kpiIssue);
    expect(issues).toContain(actionIssue);
    d.data.assignments[0].startDate = '2026-03-01';
    d.data.assignments[0].endDate = '2026-09-30';
    d.data.actions[0].dueDate = '2026-09-30';
    const bounded = validatePlan(d, state, refs, '2026-11-03');
    expect(bounded).not.toContain(kpiIssue);
    expect(bounded).not.toContain(actionIssue);
    d.data.actions[0].dueDate = '2026-02-28';
    expect(validatePlan(d, state, refs, '2026-11-03')).toContain(actionIssue);
  });
  test('a reviewed source marked Needs checking cannot support approval even if the current finding is corrected', () => {
    const swot = document();
    swot.data.findings = [
      {
        ...cleanItem(
          'finding',
          {
            pillar: 'OPX',
            category: 'W',
            title: 'Unconfirmed loss estimate',
            basis: 'NEEDS_CHECKING',
          },
          refs,
        ),
        id: 'f1',
        code: 'F1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    swot.versions = [
      {
        version: 1,
        data: structuredClone(swot.data),
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
    ];
    swot.data.findings[0].basis = 'EVIDENCED';
    const objective = {
      ...cleanItem(
        'objective',
        {
          pillar: 'OPX',
          sources: [{ documentId: 'doc', findingId: 'f1', version: 1 }],
        },
        refs,
      ),
    } as unknown as Objective;
    expect(
      sourceIssues(objective, { ...emptyPlanningState(), documents: [swot] }),
    ).toContain('A finding marked Needs checking cannot justify approval.');
  });
  test('a designated SWOT owner can prepare their assessment without being a separately listed contributor', () => {
    const d = document();
    d.data.ownerId = 'p2';
    expect(permissions(d, employee).canRead).toBe(true);
    expect(permissions(d, employee).canEdit).toBe(true);
    expect(permissions(d, employee).canConfigure).toBe(false);
    expect(permissions(d, employee).canApprove).toBe(false);
    d.status = 'APPROVED';
    expect(permissions(d, employee).canEdit).toBe(false);
    d.data.ownerId = '';
    expect(permissions(d, { ...employee, employeeId: '' }).canRead).toBe(false);
  });
  test('team members read effective approved plans but never private drafts or future revisions', () => {
    const d = document('TEAM');
    d.scopeId = 'team-1';
    d.data.contributorIds = ['p2'];
    expect(permissions(d, employee).canRead).toBe(true);
    expect(permissions(d, employee).canEdit).toBe(false);
    expect(sanitizeForReader(d, employee, '2026-11-03')).toBeNull();
    d.versions = [
      {
        version: 1,
        data: { ...d.data, title: 'Approved team plan' },
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
      {
        version: 2,
        data: { ...d.data, title: 'Future team plan' },
        effectiveDate: '2027-01-01',
        approvedAt: '2026-11-03',
        approvedBy: 'u1',
        definitions: [],
        reason: 'Future change',
      },
    ];
    d.data.title = 'Private revised team draft';
    const visible = sanitizeForReader(d, employee, '2026-11-03')!;
    expect(visible.data.title).toBe('Approved team plan');
    expect(visible.versions).toHaveLength(1);
    expect(visible.history).toEqual([]);
  });
  test('malformed period target rows give a validation error instead of a TypeError', () => {
    for (const row of [null, [], 1, 'target'])
      expect(() => cleanItem('assignment', { targets: [row] }, refs)).toThrow(
        BadRequestException,
      );
  });
  test('an ongoing responsibility cannot bypass validation of a supplied parent goal', () => {
    const parent = document('DEPARTMENT');
    parent.id = 'parent';
    parent.scopeId = 'other-department';
    const parentGoal = {
      ...cleanItem(
        'goal',
        {
          title: 'Parent contribution',
          ownerId: 'p1',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
        refs,
      ),
      id: 'parent-goal',
      code: 'PG1',
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
    };
    parent.data.goals = [parentGoal as never];
    parent.versions = [
      {
        version: 1,
        data: structuredClone(parent.data),
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
    ];
    const child = document('INDIVIDUAL');
    child.id = 'child';
    child.scopeId = 'p2';
    child.data.goals = [
      {
        ...cleanItem(
          'goal',
          {
            title: 'My contribution',
            ownerId: 'p2',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            ongoingReason: 'Ongoing shift responsibility',
            parent: { documentId: 'parent', goalId: 'parent-goal', version: 1 },
          },
          refs,
        ),
        id: 'goal',
        code: 'G1',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      } as never,
    ];
    const state = { ...emptyPlanningState(), documents: [parent, child] };
    const issue =
      'G1: link an approved department goal, or identify an ongoing role responsibility.';
    expect(validatePlan(child, state, refs, '2026-11-03')).toContain(issue);
    parent.scopeId = 'd1';
    expect(validatePlan(child, state, refs, '2026-11-03')).not.toContain(issue);
    child.data.goals[0].parent = null;
    expect(validatePlan(child, state, refs, '2026-11-03')).not.toContain(issue);
    child.data.goals[0].ongoingReason = '';
    expect(validatePlan(child, state, refs, '2026-11-03')).toContain(issue);
  });
  test('employees can select effective approved goals from their own department without seeing its drafts', () => {
    const d = document('DEPARTMENT');
    d.scopeId = 'd1';
    d.data.title = 'Private department draft';
    expect(permissions(d, employee).canRead).toBe(true);
    expect(permissions(d, employee).canEdit).toBe(false);
    expect(sanitizeForReader(d, employee, '2026-11-03')).toBeNull();
    d.versions = [
      {
        version: 1,
        data: { ...d.data, title: 'Approved department plan' },
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
      {
        version: 2,
        data: { ...d.data, title: 'Future department plan' },
        effectiveDate: '2027-01-01',
        approvedAt: '2026-11-03',
        approvedBy: 'u1',
        definitions: [],
        reason: 'Future change',
      },
    ];
    const visible = sanitizeForReader(d, employee, '2026-11-03')!;
    expect(visible.data.title).toBe('Approved department plan');
    expect(visible.versions).toHaveLength(1);
    expect(visible.history).toEqual([]);
    expect(
      sanitizeForReader(
        d,
        { ...employee, departmentId: 'other-department' },
        '2026-11-03',
      ),
    ).toBeNull();
    expect(
      sanitizeForReader(d, { ...employee, departmentId: '' }, '2026-11-03'),
    ).toBeNull();
  });
  test('missing measurements stay null and real zero remains zero', () => {
    expect(cleanNumber('')).toBeNull();
    expect(cleanNumber(undefined)).toBeNull();
    expect(cleanNumber(0)).toBe(0);
    expect(() => cleanNumber(Infinity)).toThrow(BadRequestException);
  });
  test('fortnightly and twice-monthly have distinct boundaries', () => {
    expect(periods('2026-01-01', '2026-02-28', 'FORTNIGHTLY')[0].end).toBe(
      '2026-01-14',
    );
    expect(periods('2026-01-01', '2026-02-28', 'TWICE_MONTHLY')[0].end).toBe(
      '2026-01-15',
    );
    expect(periods('2026-01-01', '2026-02-28', 'TWICE_MONTHLY')).toHaveLength(
      4,
    );
  });
  test('partial periods and leap days remain bounded and never invent targets', () => {
    const rows = periods('2028-02-12', '2028-03-03', 'MONTHLY');
    expect(rows.map((r) => [r.start, r.end, r.target])).toEqual([
      ['2028-02-12', '2028-02-29', null],
      ['2028-03-01', '2028-03-03', null],
    ]);
    expect(periods('2026-02-30', '2026-03-10', 'DAILY')).toEqual([]);
  });
  test('rejects oversized planning periods', () => {
    expect(() => periods('2026-01-01', '2030-01-01', 'DAILY')).toThrow(
      BadRequestException,
    );
  });
  test('SWOT access can be revoked even if an older version included a contributor', () => {
    const d = document();
    d.versions = [
      {
        version: 1,
        data: { ...d.data, contributorIds: ['p2'] },
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
    ];
    expect(permissions(d, employee).canRead).toBe(false);
    d.data.contributorIds = ['p2'];
    expect(permissions(d, employee).canEdit).toBe(true);
    d.status = 'APPROVED';
    expect(permissions(d, employee).canEdit).toBe(false);
  });
  test('only the designated authorised approver can approve', () => {
    const d = document();
    expect(permissions(d, manager).canApprove).toBe(true);
    d.data.approverId = 'p2';
    expect(permissions(d, manager).canApprove).toBe(false);
    expect(permissions(d, employee).canApprove).toBe(false);
  });
  test('employees see no company draft and retain effective version while a revision is in progress', () => {
    const d = document('COMPANY');
    expect(sanitizeForReader(d, employee, '2026-11-03')).toBeNull();
    d.versions.push(
      {
        version: 1,
        data: { ...d.data, title: 'Approved plan' },
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
      {
        version: 2,
        data: { ...d.data, title: 'Future plan' },
        effectiveDate: '2027-01-01',
        approvedAt: '2026-11-03',
        approvedBy: 'u1',
        definitions: [],
        reason: 'Change',
      },
    );
    d.data.title = 'Private draft';
    const safe = sanitizeForReader(d, employee, '2026-11-03')!;
    expect(safe.data.title).toBe('Approved plan');
    expect(safe.versions).toHaveLength(1);
    expect(published(d, '2027-01-01')?.version).toBe(2);
  });
  test('considering all pillars does not force artificial SWOT findings', () => {
    const d = document();
    d.data.consideredPillars = ['LEX', 'PEX', 'OPX', 'CMX', 'SGEX', 'FPEX'];
    expect(validatePlan(d, emptyPlanningState(), refs, '2026-11-03')).toEqual(
      [],
    );
  });
  test('incomplete objectives can save; findings need only pillar/category/short text', () => {
    expect(cleanItem('objective', {}, refs).title).toBe('');
    expect(
      cleanItem(
        'finding',
        { pillar: 'OPX', category: 'W', title: 'Unplanned downtime' },
        refs,
      ).basis,
    ).toBe('MANAGEMENT');
    expect(() =>
      cleanItem('finding', { pillar: 'OPX', category: 'W' }, refs),
    ).toThrow();
  });
  test('findings reject script URLs and foreign organisation members', () => {
    expect(() =>
      cleanItem(
        'finding',
        {
          pillar: 'OPX',
          category: 'W',
          title: 'Gap',
          sourceUrl: 'javascript:alert(1)',
        },
        refs,
      ),
    ).toThrow();
    expect(() => cleanItem('goal', { ownerId: 'foreign' }, refs)).toThrow();
  });
  test('period targets preserve zero and leave missing varied targets blank', () => {
    const a = cleanItem(
      'assignment',
      {
        startDate: '2026-01-01',
        endDate: '2026-02-28',
        targetMode: 'VARIED',
        targets: [{ id: '2026-01-01/2026-01-31', target: 0, upper: null }],
      },
      refs,
    );
    expect(
      (a.targets as { target: number | null }[]).map((p) => p.target),
    ).toEqual([0, null]);
  });
  test('a reviewed source is pinned to its version; cross-pillar use needs a reason', () => {
    const swot = document();
    const finding = {
      ...cleanItem(
        'finding',
        { pillar: 'OPX', category: 'W', title: 'Original evidence' },
        refs,
      ),
      id: 'f1',
      code: 'F1',
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
    };
    swot.data.findings = [finding as never];
    swot.versions = [
      {
        version: 1,
        data: structuredClone(swot.data),
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'u1',
        definitions: [],
        reason: '',
      },
    ];
    swot.data.findings[0].basis = 'NEEDS_CHECKING';
    const state: PlanningState = { ...emptyPlanningState(), documents: [swot] };
    const objective = {
      ...cleanItem(
        'objective',
        {
          pillar: 'OPX',
          sources: [{ documentId: 'doc', findingId: 'f1', version: 1 }],
        },
        refs,
      ),
    } as unknown as Objective;
    expect(sourceIssues(objective, state)).toEqual([]);
    objective.pillar = 'PEX';
    expect(sourceIssues(objective, state)).toContain(
      'Explain why findings from other pillars support this objective.',
    );
    objective.sourceRationale = 'Skills reduce errors';
    expect(sourceIssues(objective, state)).toEqual([]);
  });
});
