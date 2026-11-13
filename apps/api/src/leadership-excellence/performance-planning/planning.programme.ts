import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cleanNumber,
  cleanText,
  FREQUENCIES,
  isManager,
  objectiveAllocations,
  objectiveAlignmentValues,
  parentReferenceIssues,
  permissions,
  resolveApprovedParent,
  sourceIssues,
  validDate,
  validObjectivePriority,
  validObjectiveWeightage,
  assignmentReadinessIssues,
  planSetupIssues,
  validatePlan,
} from './planning.rules';
import type {
  Goal,
  Objective,
  PlanningActor,
  PlanningDocument,
  PlanningReferences,
  PlanningState,
  ProgrammeResult,
} from './planning.types';

export function programmeItemLocked(
  document: PlanningDocument,
  kind: string,
  id: string,
) {
  const approval = document.itemApprovals?.find(
    (a) => a.kind === kind && a.itemId === id,
  );
  return approval
    ? approval.status === 'APPROVED'
    : document.status === 'APPROVED';
}
export function programmeItemIssues(
  document: PlanningDocument,
  kind: 'objective' | 'goal',
  id: string,
  state: PlanningState,
  refs: PlanningReferences,
): string[] {
  const item = (
    kind === 'objective' ? document.data.objectives : document.data.goals
  ).find((i) => i.id === id);
  if (!item) return ['Select an existing commitment in this plan.'];
  const errors: string[] = [];
  const need = (value: unknown, message: string) => {
    if (!value) errors.push(message);
  };
  const person = (value: string) => refs.people.some((p) => p.id === value);
  const numeric = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  need(
    person(document.data.approverId),
    'Choose the designated approver in plan settings.',
  );
  need(item.title.trim(), 'Describe the commitment.');
  need(
    item.measure?.trim() && item.unit?.trim(),
    'Enter the KPI / measurement and unit.',
  );
  need(item.definition?.trim(), 'Explain exactly how this measure is counted.');
  need(numeric(item.target), 'Enter a numerical target; zero is valid.');
  need(person(item.ownerId), 'Choose the responsible person from EMS.');
  need(
    validDate(item.endDate) &&
      item.endDate >= document.data.startDate &&
      item.endDate <= document.data.endDate,
    'Choose a due date within the planning period.',
  );
  need(
    ['HIGHER', 'LOWER', 'MAINTAIN_MIN', 'MAINTAIN_MAX'].includes(
      item.direction || '',
    ),
    'Choose whether a higher, lower or maintained value is required.',
  );
  if (document.kind !== 'INDIVIDUAL') {
    need(
      numeric(item.baseline),
      'Record the measured baseline before approval; an explanation is not a measured baseline.',
    );
    need(
      item.baselinePeriod?.trim(),
      'Identify the baseline measurement period.',
    );
  }
  if (item.unit === '%')
    for (const [label, value] of [
      ['Baseline', item.baseline],
      ['Target', item.target],
    ] as const)
      if (numeric(value))
        need(
          value >= 0 && value <= 100,
          `${label} percentage must be from 0 to 100.`,
        );
  if (numeric(item.target) && numeric(item.baseline)) {
    if (item.direction === 'HIGHER')
      need(
        item.target >= item.baseline,
        'A higher-is-better target must be at least the baseline.',
      );
    if (item.direction === 'LOWER')
      need(
        item.target <= item.baseline,
        'A lower-is-better target must not exceed the baseline.',
      );
  }
  if (kind === 'objective') {
    const o = item as Objective;
    need(o.result?.trim(), 'Write the measurable company result.');
    const alignments = objectiveAlignmentValues(o);
    need(
      alignments.length > 0 &&
        alignments.every((value) =>
          ['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'].includes(value),
        ),
      'Select one or more QCDSMT alignments or Business focus.',
    );
    if (alignments.includes('OTHER'))
      need(o.otherBusinessFocus?.trim(), 'Describe the Business focus.');
    need(o.dataSource?.trim(), 'Identify the source of the company measure.');
    need(
      o.reviewFrequency?.trim(),
      'Choose the company measurement review frequency.',
    );
    need(o.selectionReason?.trim(), 'Explain why this objective was selected.');
    need(
      o.approach?.trim(),
      'Explain how the company will achieve this result.',
    );
    need(
      o.guardrails?.trim(),
      'Describe quality, safety or other controls that must remain satisfactory.',
    );
    need(
      validObjectivePriority(o.priority),
      'Enter priority as a whole number from 1 to 10.',
    );
    need(
      validObjectiveWeightage(o.weightage, o.pillar),
      'Enter weightage within the selected pillar allocation.',
    );
    const allocation = objectiveAllocations(document.data.objectives).find(
      (a) => a.pillar === o.pillar,
    );
    need(
      allocation?.balanced,
      `${o.pillar || 'Selected pillar'}: objective weightages must total exactly ${allocation?.target || 'the pillar allocation'}%.`,
    );
    errors.push(
      ...sourceIssues(
        { ...o, sourceRationale: o.sourceRationale || o.selectionReason || '' },
        state,
      ),
    );
  } else {
    const g = item as Goal;
    if (document.kind === 'INDIVIDUAL')
      need(
        g.ownerId === document.scopeId,
        'The individual commitment belongs to the selected EMS employee.',
      );
    need(
      g.source?.trim(),
      'Identify the baseline / measurement source and checks.',
    );
    need(
      FREQUENCIES.includes(g.frequency as never),
      'Choose the measurement review frequency.',
    );
    need(g.parent, 'Choose an approved company objective or department goal.');
    if (g.parent) {
      errors.push(...parentReferenceIssues(document, g.parent, state));
      const resolved = resolveApprovedParent(state, g.parent);
      if (resolved)
        need(
          g.endDate <= resolved.goal.endDate &&
            g.endDate >= resolved.goal.startDate,
          'The contribution due date must stay within its approved parent period.',
        );
    }
    if (document.kind === 'DEPARTMENT') {
      need(
        Number.isSafeInteger(g.goalNo) && Number(g.goalNo) >= 1,
        'Save this contribution with its approved parent to generate its goal code.',
      );
      need(
        g.departmentCode,
        'Save this contribution to generate its department goal ID.',
      );
      need(
        !document.data.goals.some(
          (other) => other.id !== g.id && other.code === g.code,
        ),
        'This department goal ID already exists. Resolve the duplicate before approval.',
      );
    }
    errors.push(...assignmentReadinessIssues(document, state, refs, id));
  }
  return errors;
}

/** The workspace badges, submit checks and final approval share one validator. */
export function planningReadinessIssues(
  document: PlanningDocument,
  state: PlanningState,
  refs: PlanningReferences,
  today: string,
): string[] {
  const rows =
    document.kind === 'COMPANY'
      ? document.data.objectives
      : document.data.goals;
  const programme =
    ['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind) &&
    (document.planningModel === 'PROGRAMME' ||
      rows.some((row) => row.direction));
  if (!programme) return validatePlan(document, state, refs, today);
  const errors = planSetupIssues(document, state, refs);
  if (!rows.length) errors.push('Add at least one measurable commitment.');
  for (const row of rows)
    errors.push(
      ...programmeItemIssues(
        document,
        document.kind === 'COMPANY' ? 'objective' : 'goal',
        row.id,
        state,
        refs,
      ),
    );
  errors.push(...assignmentReadinessIssues(document, state, refs));
  return [...new Set(errors)];
}

/** Resolve only an immutable approved item. Draft data is never a result target. */
export function programmeCommitment(
  document: PlanningDocument,
  itemId: string,
  version: number,
) {
  const snapshot = document.versions.find((v) => v.version === version);
  if (!snapshot)
    throw new BadRequestException('Choose an approved commitment version.');
  if (snapshot.approvedItem && snapshot.approvedItem.itemId !== itemId)
    throw new BadRequestException(
      'Choose this commitment’s own approval version.',
    );
  const item =
    document.kind === 'COMPANY'
      ? snapshot.companyPlanningModel === 'MEASURABLE_OBJECTIVES' &&
        snapshot.data.objectives.find((i) => i.id === itemId)
      : snapshot.data.goals.find((i) => i.id === itemId);
  if (!item)
    throw new BadRequestException(
      'This commitment was not approved in that version.',
    );
  return { snapshot, item };
}
export function programmeTargetMet(actual: number, item: Objective | Goal) {
  if (typeof item.target !== 'number' || !Number.isFinite(item.target))
    return false;
  if (item.direction === 'LOWER' || item.direction === 'MAINTAIN_MAX')
    return actual <= item.target;
  if (item.direction === 'HIGHER' || item.direction === 'MAINTAIN_MIN')
    return actual >= item.target;
  return false;
}
export function recordProgrammeResult(
  document: PlanningDocument,
  state: PlanningState,
  payload: Record<string, unknown>,
  actor: PlanningActor,
  today = new Date().toISOString().slice(0, 10),
) {
  if (!['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind))
    throw new BadRequestException(
      'Choose a measurable company, department or individual commitment.',
    );
  if (!permissions({ ...document, status: 'DRAFT' }, actor).canEdit)
    throw new ForbiddenException(
      'Only an authorised planner or the responsible individual can record results.',
    );
  const itemId = cleanText(payload.itemId, 100),
    version = Number(payload.version);
  const { item, snapshot } = programmeCommitment(document, itemId, version);
  if (snapshot.effectiveDate > today)
    throw new BadRequestException(
      'This approved commitment is not effective yet.',
    );
  const periodStart = cleanText(payload.periodStart, 10),
    periodEnd = cleanText(payload.periodEnd, 10);
  if (
    !validDate(periodStart) ||
    !validDate(periodEnd) ||
    periodStart > periodEnd ||
    periodStart < document.data.startDate ||
    periodEnd > document.data.endDate
  )
    throw new BadRequestException(
      'Choose a measurement period within the planning period.',
    );
  if (
    (state.programmeResults || []).some(
      (r) =>
        r.documentId === document.id &&
        r.itemId === itemId &&
        r.periodStart <= periodEnd &&
        r.periodEnd >= periodStart &&
        r.status !== 'REJECTED',
    )
  )
    throw new ConflictException(
      'This commitment already has a measurement for that period.',
    );
  let actual = cleanNumber(payload.actual);
  const numerator = cleanNumber(payload.numerator),
    denominator = cleanNumber(payload.denominator);
  if (numerator !== null || denominator !== null) {
    if (
      item.unit !== '%' ||
      !Number.isInteger(numerator) ||
      !Number.isInteger(denominator) ||
      numerator === null ||
      denominator === null ||
      numerator < 0 ||
      denominator <= 0 ||
      numerator > denominator
    )
      throw new BadRequestException(
        'Percentage counts need a positive whole total and a qualifying count between zero and the total.',
      );
    actual = Math.round((numerator / denominator) * 10000) / 100;
  }
  if (actual === null || (item.unit === '%' && (actual < 0 || actual > 100)))
    throw new BadRequestException(
      'Enter a valid measured value; zero is valid and a blank value is not zero.',
    );
  const source = cleanText(payload.source),
    notes = cleanText(payload.notes);
  if (!source || !notes)
    throw new BadRequestException(
      'Identify the source and describe its evidence, scope and checks.',
    );
  const result: ProgrammeResult = {
    id: randomUUID(),
    documentId: document.id,
    itemId,
    itemKind: document.kind === 'COMPANY' ? 'OBJECTIVE' : 'GOAL',
    version,
    scope: document.kind as ProgrammeResult['scope'],
    periodStart,
    periodEnd,
    actual,
    numerator,
    denominator,
    source,
    notes,
    status: 'PENDING',
    recordedBy: actor.userId,
    recordedAt: new Date().toISOString(),
    verifiedBy: '',
    verifiedAt: '',
    verificationNote: '',
  };
  (state.programmeResults ||= []).push(result);
  return result.id;
}
export function verifyProgrammeResult(
  document: PlanningDocument,
  state: PlanningState,
  payload: Record<string, unknown>,
  actor: PlanningActor,
) {
  if (!permissions(document, actor).canApprove)
    throw new ForbiddenException(
      'Only the designated approver can verify the measurement.',
    );
  const result = state.programmeResults?.find(
    (r) => r.id === payload.id && r.documentId === document.id,
  );
  if (!result || result.status !== 'PENDING')
    throw new ConflictException('Select a measurement awaiting verification.');
  if (result.recordedBy === actor.userId)
    throw new ForbiddenException(
      'The recorder cannot verify their own measurement.',
    );
  const note = cleanText(payload.note);
  if (!['VERIFIED', 'REJECTED'].includes(String(payload.decision)) || !note)
    throw new BadRequestException(
      'Choose the verification decision and record the evidence checks.',
    );
  result.status = payload.decision as 'VERIFIED' | 'REJECTED';
  result.verificationNote = note;
  result.verifiedBy = actor.userId;
  result.verifiedAt = new Date().toISOString();
  return result.id;
}
export function reviewProgrammeResult(
  document: PlanningDocument,
  state: PlanningState,
  payload: Record<string, unknown>,
  actor: PlanningActor,
  today = new Date().toISOString().slice(0, 10),
) {
  if (document.kind !== 'COMPANY' || !permissions(document, actor).canApprove)
    throw new ForbiddenException(
      'Only the designated company approver can record this management review.',
    );
  const itemId = cleanText(payload.itemId, 100),
    version = Number(payload.version),
    { item, snapshot } = programmeCommitment(document, itemId, version);
  if (snapshot.effectiveDate > today)
    throw new BadRequestException(
      'This approved commitment is not effective yet.',
    );
  const decision = cleanText(payload.decision),
    note = cleanText(payload.note),
    nextReviewDate = cleanText(payload.nextReviewDate, 10);
  if (
    !['INVESTIGATE', 'SUSTAIN', 'REVISE'].includes(decision) ||
    !note ||
    !validDate(nextReviewDate)
  )
    throw new BadRequestException(
      'Enter the management decision, reason and next review date.',
    );
  const latest = (state.programmeResults || [])
    .filter(
      (r) =>
        r.documentId === document.id &&
        r.itemId === itemId &&
        r.version === version &&
        r.status === 'VERIFIED',
    )
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (
    decision === 'SUSTAIN' &&
    (!latest || !programmeTargetMet(latest.actual, item))
  )
    throw new BadRequestException(
      'Verify the company objective’s own result meeting its target before sustaining the method.',
    );
  const review = {
    id: randomUUID(),
    documentId: document.id,
    itemId,
    version,
    resultId: latest?.id || '',
    decision: decision as 'INVESTIGATE' | 'SUSTAIN' | 'REVISE',
    note,
    nextReviewDate,
    reviewedBy: actor.userId,
    reviewedAt: new Date().toISOString(),
  };
  (state.programmeReviews ||= []).push(review);
  return review.id;
}
