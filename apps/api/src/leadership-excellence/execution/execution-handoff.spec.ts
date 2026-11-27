import { blankData } from '../performance-planning/planning.rules';
import { calendarPeriods } from '../performance-planning/planning-calendar';
import type {
  ApprovedVersion, Assignment, DeliveryAction, Goal, KpiDefinition,
  PlanningActor, PlanningCalendar, PlanningDocument,
} from '../performance-planning/planning.types';
import {
  actionKey, commitmentKey, emptyExecutionState, projectExecution,
  type ExecutionSource,
} from './execution.projection';
import { aggregateResults, applyExecutionCommand, verifyExecutionResult } from './execution.rules';
import type { ExecutionCommand, ExecutionState } from './execution.types';

const stamp = (id: string) => ({ id, code: id.toUpperCase(), createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' });
const actor = (id = 'provider', role = 'EMPLOYEE', departmentId = 'quality'): PlanningActor => ({
  userId: `user-${id}`, employeeId: id, departmentId, role, name: id,
});
const definition: KpiDefinition = {
  id: 'waste-cost', code: 'WASTE', kraId: 'quality', name: 'Waste cost per accepted unit',
  meaning: 'Waste cost divided by accepted units', unit: 'KES/unit', direction: 'LOWER',
  formula: 'RATIO', inputA: 'Waste cost', inputB: 'Accepted units', aggregation: 'RATIO', source: 'CUSTOM',
};
const goal = (id = 'goal'): Goal => ({
  ...stamp(id), title: `Approved ${id}`, objectiveId: '', parent: null, ongoingReason: '',
  measure: definition.name, definitionId: definition.id, baseline: 50, baselineReason: '',
  target: 40, unit: definition.unit, ownerId: 'hod', startDate: '2026-01-01', endDate: '2026-12-31',
  approach: '', departmentIds: ['production'],
});
const assignment = (id = 'assignment', goalId = 'goal'): Assignment => ({
  ...stamp(id), goalId, definitionId: definition.id, ownerId: 'owner', providerId: 'provider',
  verifierId: 'verifier', baseline: 50, baselineReason: '', startDate: '2026-01-01', endDate: '2026-01-02',
  source: 'Production records', updateFrequency: 'DAILY', reviewFrequency: 'MONTHLY',
  targetMode: 'SAME', target: 40, upper: null,
  targets: calendarPeriods('2026-01-01', '2026-01-02', 'DAILY').map((p) => ({ ...p, target: 40 })),
});
const version = (number = 1, goals = [goal()], assignments = [assignment()]): ApprovedVersion => ({
  version: number,
  data: { ...blankData(), title: 'Production plan', ownerId: 'hod', approverId: 'approver',
    startDate: '2026-01-01', endDate: '2026-12-31', goals, assignments },
  approvedAt: '2026-01-01T00:00:00Z', approvedBy: 'user-approver', effectiveDate: '2026-01-01',
  definitions: [structuredClone(definition)], reason: '',
});
const document = (versions = [version()]): PlanningDocument => ({
  id: 'production-plan', code: 'PROD-2026', kind: 'DEPARTMENT', scopeId: 'production',
  departmentId: 'production', cycle: '2026', status: 'APPROVED', versions,
  data: structuredClone(versions.at(-1)!.data), revisionReason: '', effectiveDate: '',
  history: [], acknowledgement: null,
});
const source = (documents = [document()], person = actor()): ExecutionSource => ({
  revision: 4, actor: person,
  state: { schema: 1, sequence: 7, documents, kras: [], definitions: [definition] },
  references: {
    departments: [{ id: 'production', name: 'Production' }, { id: 'quality', name: 'Quality' }],
    people: ['provider', 'verifier', 'owner', 'hod', 'support', 'outsider'].map((id) => ({
      id, name: id, departmentId: id === 'hod' ? 'production' : 'quality', position: 'Engineer',
      role: id === 'hod' ? 'HOD' : 'EMPLOYEE', userId: `user-${id}`,
    })), teams: [], pillars: [], timeZone: 'UTC',
  },
});
const view = (input = source(), state = emptyExecutionState()) => projectExecution(input, state, 0, '2026-11-18');
const command = (action: ExecutionCommand['action'], payload: Record<string, unknown>): ExecutionCommand => ({ expectedRevision: 0, action, payload });
const submit = (state: ExecutionState, input = source(), value = 6000) => applyExecutionCommand(state,
  command('SUBMIT_RESULTS', { assignmentKey: 'production-plan/assignment/v1', rows: [
    { periodId: '2026-01-01/2026-01-01', inputA: value, inputB: 100, evidence: 'Signed daily log', note: 'Checked source' },
  ] }), view(input, state));

describe('Area 03 to Area 04 approved dependency handoff', () => {
  test('a superseding earlier-effective revision owns December entries, not the old scheduled version', () => {
    const old = version(1), scheduled = version(2), superseding = version(3);
    scheduled.effectiveDate = '2026-12-01';
    superseding.effectiveDate = '2026-11-15';
    for (const snapshot of [old, scheduled, superseding]) {
      snapshot.approvedItem = { kind: 'goal', itemId: 'goal' };
      const item = snapshot.data.assignments[0];
      item.startDate = '2026-01-01';
      item.endDate = '2026-12-31';
      item.updateFrequency = 'MONTHLY';
      item.targets = calendarPeriods(item.startDate, item.endDate, 'MONTHLY').map((p) => ({ ...p, target: 40 }));
    }
    const result = projectExecution(source([document([old, scheduled, superseding])]), emptyExecutionState(), 0, '2026-12-31');
    expect(result.assignments.find((item) => item.version === 3)?.entryPeriodIds).toContain('2026-12-01/2026-12-31');
    expect(result.assignments.find((item) => item.version === 2)?.entryPeriodIds).not.toContain('2026-12-01/2026-12-31');
  });
  test('whole-plan approval retains canonical assignment versions and cannot activate a future target', () => {
    const first = version();
    first.approvedItem = { kind: 'goal', itemId: 'goal' };
    const future = version(2);
    future.approvedItem = { kind: 'goal', itemId: 'goal' };
    future.effectiveDate = '2026-12-01';
    future.data.goals[0].target = 10;
    future.data.assignments[0].targets.forEach((p) => { p.target = 10; });
    const whole = structuredClone(future);
    whole.version = 3;
    whole.effectiveDate = '2026-11-01';
    delete whole.approvedItem;
    whole.itemVersions = { goal: 2 };
    const result = view(source([document([first, future, whole])]));
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].version).toBe(1);
    expect(result.assignments[0].periods[0].target).toBe(40);
    expect(result.assignments[0].current).toBe(true);
  });
  test('cross-department provider receives assigned work without unrelated sibling goals or draft source evidence', () => {
    const sibling = goal('private-sibling');
    const otherAssignment = { ...assignment('private-assignment', sibling.id), providerId: 'outsider', ownerId: 'outsider', verifierId: 'outsider' };
    const doc = document([version(1, [goal(), sibling], [assignment(), otherAssignment])]);
    doc.data.goals.push(goal('draft-only'));
    const result = view(source([doc]));
    expect(result.goals.map((g) => g.item.id)).toEqual(['goal']);
    expect(result.assignments.map((a) => a.assignment.id)).toEqual(['assignment']);
    expect(result.assignments[0].canEnter).toBe(true);
    expect(result.actor.departmentId).toBe('quality');
    expect(result.assignments[0].departmentId).toBe('production');
    expect(result.goals[0].personal).toBe(true);
  });

  test('assignment owner and HOD read permission do not grant data-provider editing', () => {
    const owner = view(source(undefined, actor('owner')));
    const hod = view(source(undefined, actor('hod', 'HOD', 'production')));
    expect(owner.assignments[0].canEnter).toBe(false);
    expect(hod.assignments[0].canEnter).toBe(false);
    expect(hod.canViewDepartment).toBe(true);
    expect(() => submit(emptyExecutionState(), source(undefined, actor('hod', 'HOD', 'production')))).toThrow(/provider/i);
  });

  test('cumulative approval does not publish another goal future revision or its changed formula and target', () => {
    const first = version();
    first.approvedItem = { kind: 'goal', itemId: 'goal' };
    const future = version(2, [{ ...goal(), title: 'Future goal', target: 10 }], [{ ...assignment(), target: 10,
      targets: assignment().targets.map((p) => ({ ...p, target: 10 })) }]);
    future.approvedItem = { kind: 'goal', itemId: 'goal' };
    future.effectiveDate = '2027-01-01';
    future.definitions[0].meaning = 'Future definition';
    const sibling = goal('sibling');
    const cumulative = structuredClone(future);
    cumulative.version = 3;
    cumulative.effectiveDate = '2026-01-01';
    cumulative.approvedItem = { kind: 'goal', itemId: sibling.id };
    cumulative.data.goals.push(sibling);
    cumulative.data.assignments.push(assignment('sibling-assignment', sibling.id));
    const result = view(source([document([first, future, cumulative])]));
    const actual = result.assignments.find((a) => a.assignment.id === 'assignment')!;
    expect(actual.version).toBe(1);
    expect(actual.periods[0].target).toBe(40);
    expect(actual.definition.meaning).toBe(definition.meaning);
    expect(result.goals.find((g) => g.item.id === 'goal')!.item.title).toBe('Approved goal');
  });

  test('management can inspect historical assignment versions while current goals use the latest own approval', () => {
    const old = version(), revised = version(2);
    old.approvedItem = revised.approvedItem = { kind: 'goal', itemId: 'goal' };
    revised.effectiveDate = '2026-10-01';
    revised.data.assignments[0].target = 30;
    const result = view(source([document([old, revised])], actor('admin', 'MANAGEMENT', '')));
    expect(result.assignments.map((a) => a.version)).toEqual([1, 2]);
    expect(result.assignments.find((a) => a.version === 1)!.current).toBe(false);
    expect(result.assignments.find((a) => a.version === 2)!.current).toBe(true);
  });

  test('an approved non-working date remains Not scheduled with no invented target', () => {
    const calendar: PlanningCalendar = { id: 'work', version: 1, source: 'AREA_02', approved: true,
      timeZone: 'UTC', startDate: '', endDate: '', workingDays: [1, 2, 3, 4, 5], holidays: ['2026-01-01'],
      weekStart: 1, fortnightAnchor: '2026-01-05', twiceMonthlySplit: 15, submissionDueDays: 1 };
    const assigned = assignment();
    assigned.calendar = calendar;
    assigned.targets = calendarPeriods(assigned.startDate, assigned.endDate, 'DAILY', calendar)
      .map((p) => ({ ...p, target: p.scheduled ? 40 : null }));
    const result = view(source([document([version(1, [goal()], [assigned])])]));
    expect(result.assignments[0].periods[0]).toMatchObject({ scheduled: false, target: null, upper: null });
    expect(result.assignments[0].periods[1]).toMatchObject({ scheduled: true, target: 40, submissionDate: '2026-01-03' });
  });

  test('post-approval action and legacy progress survive a later revision of the same goal', () => {
    const old = version(), revised = version(2);
    old.approvedItem = revised.approvedItem = { kind: 'goal', itemId: 'goal' };
    revised.effectiveDate = '2026-10-01';
    const doc = document([old, revised]);
    const action: DeliveryAction = { ...stamp('setup'), title: 'Standardise setup', goalId: 'goal',
      parent: { documentId: doc.id, goalId: 'goal', version: 1 }, parentActionId: '', ownerId: 'provider',
      dueDate: '2026-12-01', expectedResult: 'Repeatable setup', completionEvidence: 'Signed checklist', support: '', sources: [] };
    doc.data.actions = [action];
    const input = source([doc]);
    input.state.programmeActionProgress = [{ id: 'history', documentId: doc.id, actionId: action.id,
      status: 'IN_PROGRESS', evidence: 'Setup photo', note: 'Started', updatedBy: 'user-provider', updatedAt: '2026-09-30T09:00:00Z' }];
    const result = view(input);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].key).toBe(actionKey(doc.id, action.id));
    expect(result.actions[0].canUpdate).toBe(true);
    expect(result.actionUpdates[0]).toMatchObject({ status: 'IN_PROGRESS', note: 'Started' });
  });
});

describe('Area 04 result and support authorisation', () => {
  test.each([-1, 0.5])('discrete count actual %s is rejected before persistence', (actual) => {
    const approved = version();
    approved.definitions[0] = { ...approved.definitions[0], formula: 'DIRECT', unit: 'count', aggregation: 'SUM' };
    const input = source([document([approved])]);
    const state = emptyExecutionState();
    expect(() => submit(state, input, actual)).toThrow(/nonnegative whole number/);
    expect(state.results).toEqual([]);
  });
  test.each([0, 4])('discrete count actual %s is accepted', (actual) => {
    const approved = version();
    approved.definitions[0] = { ...approved.definitions[0], formula: 'DIRECT', unit: 'count', aggregation: 'SUM' };
    const input = source([document([approved])]);
    const state = emptyExecutionState();
    submit(state, input, actual);
    expect(state.results[0].actual).toBe(actual);
  });
  test('negative continuous financial result remains valid', () => {
    const approved = version();
    approved.definitions[0] = { ...approved.definitions[0], formula: 'DIRECT', unit: 'KES', aggregation: 'SUM' };
    const input = source([document([approved])]);
    const state = emptyExecutionState();
    submit(state, input, -40.5);
    expect(state.results[0].actual).toBe(-40.5);
  });
  test('a former provider cannot enter a new period after reassignment, even when the new assignment is private', () => {
    const old = version(), revised = version(2);
    old.approvedItem = revised.approvedItem = { kind: 'goal', itemId: 'goal' };
    revised.effectiveDate = '2026-10-01';
    for (const snapshot of [old, revised]) {
      snapshot.data.assignments[0].endDate = '2026-12-31';
      snapshot.data.assignments[0].targets = calendarPeriods('2026-01-01', '2026-12-31', 'DAILY')
        .map((period) => ({ ...period, target: 40 }));
    }
    revised.data.assignments[0].providerId = 'outsider';
    const sourceData = source([document([old, revised])]);
    const oldProviderView = view(sourceData);
    expect(oldProviderView.assignments.map((a) => a.version)).toEqual([1]);
    expect(() => applyExecutionCommand(emptyExecutionState(), command('SUBMIT_RESULTS', {
      assignmentKey: 'production-plan/assignment/v1', rows: [
        { periodId: '2026-11-01/2026-11-01', inputA: 3000, inputB: 100 },
      ],
    }), oldProviderView)).toThrow();
  });

  test('ratio aggregation uses original sources and direct aggregation respects the approved rule', () => {
    const readings = [{ inputA: 6000, inputB: 100, actual: 60 }, { inputA: 4500, inputB: 150, actual: 30 }];
    expect(aggregateResults(definition, readings)).toBe(42);
    expect(aggregateResults(definition, [])).toBeNull();
    const direct = { ...definition, formula: 'DIRECT' as const };
    expect(aggregateResults({ ...direct, aggregation: 'CLOSING' }, readings)).toBe(30);
    expect(aggregateResults({ ...direct, aggregation: 'MILESTONE' }, readings)).toBe(30);
    expect(aggregateResults({ ...direct, aggregation: 'SUM' }, readings)).toBe(90);
  });

  test('schedule and provider changes cannot create a period overlapping a hidden earlier draft', () => {
    const old = version(), revised = version(2);
    old.approvedItem = revised.approvedItem = { kind: 'goal', itemId: 'goal' };
    old.data.assignments[0].updateFrequency = 'MONTHLY';
    revised.data.assignments[0].updateFrequency = 'WEEKLY';
    revised.data.assignments[0].providerId = 'outsider';
    revised.effectiveDate = '2026-01-08';
    for (const snapshot of [old, revised]) {
      const assigned = snapshot.data.assignments[0];
      assigned.endDate = '2026-01-31';
      assigned.targets = calendarPeriods(assigned.startDate, assigned.endDate, assigned.updateFrequency)
        .map((period) => ({ ...period, target: 40 }));
    }
    const state = emptyExecutionState();
    const sourceData = source([document([old, revised])]);
    applyExecutionCommand(state, command('SAVE_RESULTS', { assignmentKey: 'production-plan/assignment/v1', rows: [
      { periodId: '2026-01-01/2026-01-31', inputA: 3000, inputB: 100 },
    ] }), view(sourceData, state));
    const nextProviderView = view({ ...sourceData, actor: actor('outsider') }, state);
    expect(nextProviderView.assignments.map((a) => a.version)).toEqual([2]);
    expect(() => applyExecutionCommand(state, command('SUBMIT_RESULTS', { assignmentKey: 'production-plan/assignment/v2', rows: [
      { periodId: '2026-01-08/2026-01-14', inputA: 2000, inputB: 100 },
    ] }), nextProviderView)).toThrow(/overlap|already covers/i);
  });

  test('repeat submission is rejected and cannot create a duplicate assignment-period record', () => {
    const state = emptyExecutionState();
    submit(state);
    expect(state.results[0].status).toBe('SUBMITTED');
    expect(state.results[0].official).toBeNull();
    expect(() => submit(state)).toThrow(/Submitted rows are locked/);
    expect(state.results).toHaveLength(1);
  });

  test('a different assignment version cannot duplicate the same measurement period', () => {
    const state = emptyExecutionState();
    submit(state);
    const input = source([document([version(), version(2)])]);
    expect(() => applyExecutionCommand(state, command('SUBMIT_RESULTS', {
      assignmentKey: 'production-plan/assignment/v2', rows: [{ periodId: '2026-01-01/2026-01-01', inputA: 3000, inputB: 100 }],
    }), view(input, state))).toThrow(/earlier approved version/);
    expect(state.results).toHaveLength(1);
  });

  test('verifier must be independently assigned; verified value remains official while its correction is pending', () => {
    const state = emptyExecutionState();
    submit(state);
    const resultId = state.results[0].id;
    expect(() => verifyExecutionResult(state, view(source(), state), resultId, 'VERIFY', 'Checked')).toThrow(/separate assigned verifier/);
    verifyExecutionResult(state, view(source(undefined, actor('verifier')), state), resultId, 'VERIFY', 'Verified from signed log');
    expect(state.results[0].official!.actual).toBe(60);
    submit(state, source(), 4500);
    expect(state.results[0].actual).toBe(45);
    expect(state.results[0].status).toBe('SUBMITTED');
    expect(state.results[0].official!.actual).toBe(60);
    verifyExecutionResult(state, view(source(undefined, actor('verifier')), state), resultId, 'RETURN', 'Recheck units');
    expect(state.results[0].status).toBe('RETURNED');
    expect(state.results[0].official!.actual).toBe(60);
  });

  test('zero is preserved and blank draft denominator does not produce an actual', () => {
    const state = emptyExecutionState();
    applyExecutionCommand(state, command('SAVE_RESULTS', {
      assignmentKey: 'production-plan/assignment/v1', rows: [
        { periodId: '2026-01-01/2026-01-01', inputA: 0, inputB: 100 },
        { periodId: '2026-01-02/2026-01-02', inputA: 0, inputB: null },
      ],
    }), view());
    expect(state.results.map((r) => r.actual)).toEqual([0, null]);
    expect(state.results.map((r) => r.status)).toEqual(['DRAFT', 'DRAFT']);
  });

  test('unrelated employees do not see support requests; an assigned support person responds without receiving the private plan', () => {
    const state = emptyExecutionState();
    applyExecutionCommand(state, command('CREATE_SUPPORT', {
      goalKey: commitmentKey('production-plan', 'goal', 1), title: 'Need calibration',
      request: 'Please calibrate the scale', assignedToId: 'support', dueDate: '2026-11-25',
    }), view(source(), state));
    expect(view(source(undefined, actor('outsider')), state).supportRequests).toEqual([]);
    const supportView = view(source(undefined, actor('support')), state);
    expect(supportView.supportRequests).toHaveLength(1);
    expect(supportView.goals).toEqual([]);
    expect(supportView.assignments).toEqual([]);
    expect(supportView.supportRequests[0]).toMatchObject({
      canRespond: true, canClose: false, cycle: '2026', goalTitle: 'Approved goal',
    });
    expect(state.supportRequests[0]).not.toHaveProperty('cycle');
    expect(state.supportRequests[0]).not.toHaveProperty('goalTitle');
    applyExecutionCommand(state, command('UPDATE_SUPPORT', {
      id: state.supportRequests[0].id, status: 'RESOLVED', response: 'Calibration complete',
    }), supportView);
    expect(() => applyExecutionCommand(state, command('UPDATE_SUPPORT', {
      id: state.supportRequests[0].id, status: 'CLOSED', response: 'Closing',
    }), view(source(undefined, actor('support')), state))).toThrow(/requester/);
    applyExecutionCommand(state, command('UPDATE_SUPPORT', {
      id: state.supportRequests[0].id, status: 'CLOSED', response: 'Confirmed calibrated',
    }), view(source(), state));
    expect(state.supportRequests[0].status).toBe('CLOSED');
  });
});
