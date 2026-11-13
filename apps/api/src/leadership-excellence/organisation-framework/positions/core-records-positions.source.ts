import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { DetailTier, PersonDetails, PositionChart, PositionChartProvider } from './position-chart.contract';
import { buildPositionChart, tierOf } from './position-chart';

// Prisma's EmploymentStatus values (literal types, so Prisma accepts them in filters).
const ACTIVE: ('ACTIVE' | 'PROBATION')[] = ['ACTIVE', 'PROBATION'];
const nameOf = (p: { firstName: string; middleName?: string | null; lastName: string }) =>
  [p.firstName, p.middleName?.trim() || null, p.lastName].filter(Boolean).join(' ');
const text = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || null;

/**
 * TEMPORARY source for 02.02 until EMS keeps position records and its service is on this branch.
 *
 * Reads the shared core records (organisation, departments, employees, company memberships), read-only and for the
 * current company only. Positions are worked out from job titles and reporting lines. Person details are limited to
 * the viewer's tier, and personal or sensitive fields are never read. When EMS's service is connected, the module binds
 * POSITION_CHART_SOURCE to it instead and this file is deleted; the page and the contract don't change.
 */
@Injectable()
export class CoreRecordsPositionsSource implements PositionChartProvider {
  constructor(private readonly db: PrismaService) {}

  async getPositions(organizationId: string): Promise<PositionChart> {
    const [organization, departments, employees] = await this.db.$transaction([
      this.db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true } }),
      this.db.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      this.db.employee.findMany({
        where: { organizationId },
        select: { id: true, firstName: true, middleName: true, lastName: true, jobTitle: true, departmentId: true,
          plantBranch: true, employmentStatus: true, reportingManagerId: true },
      }),
    ]);
    return buildPositionChart({
      company: organization, departments, employees,
      source: { kind: 'CORE_RECORDS', label: 'Core people records (temporary: positions worked out from job titles and reporting lines)', loadedAt: new Date().toISOString() },
    });
  }

  async tierFor(organizationId: string, userId: string, employeeId: string): Promise<DetailTier> {
    const [membership, viewer, links] = await this.db.$transaction([
      this.db.userOrganization.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { role: { select: { name: true } } } }),
      this.db.employee.findFirst({ where: { organizationId, userId }, select: { id: true } }),
      this.db.employee.findMany({ where: { organizationId }, select: { id: true, reportingManagerId: true } }),
    ]);
    return tierOf({
      role: membership?.role?.name ?? null, viewerEmployeeId: viewer?.id ?? null, targetId: employeeId,
      managerOf: new Map(links.map(e => [e.id, e.reportingManagerId])),
    });
  }

  async getPerson(organizationId: string, employeeId: string, tier: DetailTier): Promise<PersonDetails | null> {
    // Work and role fields are read but only sent when the tier allows. Personal fields are never selected.
    // (Selections are written inline so Prisma can type the related records.)
    const e = await this.db.employee.findFirst({
      where: { id: employeeId, organizationId, employmentStatus: { in: ACTIVE } },
      select: {
        id: true, firstName: true, middleName: true, lastName: true, employeeCode: true, jobTitle: true, plantBranch: true,
        section: true, subSection: true, employmentStatus: true, employmentType: true, dateJoined: true, shift: true,
        workStation: true, level: true, grade: true, skillLevel: true, trainingNeeded: true, jobCategory: true,
        primaryWorkRole: true, machineProcess: true, canBeLeader: true, canBeMember: true, canBeAssignedTasks: true,
        department: { select: { id: true, name: true } },
        reportingManager: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        hrRecordOwner: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      },
    });
    if (!e) return null;
    const details: PersonDetails = {
      tier, employeeId: e.id, name: nameOf(e), employeeCode: text(e.employeeCode), jobTitle: text(e.jobTitle),
      department: e.department ? { id: e.department.id, name: e.department.name } : null,
      branch: text(e.plantBranch), section: text(e.section), subSection: text(e.subSection),
      manager: e.reportingManager ? { employeeId: e.reportingManager.id, name: nameOf(e.reportingManager) } : null,
      history: null,
      emsProfileUrl: null, // EMS pages aren't on this branch yet; EMS's provider fills this.
    };
    if (tier !== 'BASIC') details.work = {
      status: e.employmentStatus, employmentType: e.employmentType ?? null, dateJoined: e.dateJoined ? e.dateJoined.toISOString().slice(0, 10) : null,
      shift: text(e.shift), workStation: text(e.workStation), level: text(e.level), grade: text(e.grade),
      skillLevel: e.skillLevel ?? null, trainingNeeded: e.trainingNeeded ?? null,
    };
    if (tier === 'FULL') details.role = {
      jobCategory: text(e.jobCategory), primaryWorkRole: text(e.primaryWorkRole), machineProcess: text(e.machineProcess),
      hrRecordOwner: e.hrRecordOwner ? { employeeId: e.hrRecordOwner.id, name: nameOf(e.hrRecordOwner) } : null,
      canBeLeader: e.canBeLeader, canBeMember: e.canBeMember, canBeAssignedTasks: e.canBeAssignedTasks,
    };
    return details;
  }
}
