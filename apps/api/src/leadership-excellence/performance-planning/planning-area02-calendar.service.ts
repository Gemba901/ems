import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { RulesCalendarService } from '../organisation-framework/rules-calendar/rules-calendar.service';
import {
  CALENDAR_FREQUENCIES,
  type ApprovedPerformanceCalendar,
  type CalendarFrequency as Area02Frequency,
  type PerformanceCalendarProvider,
} from '../common/contracts';
import type {
  ApprovedPlanningCalendarProvider,
  PlanningCalendarContext,
  PlanningCalendarSelection,
  PlanningResponsibilityDefaults,
} from './planning-dependency.contracts';
import type {
  Frequency,
  PlanningCalendar,
  PlanningPerson,
} from './planning.types';
import { validatePlanningCalendar } from './planning-calendar';
import {
  PLANNING_PEOPLE_SOURCE,
  type PlanningPeopleSource,
} from './planning-people.contracts';

const FREQUENCY: Record<Area02Frequency, Frequency> = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  fortnightly: 'FORTNIGHTLY',
  'twice-monthly': 'TWICE_MONTHLY',
  monthly: 'MONTHLY',
  'every-two-months': 'EVERY_TWO_MONTHS',
  custom: 'CUSTOM',
  quarterly: 'QUARTERLY',
  'half-yearly': 'HALF_YEARLY',
  yearly: 'YEARLY',
};
const validDate = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const nextDate = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

/** Preserve approved materialised periods. Recalculating Area 02 rules would change history. */
export function planningCalendarFromArea02(
  source: ApprovedPerformanceCalendar,
): PlanningCalendar {
  const { rules } = source;
  const calendar: PlanningCalendar = {
    id: source.calendarId,
    name: rules.name,
    version: source.version,
    source: 'AREA_02',
    approved: true,
    frequencies: (
      rules.enabledFrequencies ??
      CALENDAR_FREQUENCIES.filter(
        (frequency) =>
          frequency !== 'custom' && frequency !== 'every-two-months',
      )
    ).map((frequency) => FREQUENCY[frequency]),
    timeZone: rules.timeZone,
    startDate: rules.start,
    endDate: rules.end,
    workingDays: rules.workdays,
    holidays: rules.exceptions
      .filter((date) => date.kind === 'NON_WORKING')
      .map((date) => date.date),
    weekStart: rules.weekStart,
    fortnightAnchor: rules.fortnightAnchor,
    twiceMonthlySplit: rules.splitDay,
    submissionDueDays: rules.submissionDays,
    area02: {
      audience: rules.audience ?? {
        kind: 'UNASSIGNED',
        label: '',
        departmentIds: [],
        employeeIds: [],
      },
      periods: Object.fromEntries(
        Object.entries(source.periods).map(([frequency, periods]) => [
          FREQUENCY[frequency as Area02Frequency],
          periods,
        ]),
      ),
      reviews: source.reviews,
      responsibilities: rules.responsibilities,
      reviewFrequency: FREQUENCY[rules.reviewFrequency],
      exceptions: rules.exceptions,
      approvedAt: source.approvedAt,
      approvedByUserId: source.approvedByUserId,
    },
  };
  validatePlanningCalendar(calendar);
  return structuredClone(calendar);
}

/** Consume Area 02's shared contract; calendar storage and assignment rules stay with its owner. */
@Injectable()
export class PlanningArea02CalendarService implements ApprovedPlanningCalendarProvider {
  constructor(
    @Inject(PLANNING_PEOPLE_SOURCE)
    private readonly peopleSource: Pick<
      PlanningPeopleSource,
      'findEligibleEmployee' | 'departmentExists'
    >,
    @Inject(RulesCalendarService)
    private readonly calendars: PerformanceCalendarProvider,
  ) {}

  async listApproved(organizationId: string): Promise<PlanningCalendar[]> {
    // Summaries contain approved identities, not draft metadata. Load each exact
    // publication for its audience membership, periods and immutable deadlines.
    const rows = await this.calendars.listApproved(organizationId);
    const result: PlanningCalendar[] = [];
    for (const row of rows) {
      const approved = await this.calendars.getApproved(
        organizationId,
        row.calendarId,
        row.version,
      );
      if (!approved)
        throw new ConflictException(
          'An approved Area 02 calendar version is missing. Restore it before selecting a reporting calendar.',
        );
      if (
        approved.organizationId !== organizationId ||
        approved.calendarId !== row.calendarId ||
        approved.version !== row.version
      )
        throw new ConflictException(
          'The approved calendar does not match the requested company and version.',
        );
      result.push(planningCalendarFromArea02(approved));
    }
    return result.sort(
      (a, b) =>
        (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id),
    );
  }

  async resolve(
    organizationId: string,
    input: PlanningCalendarContext,
    selection?: PlanningCalendarSelection,
    available?: PlanningCalendar[],
  ): Promise<PlanningCalendar | null> {
    if (
      !validDate(input.startDate) ||
      !validDate(input.endDate) ||
      input.startDate > input.endDate
    ) {
      if (selection)
        throw new BadRequestException(
          'Choose valid plan dates before selecting an Area 02 calendar.',
        );
      return null;
    }
    const context = await this.context(organizationId, input);
    if (selection) {
      if (
        typeof selection.id !== 'string' ||
        !selection.id.trim() ||
        !Number.isSafeInteger(selection.version) ||
        selection.version < 1
      )
        throw new BadRequestException(
          'Choose an approved calendar and its exact published version.',
        );
      const approved = await this.calendars.getApproved(
        organizationId,
        selection.id,
        selection.version,
      );
      if (!approved)
        throw new BadRequestException(
          'The selected approved Area 02 calendar version is unavailable. Choose an available version explicitly.',
        );
      if (
        approved.organizationId !== organizationId ||
        approved.calendarId !== selection.id ||
        approved.version !== selection.version
      )
        throw new ConflictException(
          'The approved calendar does not match the requested company and version.',
        );
      const calendar = planningCalendarFromArea02(approved);
      if (
        !priority(calendar, context) ||
        calendar.startDate > input.startDate ||
        calendar.endDate < input.endDate
      )
        throw new BadRequestException(
          'The selected Area 02 calendar does not cover this plan audience and date range.',
        );
      return calendar;
    }
    const published = available ?? (await this.listApproved(organizationId));
    const candidates = published.filter(
      (calendar) =>
        priority(calendar, context) &&
        calendar.startDate <= input.endDate! &&
        calendar.endDate >= input.startDate!,
    );
    let assigned: PlanningCalendar | undefined;
    const boundaries = new Set([input.startDate, input.endDate]);
    for (const candidate of candidates) {
      if (
        candidate.startDate > input.startDate &&
        candidate.startDate <= input.endDate
      )
        boundaries.add(candidate.startDate);
      if (
        candidate.endDate >= input.startDate &&
        candidate.endDate < input.endDate
      )
        boundaries.add(nextDate(candidate.endDate));
    }
    for (const date of [...boundaries].sort()) {
      const active = candidates.filter(
        (calendar) => calendar.startDate <= date && calendar.endDate >= date,
      );
      // Check every assignment boundary through the owning service, including
      // temporary mid-plan overrides. Explicit saved versions bypass this path.
      const assignment =
        context.kind === 'INDIVIDUAL'
          ? await this.calendars.getCurrentAssignment(
              organizationId,
              context.employeeId!,
              date,
            )
          : !['COMPANY', 'SWOT'].includes(context.kind)
            ? await this.calendars.getDepartmentAssignment(
                organizationId,
                context.departmentId!,
                date,
              )
            : undefined;
      if (assignment?.status === 'CONFLICT')
        throw new ConflictException(
          `More than one approved Area 02 calendar applies: ${assignment.candidates.map((candidate) => candidate.name).join(', ')}. Choose an applicable calendar explicitly.`,
        );
      const matches = assignment
        ? assignment.status === 'ASSIGNED'
          ? active.filter(
              (calendar) =>
                calendar.id === assignment.calendarId &&
                calendar.version === assignment.version,
            )
          : []
        : active.filter(
            (calendar) => calendar.area02?.audience.kind === 'COMPANY',
          );
      if (assignment?.status === 'ASSIGNED' && !matches.length)
        throw new ConflictException(
          'The approved calendar assignment changed. Refresh the planning references before continuing.',
        );
      if (matches.length > 1)
        throw new ConflictException(
          'More than one approved Area 02 calendar covers this plan. Choose an applicable calendar explicitly.',
        );
      if (!matches.length) {
        if (!assigned && !candidates.length) return null;
        throw new ConflictException(
          'No single approved Area 02 calendar covers the full plan date range. Choose an applicable calendar or adjust the plan dates.',
        );
      }
      if (
        assigned &&
        (assigned.id !== matches[0].id ||
          assigned.version !== matches[0].version)
      )
        throw new ConflictException(
          'The assigned Area 02 calendar changes within this plan date range. Choose an applicable calendar or adjust the plan dates.',
        );
      assigned = matches[0];
    }
    return assigned ? structuredClone(assigned) : null;
  }

  async applicable(
    organizationId: string,
    input: PlanningCalendarContext,
    available: PlanningCalendar[],
  ): Promise<PlanningCalendar[]> {
    const context = await this.context(organizationId, input);
    return structuredClone(
      available.filter(
        (calendar) =>
          priority(calendar, context) &&
          (!validDate(input.startDate) ||
            calendar.startDate <= input.startDate) &&
          (!validDate(input.endDate) || calendar.endDate >= input.endDate),
      ),
    );
  }

  private async context(
    organizationId: string,
    input: PlanningCalendarContext,
  ): Promise<PlanningCalendarContext> {
    const context = { ...input };
    if (input.kind === 'INDIVIDUAL') {
      if (!input.employeeId)
        throw new BadRequestException(
          'Choose the employee for this calendar assignment.',
        );
      const employee = await this.peopleSource.findEligibleEmployee(
        organizationId,
        input.employeeId,
      );
      if (!employee)
        throw new BadRequestException(
          'Choose an eligible employee from this company.',
        );
      if (input.departmentId && input.departmentId !== employee.departmentId)
        throw new BadRequestException(
          'The employee department changed. Refresh their EMS details.',
        );
      context.departmentId = employee.departmentId || undefined;
    } else if (!['COMPANY', 'SWOT'].includes(input.kind)) {
      if (
        !input.departmentId ||
        !(await this.peopleSource.departmentExists(
          organizationId,
          input.departmentId,
        ))
      )
        throw new BadRequestException(
          'Choose an existing department from this company.',
        );
    }
    return context;
  }

  async responsibilityDefaults(
    organizationId: string,
    calendar: PlanningCalendar,
    context: PlanningCalendarContext,
    people: PlanningPerson[],
  ): Promise<PlanningResponsibilityDefaults> {
    const result: PlanningResponsibilityDefaults = { unresolved: [] };
    if (!calendar.area02) return result;
    const assigneeId = context.assigneeId || context.employeeId;
    const assignee = people.find((person) => person.id === assigneeId);
    const departmentId = assignee?.departmentId || context.departmentId;
    const employee = assignee
      ? await this.peopleSource.findEligibleEmployee(organizationId, assignee.id)
      : null;
    const authorised = (person: PlanningPerson) =>
      !!person.userId &&
      (['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT'].includes(person.role) ||
        (!['COMPANY', 'SWOT'].includes(context.kind) &&
          person.role === 'HOD' &&
          !!departmentId &&
          person.departmentId === departmentId));
    for (const slot of ['owner', 'provider', 'verifier', 'approver'] as const) {
      const responsibility = calendar.area02.responsibilities[slot];
      let candidates: PlanningPerson[] = [];
      if (responsibility === 'PLAN_OWNER')
        candidates = people.filter((person) => person.id === context.ownerId);
      if (responsibility === 'PLAN_ASSIGNEE')
        candidates = assignee ? [assignee] : [];
      if (responsibility === 'DEPARTMENT_HOD')
        candidates = people.filter(
          (person) =>
            !!departmentId &&
            person.departmentId === departmentId &&
            person.role === 'HOD' &&
            !!person.userId,
        );
      if (responsibility === 'LINE_MANAGER')
        candidates = people.filter(
          (person) =>
            person.id === employee?.reportingManagerId &&
            person.id !== assigneeId,
        );
      if (responsibility === 'AUTHORISED_APPROVER')
        candidates = people.filter(authorised);
      // EMS has no dedicated department-supervisor master. Never infer it from a job title.
      if (slot === 'approver') candidates = candidates.filter(authorised);
      if (candidates.length === 1) result[`${slot}Id`] = candidates[0].id;
      else result.unresolved.push(slot);
    }
    if (result.providerId && result.providerId === result.verifierId) {
      delete result.verifierId;
      if (!result.unresolved.includes('verifier'))
        result.unresolved.push('verifier');
    }
    return result;
  }
}

function priority(
  calendar: PlanningCalendar,
  context: PlanningCalendarContext,
): number {
  const audience = calendar.area02?.audience;
  if (audience?.kind === 'COMPANY') return 1;
  if (['COMPANY', 'SWOT'].includes(context.kind)) return 0;
  if (
    audience?.kind === 'DEPARTMENTS' &&
    context.departmentId &&
    audience.departmentIds.includes(context.departmentId)
  )
    return 2;
  if (
    context.kind === 'INDIVIDUAL' &&
    audience?.kind === 'PEOPLE' &&
    context.employeeId &&
    audience.employeeIds.includes(context.employeeId)
  )
    return 3;
  return 0;
}
