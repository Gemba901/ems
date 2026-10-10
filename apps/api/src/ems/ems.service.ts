import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { UpdateEmployeeEmsDto, QueryEmsEmployeesDto } from './dto/ems.dto';
import { getKenyaPublicHolidays } from 'src/calendar/kenya-holidays';
import { DwmsService } from 'src/dwms/dwms.service';
import { 
  AddOnboardingRecordsDto, CreateOnboardingBatchDto, UpdateOnboardingRecordDto, ExcludeOnboardingRecordDto, UpdateOnboardingBatchCountryDto,
} from './dto/onboarding.dto';
import { Prisma, RoleName } from 'db';
import { getCountries } from 'libphonenumber-js/max';
import { normalisePhone, storedPhone, phoneLookupDigits } from './onboarding-phone';

// ── Field groups that define completeness ────────────────────────────────────
export const EMS_GROUPS = {
  IDENTITY:            ['firstName', 'lastName', 'employeeCode', 'middleName', 'gender', 'nationalId', 'dateOfBirth', 'nationality'],
  WORK_ALLOCATION:     ['departmentId', 'employmentStatus', 'employmentType', 'jobTitle', 'dateJoined', 'plantBranch', 'workStation', 'section', 'subSection', 'shift', 'reportingManagerId', 'hodName', 'hodDesignation', 'beesAccessLevel'],
  ROLE_RESPONSIBILITY: ['jobDescription', 'level', 'grade', 'jobCategory', 'primaryWorkRole', 'machineProcess'],
  CONTACT:             ['phone', 'email', 'whatsappNumber', 'homeAddress', 'emergencyContactName', 'emergencyContactPhone'],
  SKILL:               ['skillLevel'],
} as const;

export type GroupKey = keyof typeof EMS_GROUPS;

const ALL_FIELDS = Object.values(EMS_GROUPS).flat();
const TOTAL_FIELDS = ALL_FIELDS.length; // 17

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function calcEmployeeCompletion(emp: Record<string, unknown>) {
  const groups: Record<string, number> = {};
  let totalFilled = 0;

  for (const [groupKey, fields] of Object.entries(EMS_GROUPS)) {
    const filled = fields.filter((f) => isFilled(emp[f])).length;
    groups[groupKey] = Math.round((filled / fields.length) * 100);
    totalFilled += filled;
  }

  const overall = Math.round((totalFilled / TOTAL_FIELDS) * 100);
  const lowestGroup = Object.entries(groups).sort(([, a], [, b]) => a - b)[0];

  return { overall, groups, lowestGroup: lowestGroup[0] as GroupKey };
}

const GROUP_LABELS: Record<GroupKey, string> = {
  IDENTITY:            'Employee Basic Identity',
  WORK_ALLOCATION:     'Work Allocation',
  ROLE_RESPONSIBILITY: 'Role & Responsibility',
  CONTACT:             'Contact',
  SKILL:               'Skill',
};

function completionStatus(pct: number): { status: string; message: string } {
  if (pct >= 97) return { status: 'Excellent', message: 'Maintain discipline' };
  if (pct >= 90) return { status: 'Good',      message: 'Keep improving' };
  if (pct >= 75) return { status: 'Fair',       message: 'Needs attention' };
  return            { status: 'Poor',      message: 'Urgent update required' };
}

const EMS_EMPLOYEE_SELECT = {
  // Core identifiers
  id: true, firstName: true, lastName: true, email: true, phone: true,
  avatarUrl: true, departmentId: true, updatedAt: true,
  department: { select: { id: true, name: true } },

  // Identity
  employeeCode: true, middleName: true, gender: true, dateOfBirth: true,
  nationalId: true, nationality: true,

  // Work Allocation
  employmentStatus: true, employmentType: true, jobTitle: true, dateJoined: true,
  plantBranch: true, workStation: true, section: true, subSection: true, shift: true,
  reportingManagerId: true,
  reportingManager: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },

  hodName: true, hodDesignation: true, beesAccessLevel: true,
  companyCode: true,
  firstRelieverId: true, secondRelieverId: true,

  hrRecordOwnerId: true,
  hrRecordOwner: { select: { id: true, firstName: true, lastName: true } },

  // Role & Responsibility
  jobDescription: true, level: true, grade: true, jobCategory: true,
  primaryWorkRole: true, machineProcess: true,
  canBeAssignedTasks: true, canBeMember: true, canBeLeader: true,

  // Contact
  whatsappNumber: true, homeAddress: true, emergencyContactName: true,
  emergencyContactPhone: true, emergencyContactRelationship: true,

  // Skill
  skillLevel: true, trainingNeeded: true,

  // Steering Committee (read-only, derived)
  committeeMembers: {
    select: {
      roleInCommittee: true,
      committee: { select: { id: true, name: true, type: true } },
    },
  },
};

// ── Onboarding batch list shape
const BATCH_LIST_SELECT = {          
  id: true,
  label: true,
  sourceFileName: true,
  defaultPhoneCountry: true,
  status: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
  _count: { select: { records: true } },
};

// ── Onboarding validation ────────────────────────────────────────────────────
type ValidationFinding = { field: string; message: string };

const GENDER_VALUES: Record<string, string> = {
  male: "MALE", m: "MALE",
  female: "FEMALE", f: "FEMALE",
  other: "OTHER",
};

const EMPLOYMENT_STATUS_VALUES = new Set([
  "ACTIVE", "PROBATION", "RESIGNED", "TERMINATED",
  "RETIRED", "SUSPENDED", "ABSCONDED", "CONTRACT_ENDED",
]);

const EMPLOYMENT_TYPE_VALUES = new Set([
  "FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CASUAL",
]);

function normaliseKey(value: string | null): string {
  return String(value ?? '')
    .replace(/[\n\r]+/g, ' ')        // line breaks inside a cell
    .replace(/\([^)]*\)/g, '')       // "(Line 1)" and similar notes
    .replace(/\s*\/\s*/g, ' ')       // "Work Area / Section"
    .replace(/[^a-zA-Z0-9]+/g, '')   // everything else removed
    .trim()
    .toLowerCase();
}

//rbac new acc to BEES
const ACCESS_LEVEL_VALUES: Record<string, RoleName> = {
  employee:          RoleName.EMPLOYEE,
  supervisor:        RoleName.EMPLOYEE,   // elevated permissions handled separately
  management:        RoleName.MANAGEMENT,
  manager:           RoleName.MANAGEMENT,
  hod:               RoleName.HOD,
  headofdepartment:  RoleName.HOD,
  hr:                RoleName.HR,
  humanresources:    RoleName.HR,
  admin:             RoleName.ADMIN,
  administrator:     RoleName.ADMIN,
  systemadministrator: RoleName.ADMIN,
};

@Injectable()
export class EmsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private dwmsService?: DwmsService,
  ) {}

  private async resolveEmployee(userId: string, organizationId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!emp) throw new ForbiddenException('No employee profile linked to your account');
    return emp;
  }

  // ── Employee self-view ────────────────────────────────────────────────────
  async getMyProfile(userId: string, organizationId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: EMS_EMPLOYEE_SELECT,
    });
    if (!emp) throw new ForbiddenException('No employee profile linked to your account');

    const reporteeWhere = { reportingManagerId: emp.id, organizationId };
    const [reportees, reporteeCount, leaveSettings] = await Promise.all([
      this.prisma.employee.findMany({
        where: reporteeWhere,
        select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true, employeeCode: true },
        orderBy: { firstName: 'asc' },
        take: 50,
      }),
      this.prisma.employee.count({ where: reporteeWhere }),
      this.prisma.leaveSettings.findUnique({ where: { organizationId }, select: { workingDays: true } }),
    ]);

    const { overall, groups } = calcEmployeeCompletion(emp as Record<string, unknown>);
    return {
      employee: emp,
      completion: { overall, groups },
      reportees,
      reporteeCount,
      upcomingHolidays: this.upcomingHolidays(new Date(), 3),
      // Same Mon–Fri default the leave module falls back to when no settings exist.
      workingDays: leaveSettings?.workingDays ?? [1, 2, 3, 4, 5],
    };
  }

  private upcomingHolidays(from: Date, limit: number) {
    const today = from.toISOString().slice(0, 10);
    const year = from.getFullYear();
    return [...getKenyaPublicHolidays(year), ...getKenyaPublicHolidays(year + 1)]
      .filter((holiday) => holiday.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }

  // ── HR/Admin: single employee profile ────────────────────────────────────
  async getEmployeeById(employeeId: string, organizationId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: EMS_EMPLOYEE_SELECT,
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const { overall, groups } = calcEmployeeCompletion(emp as Record<string, unknown>);
    return { employee: emp, completion: { overall, groups } };
  }

  // ── HR/Admin: paginated employee list with completion ─────────────────────
  async getEmployees(organizationId: string, query: QueryEmsEmployeesDto) {
    const { page, limit, departmentId, employmentStatus } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (departmentId) where.departmentId = departmentId;
    if (employmentStatus) where.employmentStatus = employmentStatus;

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: EMS_EMPLOYEE_SELECT,
        orderBy: { firstName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const data = employees.map((emp) => {
      const { overall, groups, lowestGroup } = calcEmployeeCompletion(emp as Record<string, unknown>);
      return { ...emp, completion: { overall, groups, lowestGroup } };
    });

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ── HR/Admin: update employee EMS data ───────────────────────────────────
  async updateEmployee(employeeId: string, organizationId: string, dto: UpdateEmployeeEmsDto) {
    const existing = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        departmentId: true,
        jobTitle: true,
        employmentStatus: true,
      },
    });
    if (!existing) throw new NotFoundException('Employee not found');

    if (dto.reportingManagerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.reportingManagerId, organizationId },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException('Reporting manager not found in this organization');
    }

    const DATE_FIELDS = new Set(['dateOfBirth', 'dateJoined']);
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || value === '') continue;
      updateData[key] = DATE_FIELDS.has(key) ? new Date(value as string) : value;
    }

    const updated = await this.prisma.employee.update({
      where: { id: employeeId, organizationId },
      data: updateData,
      select: EMS_EMPLOYEE_SELECT,
    });

    await this.dwmsService?.synchronizeEmployeeActivities(
      organizationId,
      employeeId,
      {
        previousDepartmentId: existing.departmentId,
        previousJobTitle: existing.jobTitle,
        previousEmploymentStatus: existing.employmentStatus,
      },
    );

    const { overall, groups } = calcEmployeeCompletion(updated as Record<string, unknown>);
    return { employee: updated, completion: { overall, groups } };
  }

  // ── HR/Admin: org-wide dashboard ─────────────────────────────────────────
  async getDashboard(organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: {
        ...EMS_EMPLOYEE_SELECT,
        committeeMembers: { select: { committeeId: true, committee: { select: { name: true, type: true } } } },
      },
    });

    const total = employees.length;
    const activeOrProbation = employees.filter(
      (e) => e.employmentStatus === 'ACTIVE' || e.employmentStatus === 'PROBATION',
    ).length;

    // Per-employee completion
    const withCompletion = employees.map((emp) => ({
      ...emp,
      ...calcEmployeeCompletion(emp as Record<string, unknown>),
    }));

    // Overall org completion
    const overallAvg = total > 0
      ? Math.round(withCompletion.reduce((s, e) => s + e.overall, 0) / total)
      : 0;

    // Per-group org avg
    const groupAvg: Record<string, number> = {};
    for (const groupKey of Object.keys(EMS_GROUPS) as GroupKey[]) {
      groupAvg[groupKey] = total > 0
        ? Math.round(withCompletion.reduce((s, e) => s + (e.groups[groupKey] ?? 0), 0) / total)
        : 0;
    }

    const groupSummary = (Object.keys(EMS_GROUPS) as GroupKey[]).map((key) => ({
      key,
      label: GROUP_LABELS[key],
      avgCompletion: groupAvg[key],
      ...completionStatus(groupAvg[key]),
    }));

    // Records needing update (< 90%)
    const needingUpdate = withCompletion.filter((e) => e.overall < 90);

    // Average age
    const now = new Date();
    const withAge = withCompletion.filter((e) => e.dateOfBirth);
    const avgAge = withAge.length > 0
      ? Math.round(withAge.reduce((s, e) => {
          const dob = new Date(e.dateOfBirth as Date);
          return s + (now.getFullYear() - dob.getFullYear());
        }, 0) / withAge.length)
      : null;

    // Average service (years)
    const withJoined = withCompletion.filter((e) => e.dateJoined);
    const avgService = withJoined.length > 0
      ? +(withJoined.reduce((s, e) => {
          const joined = new Date(e.dateJoined as Date);
          return s + (now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        }, 0) / withJoined.length).toFixed(1)
      : null;

    // Employment status breakdown
    const statusCounts: Record<string, number> = {};
    for (const emp of employees) {
      statusCounts[emp.employmentStatus] = (statusCounts[emp.employmentStatus] ?? 0) + 1;
    }

    // Gender breakdown
    const genderCounts: Record<string, number> = { MALE: 0, FEMALE: 0, OTHER: 0, UNKNOWN: 0 };
    for (const emp of employees) {
      const g = emp.gender ?? 'UNKNOWN';
      genderCounts[g] = (genderCounts[g] ?? 0) + 1;
    }

    // Skill level distribution
    const skillCounts: Record<string, number> = {
      LEVEL_1: 0, LEVEL_2: 0, LEVEL_3: 0, LEVEL_4: 0, NONE: 0,
    };
    for (const emp of employees) {
      const s = emp.skillLevel ?? 'NONE';
      skillCounts[s] = (skillCounts[s] ?? 0) + 1;
    }

    // Department breakdown
    const departments = await this.prisma.department.findMany({
      where: { organizationId },
      select: {
        id: true, name: true,
        employees: { select: { id: true, employmentStatus: true } },
      },
    });

    const deptBreakdown = departments.map((d) => {
      const active = d.employees.filter(
        (e) => e.employmentStatus === 'ACTIVE' || e.employmentStatus === 'PROBATION',
      ).length;
      const pct = d.employees.length > 0 ? Math.round((active / d.employees.length) * 100) : 0;
      return { id: d.id, name: d.name, activeCount: active, totalCount: d.employees.length, pct };
    }).filter((d) => d.totalCount > 0);

    // Steering committee summary (already in DB)
    const committees = await this.prisma.steeringCommittee.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, type: true,
        members: { select: { employeeId: true } },
      },
    });

    const committeeSummary = committees.map((c) => ({
      id: c.id, name: c.name, type: c.type,
      memberCount: c.members.length,
      pctOfEmployees: total > 0 ? Math.round((c.members.length / total) * 100) : 0,
    }));

    // Priority employees for HR (< 90%, sorted ascending by overall)
    const priorityEmployees = needingUpdate
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        firstName: e.firstName,
        lastName: e.lastName,
        department: e.department,
        overall: e.overall,
        lowestGroup: e.lowestGroup,
        lowestGroupLabel: GROUP_LABELS[e.lowestGroup],
      }));

    return {
      summary: {
        total,
        activeOrProbation,
        overallAvg,
        recordsNeedingUpdate: needingUpdate.length,
        avgAge,
        avgService,
      },
      groupSummary,
      statusCounts,
      genderCounts,
      skillCounts,
      deptBreakdown,
      committeeSummary,
      priorityEmployees,
    };
  }
  // ── HR/Admin: onboarding import ──────────────────────────────────────────
  /** Phone matching uses stored international numbers, never the new batch's country. */
  private async checkOnboardingIdentity(
    db: Prisma.TransactionClient,
    organizationId: string,
    phone: string,
    email: string | null,
    knownEmployees?: { phone: string | null; userId: string | null }[],
  ): Promise<{ id: string; phone: string; email: string | null } | null> {
    const lookup = phoneLookupDigits(phone);
    const employees = knownEmployees ?? await db.employee.findMany({
      where: { organizationId }, select: { phone: true, userId: true },
    });
    for (const employee of employees) {
      if (storedPhone(employee.phone) === phone) {
        throw new BadRequestException('This phone number is already used by an employee in this company');
      }
      const digits = (employee.phone ?? '').replace(/\D/g, '');
      if (digits && lookup.includes(digits) && !storedPhone(employee.phone)) {
        throw new BadRequestException('An existing employee has a matching phone without a clear country code. Ask an administrator to review it');
      }
    }
    // Compare formatting variants without downloading every account on the platform.
    // Values are parameterized; table/column names are fixed application schema names.
    const candidates = await db.$queryRaw<{ id: string; phone: string; email: string | null }[]>`
      SELECT id, phone, email FROM "User"
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (${Prisma.join(lookup)})
    `;
    const exact = candidates.filter((user) => storedPhone(user.phone) === phone);
    if (candidates.some((user) => storedPhone(user.phone) !== phone) || exact.length > 1) {
      throw new BadRequestException('This phone matches ambiguous existing account details. Ask an administrator to review it');
    }
    const user = exact[0] ?? null;
    if (user && employees.some((employee) => employee.userId === user.id)) {
      throw new BadRequestException('This login already has an employee in this company');
    }
    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail) {
      const emailOwners = await db.user.findMany({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      if (emailOwners.some((owner) => owner.id !== user?.id)) {
        throw new BadRequestException('The phone and email do not match the same account. Ask an administrator to review them');
      }
    }
    return user;
  }

  async updateOnboardingBatchCountry(
    organizationId: string, batchId: string, dto: UpdateOnboardingBatchCountryDto,
  ) {
    if (!getCountries().some((code) => code === dto.defaultPhoneCountry)) {
      throw new BadRequestException('Select a supported default country for phone numbers');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EmsOnboardingBatch"
        WHERE id = ${batchId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const batch = await tx.emsOnboardingBatch.findFirst({
        where: { id: batchId, organizationId }, include: { records: true },
      });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      if (batch.status === 'CANCELLED' || batch.status === 'REGISTERED') {
        throw new BadRequestException('The country cannot be changed on a completed or cancelled import');
      }
      // An old partially registered batch may receive its first country, but not be reinterpreted later.
      if (batch.defaultPhoneCountry && batch.defaultPhoneCountry !== dto.defaultPhoneCountry &&
          batch.records.some((record) => record.status === 'REGISTERED')) {
        throw new BadRequestException('The country cannot be changed after registration has started');
      }
      await tx.emsOnboardingBatch.update({
        where: { id: batchId }, data: { defaultPhoneCountry: dto.defaultPhoneCountry },
      });
      await tx.emsOnboardingRecord.updateMany({
        where: { batchId, organizationId, status: { in: ['DRAFT', 'READY', 'NEEDS_FIXING'] } },
        data: { status: 'DRAFT', validationErrors: Prisma.DbNull },
      });
    });
    return this.validateOnboardingBatch(organizationId, batchId);
  }

  async createOnboardingBatch(
    userId: string,
    organizationId: string,
    dto: CreateOnboardingBatchDto,
  ) {
    return this.prisma.emsOnboardingBatch.create({
      data: {
        organizationId,
        uploadedById: userId,
        label: dto.label,
        sourceFileName: dto.sourceFileName,
        defaultPhoneCountry: dto.defaultPhoneCountry,
      },
      select: BATCH_LIST_SELECT,
    });
  }

  async listOnboardingBatches(organizationId: string) {
    return this.prisma.emsOnboardingBatch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: BATCH_LIST_SELECT,
    });
  }

  async getOnboardingBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        records: { orderBy: { rowNumber: 'asc' } },
      },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    return batch;
  }

  async addOnboardingRecords(
    organizationId: string,
    batchId: string,
    dto: AddOnboardingRecordsDto,
  ) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');

    await this.prisma.emsOnboardingRecord.createMany({
      data: dto.records.map((record) => ({
        ...record,
        batchId,
        organizationId,
      })),
    });

    return this.getOnboardingBatch(organizationId, batchId);
  }
  async validateOnboardingBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      include: { records: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');

    if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');

    // Existing values in this org, to detect clashes
    const existing = await this.prisma.employee.findMany({
      where: { organizationId },
      select: { employeeCode: true, phone: true, email: true, userId: true },
    });
    const takenCodes  = new Set(existing.map((e) => normaliseKey(e.employeeCode)).filter(Boolean));
    const takenEmails = new Set(existing.map((e) => normaliseKey(e.email)).filter(Boolean));

    const departments = await this.prisma.department.findMany({
      where: { organizationId },
      select: { name: true },
    });
    const knownDepartments = new Set(departments.map((d) => normaliseKey(d.name)));

    // Codes seen within this batch, to detect internal duplicates
    const seenCodes = new Set<string>();

    // Count equivalent phone numbers across all non-excluded rows.
    const phoneCounts = new Map<string, number>();

    for (const record of batch.records) {
      if (record.status === 'EXCLUDED') continue;

      const phone = normalisePhone(
        record.mobileNumber,
        batch.defaultPhoneCountry,
      );

      if (phone) {
        phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      }
    }

    let readyCount = 0;

    for (const record of batch.records) {
      if (record.status === 'EXCLUDED' || record.status === 'REGISTERED') continue;

      const findings: ValidationFinding[] = [];

      if (!record.employeeCode?.trim()) {
        findings.push({ field: 'employeeCode', message: 'Required' });
      } else {
        const key = normaliseKey(record.employeeCode);
        if (takenCodes.has(key)) {
          findings.push({ field: 'employeeCode', message: 'Already used by an existing employee' });
        }
        if (seenCodes.has(key)) {
          findings.push({ field: 'employeeCode', message: 'Duplicated within this import' });
        }
        seenCodes.add(key);
      }

      if (!record.firstName?.trim()) findings.push({ field: 'firstName', message: 'Required' });
      if (!record.lastName?.trim())  findings.push({ field: 'lastName',  message: 'Required' });
      
      const phone = normalisePhone(
        record.mobileNumber,
        batch.defaultPhoneCountry,
      );

      if (!record.mobileNumber?.trim()) {
        findings.push({
          field: 'mobileNumber',
          message: 'A mobile number is required to create a login',
        });
      } else if (!phone) {
        findings.push({
          field: 'mobileNumber',
          message:
            'Enter a valid phone number for the selected country, or use + followed by the country code and number.',
        });
      } else if ((phoneCounts.get(phone) ?? 0) > 1) {
        findings.push({
          field: 'mobileNumber',
          message: 'This phone number appears on another record in this import',
        });
      }

      if (phone && (phoneCounts.get(phone) ?? 0) === 1) {
        try {
          await this.checkOnboardingIdentity(
            this.prisma, organizationId, phone, record.workEmail, existing,
          );
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          findings.push({ field: 'mobileNumber', message: error.message });
        }
      }

      if (record.gender?.trim() && !GENDER_VALUES[normaliseKey(record.gender)]) {
        findings.push({ field: 'gender', message: `Unrecognised value "${record.gender}"` });
      }

      if (record.employmentStatus?.trim()) {
        const key = normaliseKey(record.employmentStatus).toUpperCase();
        const match = [...EMPLOYMENT_STATUS_VALUES].find((v) => normaliseKey(v).toUpperCase() === key);
        if (!match) findings.push({ field: 'employmentStatus', message: `Unrecognised value "${record.employmentStatus}"` });
      }

      if (record.employmentType?.trim()) {
        const key = normaliseKey(record.employmentType).toUpperCase();
        const match = [...EMPLOYMENT_TYPE_VALUES].find((v) => normaliseKey(v).toUpperCase() === key);
        if (!match) findings.push({ field: 'employmentType', message: `Unrecognised value "${record.employmentType}"` });
      }

      if (!record.beesAccessLevel?.trim()) {
        findings.push({ field: 'beesAccessLevel', message: 'Required' });
      } else if (!ACCESS_LEVEL_VALUES[normaliseKey(record.beesAccessLevel)]) {
        findings.push({
          field: 'beesAccessLevel',
          message: `Unrecognised access level "${record.beesAccessLevel}"`,
        });
      }

      if (!record.currentDepartment?.trim()) {
        findings.push({ field: 'currentDepartment', message: 'Required' });
      } else if (!knownDepartments.has(normaliseKey(record.currentDepartment))) {
        findings.push({
          field: 'currentDepartment',
          message: `No department named "${record.currentDepartment}" in this organisation`,
        });
      }

      if (record.workEmail?.trim() && takenEmails.has(normaliseKey(record.workEmail))) {
        findings.push({ field: 'workEmail', message: 'Already used by an existing employee' });
      }

      if (record.workEmail?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.workEmail.trim())) {
        findings.push({
          field: 'workEmail',
          message: `"${record.workEmail}" is not a valid email address`,
        });
      }

      const status = findings.length > 0 ? 'NEEDS_FIXING' : 'READY';
      if (status === 'READY') readyCount++;

      await this.prisma.emsOnboardingRecord.update({
        where: { id: record.id },
        data: { status, validationErrors: findings.length > 0 ? findings : Prisma.DbNull },
      });
    }

    const pending = batch.records.filter(
      (r) => r.status !== 'EXCLUDED' && r.status !== 'REGISTERED',
    ).length;

    await this.prisma.emsOnboardingBatch.update({
      where: { id: batchId },
      data: {
        status: batch.records.some((r) => r.status === 'REGISTERED')
          ? (pending === 0 ? 'REGISTERED' : 'PARTIALLY_REGISTERED')
          : (readyCount === pending && pending > 0 ? 'READY' : 'DRAFT'),
      },
    });

    return this.getOnboardingBatch(organizationId, batchId);
  }

    async updateOnboardingRecord(
    organizationId: string,
    recordId: string,
    dto: UpdateOnboardingRecordDto,
  ) {
    const record = await this.prisma.emsOnboardingRecord.findFirst({
      where: { id: recordId, organizationId },
      select: { id: true, batchId: true, status: true },
    });
    if (!record) throw new NotFoundException('Onboarding record not found');
    if (record.status === 'REGISTERED') {
      throw new BadRequestException('This record has already been registered');
    }

    const data: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      data[key] = value.trim() === '' ? null : value.trim();
    }

    await this.prisma.emsOnboardingRecord.update({
      where: { id: recordId },
      data: {
        ...data,
        status: record.status === 'EXCLUDED' ? 'EXCLUDED' : 'DRAFT',
        validationErrors: Prisma.DbNull,
      },
    });

    return this.validateOnboardingBatch(organizationId, record.batchId);
  }

  async excludeOnboardingRecord(
    organizationId: string,
    recordId: string,
    dto: ExcludeOnboardingRecordDto,
  ) {
    const record = await this.prisma.emsOnboardingRecord.findFirst({
      where: { id: recordId, organizationId },
      select: { id: true, batchId: true, status: true },
    });
    if (!record) throw new NotFoundException('Onboarding record not found');
    if (record.status === 'REGISTERED') {
      throw new BadRequestException('This record has already been registered');
    }

    const reason = dto.reason?.trim();

    if (!reason) {
      throw new BadRequestException('An exclusion reason is required');
    }

    if (reason.length < 5) {
      throw new BadRequestException(
        'Exclusion reason must contain at least 5 characters',
      );
    }

    await this.prisma.emsOnboardingRecord.update({
      where: { id: recordId },
      data: {
        status: 'EXCLUDED',
        exclusionReason: reason,
        validationErrors: Prisma.DbNull,
      },
    });

    return this.validateOnboardingBatch(organizationId, record.batchId);
  }

  async includeOnboardingRecord(organizationId: string, recordId: string) {
    const record = await this.prisma.emsOnboardingRecord.findFirst({
      where: { id: recordId, organizationId },
      select: { id: true, batchId: true, status: true },
    });
    if (!record) throw new NotFoundException('Onboarding record not found');
    if (record.status !== 'EXCLUDED') {
      throw new BadRequestException('Only excluded records can be restored');
    }

    await this.prisma.emsOnboardingRecord.update({
      where: { id: recordId },
      data: { status: 'DRAFT', exclusionReason: null },
    });

    return this.validateOnboardingBatch(organizationId, record.batchId);
  }

  async registerOnboardingBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId }, include: { records: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
    const ready = batch.records.filter((r) => r.status === 'READY');
    if (!ready.length) throw new BadRequestException('No records are ready to register');

    const departments = await this.prisma.department.findMany({
      where: { organizationId }, select: { id: true, name: true },
    });
    const departmentIds = new Map(departments.map((d) => [normaliseKey(d.name), d.id]));
    const roles = await this.prisma.role.findMany({ select: { id: true, name: true } });
    const roleIds = new Map(roles.map((r) => [r.name, r.id]));
    const results: { recordId: string; employeeId?: string; error?: string }[] = [];

    for (const candidate of ready) {
      try {
        const employee = await this.prisma.$transaction(async (tx) => {
          // Serialize registration and country changes for this batch.
          await tx.$queryRaw`SELECT id FROM "EmsOnboardingBatch"
            WHERE id = ${batchId} AND "organizationId" = ${organizationId} FOR UPDATE`;
          const current = await tx.emsOnboardingBatch.findFirst({
            where: { id: batchId, organizationId }, include: { records: true },
          });
          if (!current || current.status === 'CANCELLED') {
            throw new BadRequestException('This import is unavailable or cancelled');
          }
          const record = current.records.find((r) => r.id === candidate.id);
          if (!record || record.status !== 'READY') {
            throw new BadRequestException('This record is no longer ready; validate the import again');
          }
          const phone = normalisePhone(record.mobileNumber, current.defaultPhoneCountry);
          if (!phone) throw new BadRequestException('Enter a valid phone number and check the default country');
          const duplicates = current.records.filter((r) =>
            r.status !== 'EXCLUDED' &&
            normalisePhone(r.mobileNumber, current.defaultPhoneCountry) === phone,
          );
          if (duplicates.length > 1) {
            throw new BadRequestException('This phone number appears on another record in this import');
          }
          const roleName = ACCESS_LEVEL_VALUES[normaliseKey(record.beesAccessLevel)];
          const roleId = roleIds.get(roleName);
          if (!roleId) throw new BadRequestException('The selected access level is not configured');
          const email = record.workEmail?.trim().toLowerCase() || null;
          let user = await this.checkOnboardingIdentity(tx, organizationId, phone, email);
          if (!user) {
            user = await tx.user.create({
              data: { phone, email, name: [record.firstName, record.lastName].filter(Boolean).join(' ') },
              select: { id: true, phone: true, email: true },
            });
          }
          // Importing an employee must not overwrite an existing company role.
          await tx.userOrganization.upsert({
            where: { userId_organizationId: { userId: user.id, organizationId } },
            update: {}, create: { userId: user.id, organizationId, roleId },
          });
          const employee = await tx.employee.create({
            data: {
              organizationId,
              userId: user.id,
              firstName: record.firstName!,
              lastName: record.lastName!,
              middleName: record.middleName,
              email,
              phone,
              employeeCode: record.employeeCode,
              companyCode: record.companyCode,
              plantBranch: record.plantBranchCode,
              gender: GENDER_VALUES[normaliseKey(record.gender)] as any,
              nationality: record.nationality,
              departmentId: departmentIds.get(normaliseKey(record.currentDepartment)) ?? null,
              jobTitle: record.jobDesignation,
              workStation: record.workArea,
              subSection: record.subSection,
              shift: record.shift,
              employmentStatus: (record.employmentStatus?.trim().toUpperCase() || 'ACTIVE') as any,
              employmentType: (record.employmentType?.trim().toUpperCase() || null) as any,
              beesAccessLevel: record.beesAccessLevel,
              hodName: record.hodName,
              hodDesignation: record.hodDesignation,
            },
          });

          await tx.emsOnboardingRecord.update({
            where: { id: record.id },
            data: {
              status: 'REGISTERED',
              employeeId: employee.id,
              registeredAt: new Date(),
              validationErrors: Prisma.DbNull,
            },
          });
          return employee;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
        results.push({ recordId: candidate.id, employeeId: employee.id });
      } catch (error: unknown) {
        const message = error instanceof BadRequestException
          ? error.message
          : 'Registration could not be completed. Validate and retry; contact an administrator if it persists.';
        // Do not downgrade a record another request has already registered/excluded.
        await this.prisma.emsOnboardingRecord.updateMany({
          where: { id: candidate.id, organizationId, status: 'READY' },
          data: { status: 'NEEDS_FIXING', validationErrors: [{ field: 'registration', message }] },
        });
        results.push({ recordId: candidate.id, error: message });
      }
    }
    const after = await this.prisma.emsOnboardingRecord.findMany({
      where: { batchId, organizationId }, select: { status: true },
    });
    const outstanding = after.filter((r) => r.status !== 'REGISTERED' && r.status !== 'EXCLUDED').length;
    const registered = after.filter((r) => r.status === 'REGISTERED').length;
    await this.prisma.emsOnboardingBatch.updateMany({
      where: { id: batchId, organizationId, status: { not: 'CANCELLED' } },
      data: { status: outstanding === 0 ? 'REGISTERED' : registered > 0 ? 'PARTIALLY_REGISTERED' : 'DRAFT' },
    });
    return {
      registered: results.filter((r) => r.employeeId).length,
      failed: results.filter((r) => r.error).length,
      batch: await this.getOnboardingBatch(organizationId, batchId),
    };
  }

  async cancelOnboardingBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      select: {
        id: true,
        status: true,
        _count: { select: { records: { where: { status: 'REGISTERED' } } } },
      },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    if (batch.status === 'CANCELLED') {
      throw new BadRequestException('This import is already cancelled');
    }
    if (batch._count.records > 0) {
      throw new BadRequestException(
        `Cannot cancel — ${batch._count.records} record(s) have already been registered`,
      );
    }

    return this.prisma.emsOnboardingBatch.update({
      where: { id: batchId },
      data: { status: 'CANCELLED' },
      select: BATCH_LIST_SELECT,
    });
  }

  async deleteOnboardingBatch(organizationId: string, batchId: string) {
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      select: { id: true, status: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    if (batch.status !== 'CANCELLED') {
      throw new BadRequestException('Cancel the import before deleting it');
    }

    await this.prisma.emsOnboardingBatch.delete({ where: { id: batchId } });
    return { deleted: true };
  }
}
