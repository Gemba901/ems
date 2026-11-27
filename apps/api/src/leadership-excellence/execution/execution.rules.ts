import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { KpiDefinition } from '../performance-planning/planning.types';
import { matchesSupportPerson } from './execution-support';
import { measurementValueIssue } from '../performance-planning/planning-measurements';
import type {
  ExecutionCommand,
  ExecutionHistory,
  ExecutionResult,
  ExecutionState,
  ExecutionSupportRequest,
  ExecutionView,
} from './execution.types';

const text = (value: unknown, max = 4000) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException(`Text must be at most ${max} characters.`);
  return value.trim();
};
const number = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new BadRequestException(
      'Enter a valid number or leave the value blank.',
    );
  return value;
};
export function calculateActual(
  definition: KpiDefinition,
  inputA: number | null,
  inputB: number | null,
): number | null {
  if (inputA == null) return null;
  if (definition.formula === 'DIRECT') return inputA;
  if (inputB == null || inputB <= 0) return null;
  const value =
    (inputA / inputB) * (definition.formula === 'PERCENT' ? 100 : 1);
  return Number.isFinite(value) ? value : null;
}
/** Aggregate official or provisional readings using their approved definition. Never average ratios. */
export function aggregateResults(
  definition: KpiDefinition,
  rows: Pick<ExecutionResult, 'actual' | 'inputA' | 'inputB'>[],
): number | null {
  const valid = rows.filter((row) => row.actual != null);
  if (!valid.length) return null;
  if (['CLOSING', 'MILESTONE'].includes(definition.aggregation))
    return valid.at(-1)!.actual;
  if (definition.aggregation === 'RATIO' || definition.formula !== 'DIRECT') {
    const sources = valid.filter(
      (row) => row.inputA != null && row.inputB != null && row.inputB > 0,
    );
    return sources.length
      ? calculateActual(
          definition,
          sources.reduce((sum, row) => sum + row.inputA!, 0),
          sources.reduce((sum, row) => sum + row.inputB!, 0),
        )
      : null;
  }
  if (definition.aggregation === 'SUM')
    return valid.reduce((sum, row) => sum + row.actual!, 0);
  return valid.at(-1)!.actual; // CLOSING and MILESTONE use the latest dated reading.
}
const identity = (key: string) => key.replace(/\/v\d+$/, '');
const history = (
  view: ExecutionView,
  event: string,
  detail: string,
): ExecutionHistory => ({
  at: new Date().toISOString(),
  by: view.actor.userId,
  name: view.actor.name,
  event,
  detail,
});
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

const acknowledgeSupport = (
  request: ExecutionSupportRequest,
  view: ExecutionView,
) => {
  if (request.acknowledgement) return;
  const event = history(
    view,
    'Support accepted',
    'Accepted responsibility for this support request.',
  );
  request.acknowledgement = {
    at: event.at,
    by: event.by,
    name: event.name,
  };
  if (request.status === 'OPEN') request.status = 'IN_PROGRESS';
  request.history.push(event);
};

/** Mutates a transaction-local clone only: a failed batch leaves every row unchanged. */
export function applyExecutionCommand(
  state: ExecutionState,
  command: ExecutionCommand,
  view: ExecutionView,
): void {
  const payload = command.payload;
  if (
    command.action === 'SAVE_RESULTS' ||
    command.action === 'SUBMIT_RESULTS'
  ) {
    const assignment = view.assignments.find(
      (a) => a.key === payload.assignmentKey,
    );
    if (!assignment)
      throw new NotFoundException(
        'This approved KPI assignment is not available to you.',
      );
    if (!assignment.canEnter)
      throw new ForbiddenException(
        'Only this KPI’s assigned data provider can enter results.',
      );
    const rows = payload.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > 732)
      throw new BadRequestException('Select between 1 and 732 reporting rows.');
    const ids = new Set<string>();
    for (const value of rows) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new BadRequestException('A result row is invalid.');
      const row = value as Record<string, unknown>;
      const periodId = text(row.periodId, 200);
      if (ids.has(periodId))
        throw new BadRequestException(
          'Each reporting period can appear only once in this submission.',
        );
      ids.add(periodId);
      const period = assignment.periods.find((p) => p.id === periodId);
      if (!period || period.scheduled === false)
        throw new BadRequestException('Choose a scheduled reporting period.');
      if (period.start > view.today)
        throw new BadRequestException(
          'Results cannot be entered for a future reporting period.',
        );
      if (command.action === 'SUBMIT_RESULTS' && period.end > view.today)
        throw new BadRequestException(
          'Save the current period as a draft; submit it when the reporting period ends.',
        );
      const existing = state.results.find(
        (r) =>
          identity(r.assignmentKey) === identity(assignment.key) &&
          r.periodId === periodId,
      );
      if (existing && existing.assignmentKey !== assignment.key)
        throw new ConflictException(
          'A result already exists for this period under an earlier approved version. Open that version to view or correct it.',
        );
      if (!existing) {
        // Calculated from full approved history before permission filtering, so
        // reassigned providers cannot bypass the newer version they cannot read.
        if (!assignment.entryPeriodIds.includes(period.id))
          throw new ConflictException(
            'Use the approved KPI version effective for this reporting period. Existing results keep their original version.',
          );
        const overlap = state.results.some((r) => {
          if (identity(r.assignmentKey) !== identity(assignment.key))
            return false;
          // A replacement provider cannot see the previous provider's snapshot.
          // Duplicate detection uses stored bounds/canonical period identity,
          // never a role-filtered lookup that could hide an overlapping result.
          const parts = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(
            r.periodId,
          );
          const start = r.periodStart || parts?.[1];
          const end = r.periodEnd || parts?.[2];
          return !start || !end || (start <= period.end && end >= period.start);
        });
        if (overlap)
          throw new ConflictException(
            'A result already covers dates within this reporting period. Correct the existing observation instead of creating an overlapping result.',
          );
      }
      if (existing?.status === 'SUBMITTED')
        throw new ConflictException(
          'Submitted rows are locked until the verifier returns or verifies them.',
        );
      const inputA = number(row.inputA),
        inputB =
          assignment.definition.formula === 'DIRECT'
            ? null
            : number(row.inputB);
      if (inputB != null && inputB <= 0)
        throw new BadRequestException(
          'The denominator must be greater than zero; a blank value is not zero.',
        );
      const actual = calculateActual(assignment.definition, inputA, inputB);
      const measurementIssue = measurementValueIssue(
        assignment.definition.unit,
        actual,
        `${period.label}: actual`,
      );
      if (measurementIssue) throw new BadRequestException(measurementIssue);
      const note = text(row.note),
        evidence = text(row.evidence);
      if (existing?.official && !note)
        throw new BadRequestException(
          'Explain why you are correcting this verified result.',
        );
      if (command.action === 'SUBMIT_RESULTS' && actual == null)
        throw new BadRequestException(
          `${period.label}: enter all source figures before submitting.`,
        );
      const event = history(
        view,
        command.action === 'SUBMIT_RESULTS'
          ? 'Submitted for verification'
          : 'Draft saved',
        JSON.stringify({
          before: existing
            ? {
                inputA: existing.inputA,
                inputB: existing.inputB,
                actual: existing.actual,
                status: existing.status,
                note: existing.note,
                evidence: existing.evidence,
              }
            : null,
          after: { inputA, inputB, actual, note, evidence },
        }),
      );
      const result: ExecutionResult = {
        id: existing?.id || randomUUID(),
        assignmentKey: assignment.key,
        periodId,
        periodStart: period.start,
        periodEnd: period.end,
        inputA,
        inputB,
        actual,
        note,
        evidence,
        status: command.action === 'SUBMIT_RESULTS' ? 'SUBMITTED' : 'DRAFT',
        updatedAt: event.at,
        updatedBy: view.actor.userId,
        submittedAt: command.action === 'SUBMIT_RESULTS' ? event.at : null,
        verificationNote: existing?.verificationNote || '',
        official: existing?.official || null,
        history: [...(existing?.history || []), event],
      };
      if (existing) state.results[state.results.indexOf(existing)] = result;
      else state.results.push(result);
    }
    return;
  }
  if (command.action === 'UPDATE_ACTION' || command.action === 'CHECK_ACTION') {
    const action = view.actions.find((a) => a.key === payload.actionKey);
    if (!action)
      throw new NotFoundException(
        'This approved delivery action is not available to you.',
      );
    let current = state.actionUpdates.find((a) => a.actionKey === action.key);
    // Continue existing Area 03 progress rather than resetting a shared action.
    if (!current) {
      current = structuredClone(
        view.actionUpdates.find((a) => a.actionKey === action.key) || {
          actionKey: action.key,
          status: 'NOT_STARTED',
          progress: 0,
          note: '',
          evidence: '',
          delayReason: '',
          updatedAt: '',
          updatedBy: '',
          history: [],
        },
      );
      state.actionUpdates.push(current);
    }
    const note = text(payload.note);
    if (command.action === 'CHECK_ACTION') {
      if (!action.canCheck)
        throw new ForbiddenException(
          'Only the authorised department checker can confirm this action.',
        );
      if (current.status !== 'PENDING_CHECK')
        throw new ConflictException(
          'Only actions sent for a completion check can be checked.',
        );
      if (!['COMPLETE', 'RETURN'].includes(String(payload.decision)))
        throw new BadRequestException('Choose complete or return.');
      if (payload.decision === 'RETURN' && !note)
        throw new BadRequestException('Explain what needs to be corrected.');
      current.status =
        payload.decision === 'COMPLETE' ? 'COMPLETED' : 'IN_PROGRESS';
      if (payload.decision === 'COMPLETE') current.progress = 100;
    } else {
      if (!action.canUpdate)
        throw new ForbiddenException(
          'Only the single assigned action owner can update this action.',
        );
      if (['COMPLETED', 'PENDING_CHECK'].includes(current.status))
        throw new ConflictException(
          'This action is completed or awaiting its completion check.',
        );
      if (
        !['IN_PROGRESS', 'BLOCKED', 'PENDING_CHECK'].includes(
          String(payload.status),
        )
      )
        throw new BadRequestException(
          'Choose in progress, blocked or ready for completion check.',
        );
      const progress = number(payload.progress);
      if (progress == null || progress < 0 || progress > 100)
        throw new BadRequestException('Progress must be between 0 and 100.');
      const evidence = text(payload.evidence),
        delayReason = text(payload.delayReason);
      if (payload.status === 'BLOCKED' && !delayReason)
        throw new BadRequestException('Describe what is blocking this action.');
      if (
        payload.status === 'PENDING_CHECK' &&
        (!evidence || !note || progress !== 100)
      )
        throw new BadRequestException(
          'Enter 100% progress, a completion note and evidence before requesting the check.',
        );
      current.status = payload.status as typeof current.status;
      current.progress = progress;
      current.evidence = evidence;
      current.delayReason = delayReason;
    }
    const event = history(view, current.status, note);
    current.note = note;
    current.updatedAt = event.at;
    current.updatedBy = view.actor.userId;
    current.history.push(event);
    return;
  }
  if (command.action === 'CREATE_SUPPORT') {
    const goal = view.goals.find((g) => g.key === payload.goalKey);
    if (!goal?.canRequestSupport)
      throw new ForbiddenException(
        'Choose an approved goal that you are permitted to work on.',
      );
    const linkedAction = text(payload.actionKey, 500);
    if (
      linkedAction &&
      !view.actions.some(
        (a) => a.key === linkedAction && a.goalKey === goal.key,
      )
    )
      throw new BadRequestException('Choose an action linked to this goal.');
    const title = text(payload.title, 200),
      request = text(payload.request),
      assignedToId = text(payload.assignedToId, 200),
      dueDate = text(payload.dueDate, 10);
    if (
      !title ||
      !request ||
      !view.references.people.some((p) => p.id === assignedToId) ||
      !validDate(dueDate)
    )
      throw new BadRequestException(
        'Enter the support needed, an EMS support person and a valid required-by date.',
      );
    const event = history(view, 'Support requested', request);
    state.supportRequests.push({
      id: randomUUID(),
      goalKey: goal.key,
      actionKey: linkedAction || null,
      title,
      request,
      requestorId: view.actor.employeeId || view.actor.userId,
      assignedToId,
      dueDate,
      status: 'OPEN',
      response: '',
      createdAt: event.at,
      acknowledgement: null,
      history: [event],
    });
    return;
  }
  if (command.action === 'ACKNOWLEDGE_SUPPORT') {
    const visible = view.supportRequests.find((r) => r.id === payload.id);
    const request = state.supportRequests.find((r) => r.id === payload.id);
    if (!visible || !request)
      throw new NotFoundException('Support request not found.');
    if (
      !matchesSupportPerson(
        view.actor,
        view.references.people,
        request.assignedToId,
      )
    )
      throw new ForbiddenException(
        'Only the assigned support person may accept this request.',
      );
    // Retrying an acceptance must preserve its first server timestamp and event,
    // including after the recipient has resolved or the requester has closed it.
    if (request.acknowledgement) return;
    if (!['OPEN', 'IN_PROGRESS'].includes(request.status))
      throw new ConflictException(
        'Only an open or in-progress support request can be accepted.',
      );
    acknowledgeSupport(request, view);
    return;
  }
  if (command.action === 'UPDATE_SUPPORT') {
    const visible = view.supportRequests.find((r) => r.id === payload.id);
    const request = state.supportRequests.find((r) => r.id === payload.id);
    if (!visible || !request)
      throw new NotFoundException('Support request not found.');
    const status = text(payload.status, 30),
      response = text(payload.response);
    if (!['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status) || !response)
      throw new BadRequestException(
        'Choose a response status and describe the update.',
      );
    if (status === 'CLOSED' ? !visible.canClose : !visible.canRespond)
      throw new ForbiddenException(
        'Only the support person may respond; only the requester or management may close the request.',
      );
    if (request.status === 'CLOSED')
      throw new ConflictException('This support request is already closed.');
    if (status === 'CLOSED' && request.status !== 'RESOLVED')
      throw new BadRequestException(
        'The support person must resolve the request before it is closed.',
      );
    // An assigned recipient's first response also explicitly accepts active work.
    // Management responses and legacy terminal records never imply acceptance.
    if (
      ['IN_PROGRESS', 'RESOLVED'].includes(status) &&
      ['OPEN', 'IN_PROGRESS'].includes(request.status) &&
      matchesSupportPerson(
        view.actor,
        view.references.people,
        request.assignedToId,
      )
    )
      acknowledgeSupport(request, view);
    request.status = status as typeof request.status;
    request.response = response;
    request.history.push(history(view, status, response));
    return;
  }
  throw new BadRequestException('Unsupported execution action.');
}

/** Internal handoff for Area 05. Not exposed as an Area 04 mutation route. */
export function verifyExecutionResult(
  state: ExecutionState,
  view: ExecutionView,
  resultId: string,
  decision: 'VERIFY' | 'RETURN',
  note: string,
): void {
  const result = state.results.find((r) => r.id === resultId);
  const assignment = view.assignments.find(
    (a) => a.key === result?.assignmentKey,
  );
  if (!result || !assignment) throw new NotFoundException('Result not found.');
  if (!assignment.canVerify || result.updatedBy === view.actor.userId)
    throw new ForbiddenException(
      'This result requires its separate assigned verifier.',
    );
  if (result.status !== 'SUBMITTED' || result.actual == null)
    throw new ConflictException(
      'Only submitted results can be verified or returned.',
    );
  if (decision === 'RETURN' && !note.trim())
    throw new BadRequestException('Explain why the result is being returned.');
  if (!['VERIFY', 'RETURN'].includes(decision))
    throw new BadRequestException('Choose verify or return.');
  const event = history(
    view,
    decision === 'VERIFY' ? 'Verified' : 'Returned',
    text(note),
  );
  result.status = decision === 'VERIFY' ? 'VERIFIED' : 'RETURNED';
  result.verificationNote = note;
  result.history.push(event);
  if (decision === 'VERIFY')
    result.official = {
      actual: result.actual,
      inputA: result.inputA,
      inputB: result.inputB,
      verifiedAt: event.at,
      verifiedBy: view.actor.userId,
    };
}
