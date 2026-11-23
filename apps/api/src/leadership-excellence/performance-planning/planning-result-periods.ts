import { BadRequestException, NotFoundException } from '@nestjs/common';
import { programmeResultPeriods } from './planning.programme';
import type { Goal, Objective, PlanningDocument } from './planning.types';

/** The same server calendar and version boundaries used when saving results. */
export function resultSchedules(
  document: PlanningDocument,
  itemId: string,
  timeZone = 'UTC',
  today?: string,
) {
  if (!['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'].includes(document.kind))
    throw new BadRequestException('Choose an approved measurable commitment.');
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) =>
    dateParts.find((item) => item.type === type)!.value;
  const currentDate =
    today || `${part('year')}-${part('month')}-${part('day')}`;
  const schedules = [...document.versions]
    .sort((a, b) => a.version - b.version)
    .flatMap((snapshot) => {
      if (
        snapshot.effectiveDate > currentDate ||
        (snapshot.approvedItem && snapshot.approvedItem.itemId !== itemId) ||
        (snapshot.itemVersions?.[itemId] &&
          snapshot.itemVersions[itemId] !== snapshot.version)
      )
        return [];
      const rows =
        document.kind === 'COMPANY'
          ? snapshot.companyPlanningModel === 'MEASURABLE_OBJECTIVES'
            ? snapshot.data.objectives
            : []
          : snapshot.data.goals;
      const item = rows.find((entry) => entry.id === itemId);
      if (!item) return [];
      return [
        {
          version: snapshot.version,
          effectiveDate: snapshot.effectiveDate,
          frequency:
            (document.kind === 'COMPANY'
              ? (item as Objective).reviewFrequency
              : (item as Goal).frequency) || '',
          target: item.target ?? null,
          unit: item.unit || '',
          calendarSource: snapshot.calendar?.source || 'LEGACY',
          calendarVersion: snapshot.calendar?.version ?? null,
          periods: programmeResultPeriods(
            document,
            itemId,
            snapshot.version,
          ).map((period) => ({
            ...period,
            canRecord: period.scheduled !== false && period.end <= currentDate,
          })),
        },
      ];
    });
  if (!schedules.length)
    throw new NotFoundException(
      'No effective approved version is available for this commitment.',
    );
  return schedules;
}
