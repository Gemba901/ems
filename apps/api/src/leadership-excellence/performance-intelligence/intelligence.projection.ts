import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { aggregateResults } from '../execution/execution.rules';
import type {
  ExecutionAssignment,
  ExecutionGoal,
  ExecutionResult,
  ExecutionView,
} from '../execution/execution.types';
import { programmeResultPeriods } from '../performance-planning/planning.programme';
import {
  approvedPlanningItems,
  isManager,
  published,
} from '../performance-planning/planning.rules';
import type {
  Goal,
  Objective,
  Pillar,
  PlanningView,
  ProgrammeResult,
  TargetPeriod,
} from '../performance-planning/planning.types';
import type {
  IntelligenceCoverage,
  IntelligenceFilters,
  IntelligenceMeasure,
  IntelligencePeriod,
  IntelligenceView,
} from './intelligence.types';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const dateValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const keyFor = (documentId: string, itemId: string, version: number) =>
  `${documentId}/${itemId}/v${version}`;
const ordered = <T extends { start: string; end: string }>(rows: T[]) =>
  rows.sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );

export function normaliseIntelligenceFilters(
  filters: IntelligenceFilters,
  view: ExecutionView,
): IntelligenceView['filters'] {
  const clean = Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
  ) as IntelligenceFilters;
  for (const date of [clean.startDate, clean.endDate])
    if (date && !dateValid(date))
      throw new BadRequestException('Use a valid YYYY-MM-DD date.');
  if (clean.startDate && clean.endDate && clean.startDate > clean.endDate)
    throw new BadRequestException(
      'The start date must be on or before the end date.',
    );
  const manager = isManager(view.actor);
  const scope =
    clean.scope ||
    (manager
      ? 'ORGANIZATION'
      : view.actor.role === 'HOD'
        ? 'DEPARTMENT'
        : 'MY');
  if (scope === 'ORGANIZATION' && !manager)
    throw new ForbiddenException(
      'Organisation reporting is restricted to authorised leadership.',
    );
  if (scope === 'DEPARTMENT' && !manager && view.actor.role !== 'HOD')
    throw new ForbiddenException(
      'Department reporting is restricted to the department HOD.',
    );
  if (
    !manager &&
    scope === 'DEPARTMENT' &&
    clean.departmentId &&
    clean.departmentId !== view.actor.departmentId
  )
    throw new ForbiddenException('Choose your authorised department.');
  if (
    scope === 'MY' &&
    clean.personId &&
    clean.personId !== view.actor.employeeId
  )
    throw new ForbiddenException(
      'My performance only includes your own results.',
    );
  return { ...clean, scope };
}

/** The signed gap is always actual minus target; favourability carries direction. */
export function comparePerformance(
  actual: number | null,
  target: number | null,
  upper: number | null,
  direction: string,
): Pick<IntelligencePeriod, 'gap' | 'favourability'> {
  if (!finite(actual) || !finite(target))
    return { gap: null, favourability: 'UNKNOWN' };
  const gap = actual - target;
  if (direction === 'RANGE')
    return {
      gap,
      favourability: finite(upper)
        ? actual < target || actual > upper
          ? 'UNFAVOURABLE'
          : 'ON_TARGET'
        : 'UNKNOWN',
    };
  if (direction === 'ZERO')
    return { gap, favourability: actual === 0 ? 'ON_TARGET' : 'UNFAVOURABLE' };
  if (
    !['HIGHER', 'LOWER', 'MAINTAIN_MIN', 'MAINTAIN_MAX', 'MILESTONE'].includes(
      direction,
    )
  )
    return { gap, favourability: 'UNKNOWN' };
  if (gap === 0) return { gap, favourability: 'ON_TARGET' };
  const lower = ['LOWER', 'MAINTAIN_MAX'].includes(direction);
  return {
    gap,
    favourability: (lower ? gap < 0 : gap > 0) ? 'FAVOURABLE' : 'UNFAVOURABLE',
  };
}

function coverage(periods: IntelligencePeriod[]): IntelligenceCoverage {
  const scheduled = periods.filter((p) => p.scheduled);
  const verified = scheduled.filter((p) => p.officialActual !== null).length;
  return {
    scheduled: scheduled.length,
    due: scheduled.filter((p) => p.due).length,
    verified,
    submitted: scheduled.filter((p) => p.status === 'SUBMITTED').length,
    missing: scheduled.filter(
      (p) =>
        p.status === 'MISSING' ||
        ((p.status === 'DRAFT' || p.status === 'RETURNED') &&
          p.due &&
          p.officialActual === null),
    ).length,
    notDue: periods.filter((p) => p.status === 'NOT_DUE').length,
    notScheduled: periods.filter((p) => !p.scheduled).length,
    correctionPending: periods.filter((p) => p.correctionPending).length,
    partial: scheduled.length > verified || periods.some((p) => p.partial),
  };
}

function deadlinePassed(
  period: TargetPeriod,
  today: string,
  generatedAt: string,
  fallbackTimeZone: string,
): boolean {
  const dueDate = period.submissionDate || period.end;
  const timeZone = period.submissionTimeZone || fallbackTimeZone;
  if (!period.submissionTime) return dueDate < today;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(generatedAt));
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const localDate = `${part('year')}-${part('month')}-${part('day')}`;
    return (
      dueDate < localDate ||
      (dueDate === localDate &&
        `${part('hour')}:${part('minute')}` >= period.submissionTime)
    );
  } catch {
    // Invalid legacy timezone data must never mark an open same-day period missing.
    return dueDate < today;
  }
}

function basePeriod(
  period: TargetPeriod,
  today: string,
  generatedAt: string,
  timeZone: string,
): IntelligencePeriod {
  const due = deadlinePassed(period, today, generatedAt, timeZone);
  return {
    id: period.id,
    label: period.label,
    start: period.start,
    end: period.end,
    dueDate: period.submissionDate || period.end,
    due,
    submissionTime: period.submissionTime || null,
    submissionTimeZone:
      period.submissionTimeZone || (period.submissionTime ? timeZone : null),
    scheduled: period.scheduled !== false,
    partial: !!period.partial,
    sourceResultId: null,
    officialResultId: null,
    status:
      period.scheduled === false
        ? 'NOT_SCHEDULED'
        : due
          ? 'MISSING'
          : 'NOT_DUE',
    correctionPending: false,
    officialActual: null,
    provisionalActual: null,
    inputA: null,
    inputB: null,
    verifiedAt: null,
    target: period.target,
    upper: period.upper,
    gap: null,
    favourability: 'UNKNOWN',
  };
}

function finishMeasure(
  row: Omit<
    IntelligenceMeasure,
    | 'coverage'
    | 'trend'
    | 'officialActual'
    | 'comparableTarget'
    | 'comparableUpper'
    | 'gap'
    | 'favourability'
    | 'comparisonNote'
  >,
  today: string,
): IntelligenceMeasure {
  ordered(row.periods);
  const official = row.periods.filter(
    (p) => p.scheduled && p.officialActual !== null,
  );
  const definition = row.definition;
  const officialActual = definition
    ? aggregateResults(
        definition,
        official.map((p) => ({
          actual: p.officialActual,
          inputA: p.inputA,
          inputB: p.inputB,
        })),
      )
    : (official.at(-1)?.officialActual ?? null);
  let comparableTarget: number | null = null;
  let comparableUpper: number | null = null;
  let comparisonNote =
    'No verified observation is available for this selection.';
  if (official.length) {
    const closing =
      !definition || ['CLOSING', 'MILESTONE'].includes(definition.aggregation);
    const compared = closing ? official.slice(-1) : official;
    if (compared.every((p) => finite(p.target))) {
      if (closing) {
        comparableTarget = compared[0].target;
        comparableUpper = compared[0].upper;
      } else if (
        definition.aggregation === 'SUM' &&
        definition.formula === 'DIRECT'
      ) {
        comparableTarget = compared.reduce((sum, p) => sum + p.target!, 0);
        comparableUpper = compared.every((p) => finite(p.upper))
          ? compared.reduce((sum, p) => sum + p.upper!, 0)
          : null;
      } else {
        // A rate target with varying thresholds needs approved denominator weights.
        // Actual denominators must not silently redefine the approved target.
        if (compared.every((p) => p.target === compared[0].target))
          comparableTarget = compared[0].target;
        if (compared.every((p) => p.upper === compared[0].upper))
          comparableUpper = compared[0].upper;
      }
    }
    comparisonNote =
      comparableTarget === null
        ? 'These verified periods do not have one comparable approved target; inspect each period.'
        : closing
          ? 'Latest verified period compared with its own approved target.'
          : 'Verified periods only, compared with targets for those same periods.';
  }
  const counted = coverage(row.periods);
  if (counted.partial)
    comparisonNote +=
      ' Coverage is partial; missing or unverified periods are not zero.';
  return {
    ...row,
    officialActual,
    comparableTarget,
    comparableUpper,
    ...comparePerformance(
      officialActual,
      comparableTarget,
      comparableUpper,
      row.direction,
    ),
    comparisonNote,
    coverage: counted,
    trend: official.map((p) => ({
      periodId: p.id,
      start: p.start,
      end: p.end,
      actual: p.officialActual!,
      target: p.target,
      verifiedAt: p.verifiedAt!,
      resultId: p.officialResultId!,
    })),
  };
}

/** Only authorised, already projected Area 03/04 inputs are accepted. No raw state is read. */
export function projectIntelligence(
  execution: ExecutionView,
  planning: PlanningView,
  input: IntelligenceFilters = {},
  generatedAt = new Date().toISOString(),
): IntelligenceView {
  const filters = normaliseIntelligenceFilters(input, execution);
  const manager = isManager(execution.actor);
  const { today } = execution;
  const timeZone = planning.references.timeZone || 'UTC';
  const canonicalPersonId = (id: string) =>
    execution.references.people.find((p) => p.id === id || p.userId === id)
      ?.id || id;
  const personName = (id: string) =>
    execution.references.people.find((p) => p.id === id || p.userId === id)
      ?.name || '';
  const departmentName = (id: string) =>
    execution.references.departments.find((d) => d.id === id)?.name || '';
  const personFilter =
    filters.scope === 'MY'
      ? execution.actor.employeeId || execution.actor.userId
      : filters.personId;
  const departmentFilter =
    filters.departmentId ||
    (filters.scope === 'DEPARTMENT' ? execution.actor.departmentId : undefined);
  const goals = new Map(execution.goals.map((g) => [g.key, g]));
  type Context = { pillar: Pillar | ''; alignments: string[] };
  const lineage = new Map<
    string,
    { meta: Context | null; parentKey: string | null }
  >();
  const rememberContext = (
    key: string,
    item: Goal | Objective,
    parentKey: string | null,
  ) => {
    lineage.set(key, {
      meta:
        'pillar' in item
          ? {
              pillar: item.pillar,
              alignments: item.alignments?.length
                ? item.alignments
                : item.alignment
                  ? [item.alignment]
                  : [],
            }
          : null,
      parentKey,
    });
  };
  // Area 03 authorises approved company definitions even when Area 04 returns
  // only a minimal parent label. Retain just approved lineage classification.
  for (const document of planning.documents) {
    if (!document.permissions.canRead || document.kind === 'SWOT') continue;
    for (const snapshot of document.versions.filter(
      (s) => s.effectiveDate <= today,
    )) {
      for (const row of approvedPlanningItems(document, snapshot)) {
        const item: Goal | Objective =
          row.itemKind === 'OBJECTIVE'
            ? snapshot.data.objectives.find((o) => o.id === row.goal.id)!
            : row.goal;
        const parent = 'parent' in item ? item.parent : null;
        rememberContext(
          keyFor(document.id, item.id, snapshot.version),
          item,
          parent
            ? keyFor(parent.documentId, parent.goalId, parent.version)
            : null,
        );
      }
    }
  }
  for (const goal of execution.goals)
    rememberContext(goal.key, goal.item, goal.parentKey);
  const within = (start: string, end: string) =>
    (!filters.startDate || start >= filters.startDate) &&
    (!filters.endDate || end <= filters.endDate);
  const context = (goal: ExecutionGoal | string | undefined): Context => {
    let key = typeof goal === 'string' ? goal : goal?.key;
    const visited = new Set<string>();
    while (key && !visited.has(key)) {
      visited.add(key);
      const row = lineage.get(key);
      if (row?.meta) return row.meta;
      key = row?.parentKey || undefined;
    }
    return { pillar: '', alignments: [] };
  };
  const selectedContext = (
    cycle: string,
    departmentId: string,
    people: string[],
    meta: ReturnType<typeof context>,
    search: string,
  ) =>
    (!filters.cycle || filters.cycle === cycle) &&
    (!departmentFilter || departmentId === departmentFilter) &&
    (!personFilter ||
      people.some(
        (id) =>
          !!id && canonicalPersonId(id) === canonicalPersonId(personFilter),
      )) &&
    (!filters.pillar || meta.pillar === filters.pillar) &&
    (!filters.alignment || meta.alignments.includes(filters.alignment)) &&
    (!filters.search ||
      search.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase()));

  const kpis: IntelligenceMeasure[] = [];
  const eligibleAssignments: ExecutionAssignment[] = [];
  for (const assignment of execution.assignments) {
    if (assignment.effectiveDate > today) continue;
    const goal = goals.get(assignment.goalKey);
    const meta = context(goal);
    const own = [
      assignment.assignment.providerId,
      assignment.assignment.ownerId || '',
      goal?.item.ownerId || '',
      goal?.kind === 'INDIVIDUAL' ? goal.scopeId : '',
    ];
    // Options only reveal people represented by this authorised report scope.
    if (
      filters.scope === 'MY' &&
      (!execution.actor.employeeId || !own.includes(execution.actor.employeeId))
    )
      continue;
    if (
      !manager &&
      filters.scope === 'DEPARTMENT' &&
      assignment.departmentId !== execution.actor.departmentId
    )
      continue;
    eligibleAssignments.push(assignment);
    if (
      !selectedContext(
        assignment.cycle,
        assignment.departmentId,
        own,
        meta,
        `${assignment.definition.name} ${assignment.goalTitle} ${assignment.assignment.code}`,
      )
    )
      continue;
    const results = execution.results.filter(
      (r) => r.assignmentKey === assignment.key,
    );
    const entries = new Set(assignment.entryPeriodIds);
    const periods: IntelligencePeriod[] = [];
    for (const target of assignment.periods) {
      const matching = results
        .filter(
          (r) =>
            r.periodId === target.id &&
            (!r.periodStart || r.periodStart === target.start) &&
            (!r.periodEnd || r.periodEnd === target.end),
        )
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      const result = matching.at(-1);
      if (
        !entries.has(target.id) &&
        !result &&
        !(assignment.current && target.scheduled === false)
      )
        continue;
      if (!within(target.start, target.end)) continue;
      const period = basePeriod(target, today, generatedAt, timeZone);
      if (result && period.scheduled)
        applyResult(period, result, assignment.definition.direction);
      periods.push(period);
    }
    // A stored observation keeps its original period even after historical calendar repairs.
    for (const result of results) {
      const calendarPeriod = assignment.periods.find(
        (p) => p.id === result.periodId,
      );
      const start = result.periodStart || calendarPeriod?.start;
      const end = result.periodEnd || calendarPeriod?.end;
      if (
        !start ||
        !end ||
        periods.some((p) => p.sourceResultId === result.id) ||
        !within(start, end)
      )
        continue;
      if (
        assignment.periods.some(
          (p) =>
            p.id === result.periodId &&
            p.start === start &&
            p.end === end &&
            p.scheduled !== false,
        )
      )
        continue;
      const historical = basePeriod(
        {
          id: `${result.periodId}/historical/${result.id}/${start}/${end}`,
          label: `${start} – ${end} (historical observation)`,
          start,
          end,
          target: null,
          upper: null,
          partial: true,
        },
        today,
        generatedAt,
        timeZone,
      );
      applyResult(historical, result, assignment.definition.direction);
      periods.push(historical);
    }
    if (!periods.length && (filters.startDate || filters.endDate)) continue;
    const ownerId =
      assignment.assignment.ownerId || assignment.assignment.providerId;
    kpis.push(
      finishMeasure(
        {
          key: assignment.key,
          source: 'AREA_04_KPI',
          documentId: assignment.documentId,
          itemId: assignment.assignment.goalId,
          assignmentId: assignment.assignment.id,
          version: assignment.version,
          current: assignment.current,
          effectiveDate: assignment.effectiveDate,
          cycle: assignment.cycle,
          scope: assignment.scope,
          departmentId: assignment.departmentId,
          departmentName: departmentName(assignment.departmentId),
          personId: ownerId,
          personName: personName(ownerId),
          goalKey: assignment.goalKey,
          goalTitle: assignment.goalTitle,
          code: assignment.assignment.code,
          name: assignment.definition.name,
          ...meta,
          unit: assignment.definition.unit,
          direction: assignment.definition.direction,
          aggregation: assignment.definition.aggregation,
          definition: structuredClone(assignment.definition),
          measurementDefinition: assignment.definition.meaning,
          measurementSource: assignment.assignment.source,
          periods,
          sourceHref: `/leadership-excellence/execution/results-entry?cycle=${encodeURIComponent(assignment.cycle)}&scope=${filters.scope === 'MY' ? 'personal' : 'department'}&assignment=${encodeURIComponent(assignment.key)}`,
        },
        today,
      ),
    );
  }

  const measuredResults: IntelligenceMeasure[] = [];
  const measuredOptions: {
    cycle: string;
    departmentId: string;
    personId: string;
  }[] = [];
  for (const document of planning.documents) {
    if (
      !document.permissions.canRead ||
      !['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind)
    )
      continue;
    const current = published(document, today);
    if (!current) continue;
    for (const snapshot of document.versions.filter(
      (s) => s.effectiveDate <= today,
    )) {
      for (const approved of approvedPlanningItems(document, snapshot)) {
        if (
          document.kind === 'COMPANY' &&
          snapshot.companyPlanningModel !== 'MEASURABLE_OBJECTIVES'
        )
          continue;
        const item: Objective | Goal =
          document.kind === 'COMPANY'
            ? snapshot.data.objectives.find((o) => o.id === approved.goal.id)!
            : approved.goal;
        // Legacy planning goals without a measured-result schedule remain KPI context.
        if (
          !(document.kind === 'COMPANY'
            ? (item as Objective).reviewFrequency
            : (item as Goal).frequency)
        )
          continue;
        const key = keyFor(document.id, item.id, snapshot.version);
        const own = [
          item.ownerId,
          document.kind === 'INDIVIDUAL' ? document.scopeId : '',
        ];
        if (
          filters.scope === 'MY' &&
          (!execution.actor.employeeId ||
            !own.includes(execution.actor.employeeId))
        )
          continue;
        if (
          !manager &&
          filters.scope === 'DEPARTMENT' &&
          document.departmentId !== execution.actor.departmentId
        )
          continue;
        const meta =
          'pillar' in item
            ? {
                pillar: item.pillar,
                alignments: item.alignments?.length
                  ? item.alignments
                  : item.alignment
                    ? [item.alignment]
                    : [],
              }
            : context(key);
        measuredOptions.push({
          cycle: document.cycle,
          departmentId: document.departmentId,
          personId: item.ownerId,
        });
        if (
          !selectedContext(
            document.cycle,
            document.departmentId,
            own,
            meta,
            `${item.title} ${item.code} ${item.measure}`,
          )
        )
          continue;
        const records = (planning.programmeResults || []).filter(
          (r) =>
            r.documentId === document.id &&
            r.itemId === item.id &&
            r.version === snapshot.version &&
            r.itemKind === (document.kind === 'COMPANY' ? 'OBJECTIVE' : 'GOAL'),
        );
        const periods = programmeResultPeriods(
          document,
          item.id,
          snapshot.version,
        )
          .filter((p) => within(p.start, p.end))
          .map((p) => {
            const period = basePeriod(p, today, generatedAt, timeZone);
            if (!period.scheduled) return period;
            applyProgrammeResults(
              period,
              records.filter(
                (r) => r.periodStart === p.start && r.periodEnd === p.end,
              ),
              item.direction || '',
            );
            return period;
          });
        // Historical observations retain their own exact dates even when a later
        // approval splits an older schedule. Do not invent a comparable target.
        for (const record of records) {
          if (
            !within(record.periodStart, record.periodEnd) ||
            periods.some(
              (p) =>
                p.start === record.periodStart && p.end === record.periodEnd,
            )
          )
            continue;
          const historical = basePeriod(
            {
              id: `${record.periodStart}/${record.periodEnd}`,
              label: `${record.periodStart} – ${record.periodEnd}`,
              start: record.periodStart,
              end: record.periodEnd,
              target: null,
              upper: null,
              partial: true,
            },
            today,
            generatedAt,
            timeZone,
          );
          applyProgrammeResults(
            historical,
            records.filter(
              (r) =>
                r.periodStart === record.periodStart &&
                r.periodEnd === record.periodEnd,
            ),
            item.direction || '',
          );
          periods.push(historical);
        }
        if (!periods.length) continue;
        measuredResults.push(
          finishMeasure(
            {
              key,
              source: 'AREA_03_MEASURED_RESULT',
              documentId: document.id,
              itemId: item.id,
              assignmentId: null,
              version: snapshot.version,
              current:
                (current.itemVersions?.[item.id] ?? current.version) ===
                snapshot.version,
              effectiveDate: snapshot.effectiveDate,
              cycle: document.cycle,
              scope: document.kind,
              departmentId: document.departmentId,
              departmentName: departmentName(document.departmentId),
              personId: item.ownerId,
              personName: personName(item.ownerId),
              goalKey: key,
              goalTitle: item.title,
              code: item.code,
              name: item.measure || item.title,
              ...meta,
              unit: item.unit || '',
              direction: item.direction || '',
              aggregation: 'LATEST_VERIFIED_PERIOD',
              definition: null,
              measurementDefinition: item.definition || '',
              measurementSource:
                'dataSource' in item
                  ? item.dataSource || ''
                  : (item as Goal).source || '',
              periods,
              sourceHref: `/leadership-excellence/performance-planning/results?document=${encodeURIComponent(document.id)}&item=${encodeURIComponent(item.id)}`,
            },
            today,
          ),
        );
      }
    }
  }

  const actions = execution.actions
    .filter((row) => {
      const goal = goals.get(row.goalKey);
      return (
        selectedContext(
          row.cycle,
          row.departmentId,
          [row.action.ownerId],
          context(goal),
          `${row.action.title} ${row.goalTitle}`,
        ) && within(row.action.dueDate, row.action.dueDate)
      );
    })
    .map((row) => {
      const update = execution.actionUpdates.find(
        (u) => u.actionKey === row.key,
      );
      const status = update?.status || 'NOT_STARTED';
      return {
        key: row.key,
        documentId: row.documentId,
        goalKey: row.goalKey,
        goalTitle: row.goalTitle,
        title: row.action.title,
        ownerId: row.action.ownerId,
        ownerName: personName(row.action.ownerId),
        dueDate: row.action.dueDate,
        status,
        progress: update?.progress ?? 0,
        overdue:
          !!row.action.dueDate &&
          row.action.dueDate < today &&
          status !== 'COMPLETED',
        sourceHref: `/leadership-excellence/execution/delivery-actions?cycle=${encodeURIComponent(row.cycle)}&scope=${filters.scope === 'MY' ? 'personal' : 'department'}&action=${encodeURIComponent(row.key)}`,
      };
    });
  const support = execution.supportRequests
    .filter((row) => {
      const goal = goals.get(row.goalKey);
      // Requests visible only to a recipient still have no authority to reveal goal details.
      if (!goal && (departmentFilter || filters.pillar || filters.alignment))
        return false;
      return (
        selectedContext(
          row.cycle || goal?.cycle || '',
          goal?.departmentId || '',
          [row.requestorId, row.assignedToId],
          context(goal),
          `${row.title} ${goal?.item.title || row.goalTitle || ''}`,
        ) && within(row.dueDate, row.dueDate)
      );
    })
    .map((row) => ({
      id: row.id,
      goalKey: row.goalKey,
      goalTitle: goals.get(row.goalKey)?.item.title || row.goalTitle || '',
      title: row.title,
      assignedToId: row.assignedToId,
      assignedToName: personName(row.assignedToId),
      dueDate: row.dueDate,
      status: row.status,
      acknowledgedAt: row.acknowledgement?.at || null,
      overdue:
        !!row.dueDate &&
        row.dueDate < today &&
        !['RESOLVED', 'CLOSED'].includes(row.status),
      sourceHref: `/leadership-excellence/execution/support-requests?request=${encodeURIComponent(row.id)}`,
    }));
  const measures = [...kpis, ...measuredResults];
  const peopleIds = new Set([
    ...eligibleAssignments.flatMap((a) => [
      a.assignment.ownerId,
      a.assignment.providerId,
    ]),
    ...measuredOptions.map((m) => m.personId),
    ...actions.map((a) => a.ownerId),
    ...support.map((s) => s.assignedToId),
  ]);
  const departmentIds = new Set([
    ...eligibleAssignments.map((a) => a.departmentId),
    ...measuredOptions.map((m) => m.departmentId),
  ]);
  const open = support.filter(
    (s) => !['RESOLVED', 'CLOSED'].includes(s.status),
  );
  return {
    generatedAt,
    today,
    revisions: {
      planning: execution.planningRevision,
      execution: execution.revision,
    },
    filters,
    access: {
      scopeLabel:
        filters.scope === 'MY'
          ? 'My performance'
          : filters.scope === 'DEPARTMENT'
            ? 'Authorised department'
            : 'Authorised organisation',
      canViewDepartment: manager || execution.actor.role === 'HOD',
      canViewOrganization: manager,
    },
    options: {
      cycles: [
        ...new Set([
          ...eligibleAssignments.map((a) => a.cycle),
          ...measuredOptions.map((m) => m.cycle),
        ]),
      ].sort(),
      departments: execution.references.departments.filter((d) =>
        departmentIds.has(d.id),
      ),
      people: execution.references.people
        .filter(
          (p) =>
            peopleIds.has(p.id) &&
            (filters.scope !== 'MY' || p.id === execution.actor.employeeId),
        )
        .map(({ id, name, departmentId }) => ({ id, name, departmentId })),
      pillars: planning.references.pillars,
      alignments: ['Q', 'C', 'D', 'S', 'M', 'T', 'OTHER'],
    },
    summary: {
      kpis: kpis.length,
      companyMeasures: measuredResults.filter((m) => m.scope === 'COMPANY')
        .length,
      departmentMeasures: measuredResults.filter(
        (m) => m.scope === 'DEPARTMENT',
      ).length,
      individualMeasures: measuredResults.filter(
        (m) => m.scope === 'INDIVIDUAL',
      ).length,
      verifiedPeriods: measures.reduce(
        (sum, m) => sum + m.coverage.verified,
        0,
      ),
      submittedPeriods: measures.reduce(
        (sum, m) => sum + m.coverage.submitted,
        0,
      ),
      missingPeriods: measures.reduce((sum, m) => sum + m.coverage.missing, 0),
      correctionPending: measures.reduce(
        (sum, m) => sum + m.coverage.correctionPending,
        0,
      ),
      atOrAboveTarget: measures.filter((m) =>
        ['FAVOURABLE', 'ON_TARGET'].includes(m.favourability),
      ).length,
      belowTarget: measures.filter((m) => m.favourability === 'UNFAVOURABLE')
        .length,
      incomparable: measures.filter((m) => m.favourability === 'UNKNOWN')
        .length,
      actions: actions.length,
      overdueActions: actions.filter((a) => a.overdue).length,
      openSupport: open.length,
      unacknowledgedSupport: open.filter((s) => !s.acknowledgedAt).length,
      overallScore: null,
    },
    kpis,
    measuredResults,
    actions,
    support,
    notes: [
      'Official values use verified source observations. Drafts, submissions and returned corrections remain separate; missing values are never zero.',
      'Date filters include complete measurement periods within the selected dates; action and support filters use their due dates.',
      'Each measure retains its approved version, unit, goal and definition. No overall score or average of unrelated KPIs is calculated.',
      'Company and department measured results use their own Area 03 observations, independently of employee KPI progress and action completion.',
      'Trend points follow observation dates, with verification timestamps retained. Periods without verified observations are omitted from the trend.',
    ],
  };
}

function applyResult(
  period: IntelligencePeriod,
  result: ExecutionResult,
  direction: string,
) {
  period.sourceResultId = result.id;
  period.status = result.status;
  period.provisionalActual =
    result.status !== 'VERIFIED' && finite(result.actual)
      ? result.actual
      : null;
  if (
    result.official &&
    finite(result.official.actual) &&
    result.official.verifiedAt
  ) {
    period.officialActual = result.official.actual;
    period.officialResultId = result.id;
    period.inputA = result.official.inputA;
    period.inputB = result.official.inputB;
    period.verifiedAt = result.official.verifiedAt;
    period.correctionPending = result.status !== 'VERIFIED';
    Object.assign(
      period,
      comparePerformance(
        period.officialActual,
        period.target,
        period.upper,
        direction,
      ),
    );
  }
}

function applyProgrammeResults(
  period: IntelligencePeriod,
  records: ProgrammeResult[],
  direction: string,
) {
  const latest = [...records]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .at(-1);
  const official = records
    .filter(
      (r) => r.status === 'VERIFIED' && finite(r.actual) && !!r.verifiedAt,
    )
    .sort((a, b) => a.verifiedAt.localeCompare(b.verifiedAt))
    .at(-1);
  if (latest) {
    period.sourceResultId = latest.id;
    period.status =
      latest.status === 'VERIFIED'
        ? 'VERIFIED'
        : latest.status === 'PENDING'
          ? 'SUBMITTED'
          : 'RETURNED';
    period.provisionalActual =
      latest.status !== 'VERIFIED' && finite(latest.actual)
        ? latest.actual
        : null;
  }
  if (official) {
    period.officialResultId = official.id;
    period.officialActual = official.actual;
    period.inputA = official.numerator;
    period.inputB = official.denominator;
    period.verifiedAt = official.verifiedAt;
    period.correctionPending =
      !!latest && latest.id !== official.id && latest.status !== 'VERIFIED';
    Object.assign(
      period,
      comparePerformance(
        official.actual,
        period.target,
        period.upper,
        direction,
      ),
    );
  }
}
