import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ACTIVE_EMPLOYMENT_STATUSES,
  isActiveEmployment,
} from '../employment-status';
import { normaliseKey, personFullName } from '../onboarding-text';
import { isReportingBody } from '../reporting-bodies';
import type {
  EmsDepartmentHod,
  EmsDetailTier,
  EmsDirectory,
  EmsDirectoryPerson,
  EmsOrganisationSnapshot,
  EmsPersonDetails,
} from './ems-directory.contract';

// Whole-chart/calendar reads must be complete, never silently truncated. Paged pickers use listPeople instead.
export const EMS_DIRECTORY_LIMIT = 10000;
const text = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() || null;
const identitySelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  employeeCode: true,
  jobTitle: true,
} satisfies Prisma.EmployeeSelect;
const directorySelect = {
  ...identitySelect,
  departmentId: true,
  plantBranch: true,
  section: true,
  employmentStatus: true,
  avatarUrl: true,
  reportingManagerId: true,
  reportingBody: true,
  reportsToBoard: true,
  pendingReportingRecordId: true,
} satisfies Prisma.EmployeeSelect;
const fullRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);
const allowedRoles = new Set<string>(Object.values(Role));

function companyRequired(id: string) {
  if (typeof id !== 'string' || !id.trim())
    throw new BadRequestException('Company context is required');
}

/** No caller-supplied tier: permissions are resolved from current company membership and reporting records. */
export function emsDetailTier(
  role: string,
  viewerIds: string[],
  targetId: string,
  links: {
    id: string;
    reportingManagerId: string | null;
    employmentStatus: string;
    reportsToBoard?: boolean;
    reportingBody?: string | null;
    pendingReportingRecordId?: string | null;
  }[],
): EmsDetailTier {
  if (fullRoles.has(role)) return 'FULL';
  if (role === 'MANAGEMENT') return 'MANAGER';
  const byId = new Map(links.map((p) => [p.id, p]));
  const own = new Set(
    viewerIds.filter((id) =>
      isActiveEmployment(byId.get(id)?.employmentStatus),
    ),
  );
  if (own.has(targetId)) return 'MANAGER';
  const seen = new Set<string>();
  let at: string | null = targetId,
    reportsToViewer = false;
  while (at) {
    const person = byId.get(at);
    if (!person || !isActiveEmployment(person.employmentStatus) || seen.has(at))
      return 'BASIC';
    seen.add(at);
    if (
      person.reportingManagerId &&
      (person.reportsToBoard ||
        person.reportingBody ||
        person.pendingReportingRecordId)
    )
      return 'BASIC';
    if (own.has(at)) reportsToViewer = true;
    at = person.reportingManagerId;
  }
  return reportsToViewer ? 'MANAGER' : 'BASIC';
}

@Injectable()
export class EmsDirectoryService {
  constructor(private readonly db: PrismaService) {}

  private snapshot<T>(
    organizationId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    companyRequired(organizationId);
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('gemba.organization_id', ${organizationId}, true)`;
        return work(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  getDirectory(organizationId: string): Promise<EmsDirectory> {
    return this.snapshot(organizationId, (tx) =>
      this.readDirectory(tx, organizationId),
    );
  }

  /** Use inside a caller-owned, tenant-scoped transaction (e.g. calendar approval).
   * Does not open a second transaction, alter its tenant context, or cache employment data. */
  async readDirectory(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<EmsDirectory> {
    companyRequired(organizationId);
    const company = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    const departments = await tx.department.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const rows = await tx.employee.findMany({
      where: { organizationId },
      select: directorySelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      take: EMS_DIRECTORY_LIMIT + 1,
    });
    if (rows.length > EMS_DIRECTORY_LIMIT)
      throw new BadRequestException(
        'This view exceeds 10,000 employees. A larger-directory integration is required; no partial organisation is shown.',
      );
    const departmentIds = new Set(departments.map((d) => d.id)),
      byId = new Map(rows.map((p) => [p.id, p]));
    const people: EmsDirectoryPerson[] = rows.map((p) => {
      const manager = p.reportingManagerId
        ? byId.get(p.reportingManagerId)
        : undefined;
      const body = p.reportsToBoard
        ? 'BOARD'
        : isReportingBody(p.reportingBody)
          ? p.reportingBody
          : null;
      const choices =
        Number(!!p.reportingManagerId) +
        Number(!!body) +
        Number(!!p.pendingReportingRecordId);
      const contradictoryBody =
        p.reportsToBoard && !!p.reportingBody && p.reportingBody !== 'BOARD';
      const unknownBody =
        !!p.reportingBody && !isReportingBody(p.reportingBody);
      const state: EmsDirectoryPerson['reporting']['state'] =
        choices > 1 ||
        contradictoryBody ||
        (unknownBody && !!p.reportingManagerId)
          ? 'CONFLICT'
          : p.reportingManagerId
            ? !manager
              ? 'UNAVAILABLE'
              : isActiveEmployment(manager.employmentStatus)
                ? 'MANAGER'
                : 'MANAGER_INACTIVE'
            : body
              ? 'BODY'
              : p.pendingReportingRecordId
                ? 'PENDING'
                : p.reportingBody
                  ? 'UNAVAILABLE'
                  : 'UNASSIGNED';
      return {
        id: p.id,
        name: personFullName(p),
        employeeCode: text(p.employeeCode),
        jobTitle: text(p.jobTitle),
        departmentId:
          p.departmentId && departmentIds.has(p.departmentId)
            ? p.departmentId
            : null,
        branch: text(p.plantBranch),
        branchKey: normaliseKey(p.plantBranch),
        section: text(p.section),
        employmentStatus: p.employmentStatus,
        active: isActiveEmployment(p.employmentStatus),
        avatarUrl: p.avatarUrl,
        reporting: { managerId: manager?.id ?? null, body, state },
      };
    });
    return {
      schemaVersion: 1,
      source: 'EMS',
      loadedAt: new Date().toISOString(),
      company,
      departments,
      people,
      capabilities: { recordedPositions: false },
    };
  }

  getOrganisation(organizationId: string): Promise<EmsOrganisationSnapshot> {
    return this.snapshot(organizationId, async (tx) => ({
      ...(await this.readDirectory(tx, organizationId)),
      hodAssignments: await this.readDepartmentHods(tx, organizationId),
    }));
  }

  async readDepartmentHods(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<EmsDepartmentHod[]> {
    companyRequired(organizationId);
    const rows = await tx.emsDepartmentHod.findMany({
      where: { department: { organizationId } },
      select: {
        departmentId: true,
        branchKey: true,
        branchLabel: true,
        employeeId: true,
        pendingRecordId: true,
        isUnassigned: true,
        employee: {
          select: {
            ...identitySelect,
            organizationId: true,
            employmentStatus: true,
            avatarUrl: true,
          },
        },
        pendingRecord: {
          select: {
            organizationId: true,
            status: true,
            batch: { select: { organizationId: true, status: true } },
          },
        },
      },
      orderBy: [{ departmentId: 'asc' }, { branchKey: 'asc' }],
    });
    return rows.map((row) => {
      const summary: EmsDepartmentHod = {
        departmentId: row.departmentId,
        branchKey: row.branchKey,
        branchLabel: row.branchLabel,
        state: 'NEEDS_ATTENTION',
        person: null,
      };
      // Corrupt/mixed selections cannot manufacture an authority. Keep them visible as needing attention.
      if (
        Number(!!row.employeeId) +
          Number(!!row.pendingRecordId) +
          Number(row.isUnassigned) >
        1
      )
        return summary;
      if (row.isUnassigned) return { ...summary, state: 'UNASSIGNED' };
      const p = row.employee;
      if (
        p &&
        p.organizationId === organizationId &&
        isActiveEmployment(p.employmentStatus)
      )
        return {
          ...summary,
          state: 'ASSIGNED',
          person: {
            id: p.id,
            name: personFullName(p),
            employeeCode: text(p.employeeCode),
            jobTitle: text(p.jobTitle),
            avatarUrl: p.avatarUrl,
          },
        };
      const pending = row.pendingRecord;
      if (
        pending &&
        pending.organizationId === organizationId &&
        pending.batch.organizationId === organizationId &&
        !['EXCLUDED', 'REGISTERED'].includes(pending.status) &&
        pending.batch.status !== 'CANCELLED'
      )
        return { ...summary, state: 'PENDING' };
      return summary;
    });
  }

  /** Paged directory choices for other BEES modules; no contacts, login IDs or import drafts. */
  async listPeople(
    organizationId: string,
    options: {
      search?: string;
      departmentId?: string;
      activity?: 'ACTIVE' | 'INACTIVE' | 'ALL';
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    if (
      !options ||
      (options.search !== undefined && typeof options.search !== 'string') ||
      (options.departmentId !== undefined &&
        (typeof options.departmentId !== 'string' ||
          !options.departmentId.trim()))
    )
      throw new BadRequestException('Invalid directory filters');
    const page = options.page ?? 1,
      pageSize = options.pageSize ?? 50,
      search = options.search?.trim() ?? '';
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      search.length > 120 ||
      (options.activity &&
        !['ACTIVE', 'INACTIVE', 'ALL'].includes(options.activity))
    )
      throw new BadRequestException('Invalid directory filters');
    return this.snapshot(organizationId, async (tx) => {
      if (
        options.departmentId &&
        !(await tx.department.findFirst({
          where: { id: options.departmentId, organizationId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Department not found in this company');
      const where: Prisma.EmployeeWhereInput = {
        organizationId,
        ...(options.departmentId ? { departmentId: options.departmentId } : {}),
      };
      if (options.activity !== 'ALL')
        where.employmentStatus =
          options.activity === 'INACTIVE'
            ? { notIn: ACTIVE_EMPLOYMENT_STATUSES }
            : { in: ACTIVE_EMPLOYMENT_STATUSES };
      if (search)
        where.AND = search.split(/\s+/).map((term) => ({
          OR: [
            'firstName',
            'middleName',
            'lastName',
            'employeeCode',
            'jobTitle',
          ].map((field) => ({
            [field]: { contains: term, mode: 'insensitive' },
          })),
        }));
      const total = await tx.employee.count({ where });
      const rows = await tx.employee.findMany({
        where,
        select: { ...identitySelect, employmentStatus: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return {
        data: rows.map((p) => ({
          id: p.id,
          name: personFullName(p),
          employeeCode: text(p.employeeCode),
          jobTitle: text(p.jobTitle),
          employmentStatus: p.employmentStatus,
        })),
        pagination: {
          page,
          pageSize,
          total,
          pages: Math.ceil(total / pageSize),
        },
      };
    });
  }

  getViewerEmployeeIds(
    organizationId: string,
    userId: string,
  ): Promise<string[]> {
    if (typeof userId !== 'string' || !userId.trim())
      throw new ForbiddenException('An authenticated viewer is required');
    return this.snapshot(organizationId, async (tx) =>
      (
        await tx.employee.findMany({
          where: {
            organizationId,
            userId,
            employmentStatus: { in: ACTIVE_EMPLOYMENT_STATUSES },
          },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
  }

  getPerson(
    organizationId: string,
    viewerUserId: string,
    employeeId: string,
  ): Promise<EmsPersonDetails> {
    if (typeof viewerUserId !== 'string' || !viewerUserId.trim())
      throw new ForbiddenException('An authenticated viewer is required');
    if (typeof employeeId !== 'string' || !employeeId.trim())
      throw new BadRequestException('Employee ID is required');
    return this.snapshot(organizationId, async (tx) => {
      const membership = await tx.userOrganization.findUnique({
        where: {
          userId_organizationId: { userId: viewerUserId, organizationId },
        },
        select: {
          role: { select: { name: true } },
          organization: {
            select: { status: true, modules: true, isAdminOrg: true },
          },
        },
      });
      if (
        !membership ||
        membership.organization.status !== 'ACTIVE' ||
        !allowedRoles.has(membership.role.name)
      )
        throw new ForbiddenException('Company access denied');
      const needsReporting =
        !fullRoles.has(membership.role.name) &&
        membership.role.name !== 'MANAGEMENT';
      const viewers = needsReporting
        ? await tx.employee.findMany({
            where: {
              organizationId,
              userId: viewerUserId,
              employmentStatus: { in: ACTIVE_EMPLOYMENT_STATUSES },
            },
            select: { id: true },
          })
        : [];
      const links = needsReporting
        ? await tx.employee.findMany({
            where: { organizationId },
            select: {
              id: true,
              reportingManagerId: true,
              employmentStatus: true,
              reportsToBoard: true,
              reportingBody: true,
              pendingReportingRecordId: true,
            },
          })
        : [];
      const tier = emsDetailTier(
        membership.role.name,
        viewers.map((p) => p.id),
        employeeId,
        links,
      );
      const workSelect = {
        employmentStatus: true,
        employmentType: true,
        dateJoined: true,
        shift: true,
        workStation: true,
        level: true,
        grade: true,
        skillLevel: true,
        trainingNeeded: true,
      } as const;
      const roleSelect = {
        jobCategory: true,
        primaryWorkRole: true,
        machineProcess: true,
        hrRecordOwnerId: true,
        canBeLeader: true,
        canBeMember: true,
        canBeAssignedTasks: true,
      } as const;
      const e = await tx.employee.findFirst({
        where: {
          id: employeeId,
          organizationId,
          employmentStatus: { in: ACTIVE_EMPLOYMENT_STATUSES },
        },
        select: {
          ...identitySelect,
          departmentId: true,
          plantBranch: true,
          section: true,
          subSection: true,
          reportingManagerId: true,
          ...(tier !== 'BASIC' ? workSelect : {}),
          ...(tier === 'FULL' ? roleSelect : {}),
        },
      });
      if (!e) throw new NotFoundException('Person not found in this company');
      // Follow references with an explicit company filter, including legacy or corrupt cross-company references.
      const department = e.departmentId
        ? await tx.department.findFirst({
            where: { id: e.departmentId, organizationId },
            select: { id: true, name: true },
          })
        : null;
      const namedPerson = async (id: string | null | undefined) => {
        if (!id) return null;
        const p = await tx.employee.findFirst({
          where: { id, organizationId },
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        });
        return p ? { employeeId: p.id, name: personFullName(p) } : null;
      };
      const details: EmsPersonDetails = {
        tier,
        employeeId: e.id,
        name: personFullName(e),
        employeeCode: text(e.employeeCode),
        jobTitle: text(e.jobTitle),
        department,
        branch: text(e.plantBranch),
        section: text(e.section),
        subSection: text(e.subSection),
        manager: await namedPerson(e.reportingManagerId),
        history: null,
        emsProfileUrl:
          fullRoles.has(membership.role.name) &&
          (membership.organization.isAdminOrg ||
            membership.organization.modules.some((m) => m === 'EMS'))
            ? `/ems/employees/${encodeURIComponent(e.id)}`
            : null,
      };
      if (tier !== 'BASIC')
        details.work = {
          status: e.employmentStatus,
          employmentType: e.employmentType ?? null,
          dateJoined: e.dateJoined?.toISOString().slice(0, 10) ?? null,
          shift: text(e.shift),
          workStation: text(e.workStation),
          level: text(e.level),
          grade: text(e.grade),
          skillLevel: e.skillLevel ?? null,
          trainingNeeded: e.trainingNeeded ?? null,
        };
      if (tier === 'FULL')
        details.role = {
          jobCategory: text(e.jobCategory),
          primaryWorkRole: text(e.primaryWorkRole),
          machineProcess: text(e.machineProcess),
          hrRecordOwner: await namedPerson(e.hrRecordOwnerId),
          canBeLeader: e.canBeLeader,
          canBeMember: e.canBeMember,
          canBeAssignedTasks: e.canBeAssignedTasks,
        };
      return details;
    });
  }
}
