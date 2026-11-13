import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import {
  LEX_PILLARS,
  type StrategicDirectionProvider,
} from '../common/contracts';
import { StrategicDirectionService } from '../strategic-direction/strategic-direction.service';
import { OrganisationFrameworkService } from '../organisation-framework/organisation-framework.service';
import { PerformanceIntelligenceService } from '../performance-intelligence/performance-intelligence.service';
import { WorkScheduleService, holidayCalendar } from '../../work/work-schedule';
import { fromDbDate } from '../../work/work-date';
import { validatePlanningCalendar } from './planning-calendar';
import type {
  ApprovedPlanningLibraryProvider,
  OrganisationPlanningProvider,
} from './planning-dependency.contracts';
import type {
  PlanningActor,
  PlanningCalendar,
  PlanningReferences,
} from './planning.types';

@Injectable()
export class PlanningReferencesService {
  constructor(
    private readonly db: PrismaService,
    private readonly directionProvider: StrategicDirectionService,
    private readonly organisationProvider: OrganisationFrameworkService,
    private readonly libraryProvider: PerformanceIntelligenceService,
    private readonly schedules: WorkScheduleService,
  ) {}

  /** Reuse the approved Area 02 calendar, or the real Work/Leave calendar read-only. */
  async getCalendar(organizationId: string): Promise<PlanningCalendar> {
    const approved = await (
      this.organisationProvider as Partial<OrganisationPlanningProvider>
    ).getApprovedPlanningCalendar?.(organizationId);
    if (approved?.approved) {
      const calendar = { ...approved, source: 'AREA_02' as const };
      validatePlanningCalendar(calendar);
      return calendar;
    }
    const [organisation, schedule, rows] = await Promise.all([
      this.db.organization.findUnique({
        where: { id: organizationId },
        select: { timeZone: true },
      }),
      this.schedules.getSchedule(organizationId),
      this.db.workHoliday.findMany({
        where: { organizationId, isActive: true },
        select: { date: true, name: true },
        orderBy: { date: 'asc' },
      }),
    ]);
    const holidays = [
      ...holidayCalendar(
        rows.map((row) => ({ date: fromDbDate(row.date), name: row.name })),
        schedule.workingDays,
        schedule.observeOnNextWorkingDay,
      ).keys(),
    ].sort();
    const snapshot = {
      timeZone: organisation?.timeZone || 'UTC',
      workingDays: [...schedule.workingDays].sort(),
      holidays,
    };
    const calendar: PlanningCalendar = {
      id: `work-calendar:${organizationId}`,
      version: createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex')
        .slice(0, 16),
      source: 'WORK_SETTINGS',
      approved: false,
      ...snapshot,
      // No approved performance-cycle bounds exist until Area 02 publishes them.
      startDate: '',
      endDate: '',
      weekStart: 1,
      fortnightAnchor: '1970-01-05',
      twiceMonthlySplit: 15,
      submissionDueDays: 0,
    };
    validatePlanningCalendar(calendar);
    return calendar;
  }
  // Read-only EMS adapter: retain original IDs; never create department/person masters.
  async get(
    user: AccessTokenPayload,
  ): Promise<{ references: PlanningReferences; actor: PlanningActor }> {
    const [
      departments,
      employees,
      direction,
      calendar,
      positions,
      library,
      account,
    ] = await Promise.all([
      this.db.department.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.employee.findMany({
        where: {
          organizationId: user.organizationId,
          employmentStatus: 'ACTIVE',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          departmentId: true,
          section: true,
          updatedAt: true,
          userId: true,
          user: {
            select: {
              organizations: {
                where: { organizationId: user.organizationId },
                select: { role: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { firstName: 'asc' },
      }),
      // Area 01 publishes only its approved, locked company direction.
      (
        this.directionProvider as Partial<StrategicDirectionProvider>
      ).getApproved?.(user.organizationId) ?? Promise.resolve(null),
      this.getCalendar(user.organizationId),
      (
        this.organisationProvider as Partial<OrganisationPlanningProvider>
      ).getPlanningPositions?.(user.organizationId) ?? Promise.resolve(null),
      (
        this.libraryProvider as Partial<ApprovedPlanningLibraryProvider>
      ).getApprovedPlanningLibrary?.(user.organizationId) ??
        Promise.resolve(null),
      this.db.user.findUnique({
        where: { id: user.userId },
        select: { name: true },
      }),
    ]);
    const people = employees.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      position: p.jobTitle || 'Position not set',
      departmentId: p.departmentId,
      userId: p.userId,
      role: p.user?.organizations[0]?.role.name || 'EMPLOYEE',
    }));
    const teams: PlanningReferences['teams'] = [];
    for (const employee of employees)
      if (employee.departmentId && employee.section?.trim()) {
        const id = `${employee.departmentId}:${employee.section.trim()}`;
        let team = teams.find((t) => t.id === id);
        if (!team) {
          team = {
            id,
            name: employee.section.trim(),
            departmentId: employee.departmentId,
            memberIds: [],
          };
          teams.push(team);
        }
        team.memberIds.push(employee.id);
      }
    const me = people.find((p) => p.userId === user.userId);
    const approvedDirection = direction
      ? {
          version: direction.version,
          company: direction.company,
          purpose: direction.purpose,
          vision: direction.vision,
          mission: direction.mission,
          values: (direction.values || []).map(({ id, name, why }) => ({
            id,
            name,
            why,
          })),
        }
      : null;
    return {
      references: {
        departments,
        people,
        teams,
        pillars: [...LEX_PILLARS],
        direction: approvedDirection,
        positions: positions || [],
        timeZone: calendar.timeZone,
        calendar,
        source: 'EMS (departments and people); teams grouped from EMS sections',
        refreshedAt: new Date().toISOString(),
        sourceUpdatedAt: employees.length
          ? new Date(
              Math.max(
                ...employees.map((person) => person.updatedAt.getTime()),
              ),
            ).toISOString()
          : undefined,
        dependencyStatus: {
          direction: approvedDirection ? 'AVAILABLE' : 'UNAVAILABLE',
          calendar:
            calendar.source === 'AREA_02'
              ? 'APPROVED'
              : 'WORK_SETTINGS_FALLBACK',
          positions: positions ? 'AVAILABLE' : 'UNAVAILABLE',
          library: library ? 'AVAILABLE' : 'LOCAL_CATALOGUE',
        },
        ...(library ? { library } : {}),
      },
      actor: {
        userId: user.userId,
        employeeId: me?.id || '',
        departmentId: me?.departmentId || '',
        name: account?.name || me?.name || user.email || user.userId,
        role: user.roleLevel,
        positionIds: (positions || [])
          .filter((position) => position.holderIds.includes(me?.id || ''))
          .map((position) => position.id),
      },
    };
  }
}
