import { normaliseFiveSLocation, FIVE_S_LOCATION_ERROR } from './five-s-location';
import { importedAccountRole, canRegisterOnboarding, registrationAccess } from './onboarding-access';
import { employeeListWhere, employeeNameOrder, employeeSearchGroups, registeredSourceWhere, EMPLOYEE_SOURCE_SELECT, employeeImportSource } from './ems-employee-list';
import { assertProfileBirthDate } from './employee-profile-dates';
import { readExtraFields, reviseExtraFields, extraProfileData, ExtraFieldsError, isExtraProfileField } from './onboarding-extra-fields';
import { isReportingBody, reportingBodyLabel } from './reporting-bodies';
import { onboardingNameIssue } from './onboarding-name-rule';
import { departmentIndex, departmentIssue, onboardingFieldOptions } from './onboarding-field-options';
import { onboardingReadContext, OnboardingEmployeeSnapshot } from './onboarding-read-context';
import { onboardingPerformance } from './onboarding-performance';
import { retryOnboardingTransaction } from './onboarding-transaction';
import { assertPeopleLinksAllowBatchRemoval, employeePeopleLinks, loadPeopleLinks, registrationPeopleData, relieverDraftData, resolvePendingPeopleLinks, saveDepartmentHod, saveEmployeeHod, saveEmployeeRelievers } from './ems-people-links';
import { peopleLinkFindings } from './onboarding-people-links';
import { buildExcludeRemainingPreview, isRemainingRecord } from './onboarding-exclude-remaining';
import { columnHeadingKey, normaliseColumnChoices } from './onboarding-column-choices';
import { cleanRecord, isBlankValue, isNotApplicable, matchEnumValue, normaliseKey } from './onboarding-text';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Optional } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { UpdateEmployeeEmsDto, QueryEmsEmployeesDto, ChangeEmploymentStatusDto } from './dto/ems.dto';
import { isActiveEmployment } from './employment-status';
import { getEmploymentStatus, changeEmploymentStatus, retryEmploymentActivitySync } from './ems-employment-status';
import { getKenyaPublicHolidays } from 'src/calendar/kenya-holidays';
import { DwmsService } from 'src/dwms/dwms.service';
import { 
  AddOnboardingRecordsDto, CreateOnboardingBatchDto, UpdateCommunicationChannelDto, UpdateOnboardingRecordDto, ExcludeOnboardingRecordDto, UpdateOnboardingBatchCountryDto,
  ExcludeRemainingOnboardingRecordsDto, LookupImportColumnChoicesDto, SaveImportColumnChoicesDto, SetOnboardingColumnDestinationDto,
} from './dto/onboarding.dto';
import { Prisma } from 'db';
import { getCountries } from 'libphonenumber-js/max';
import { normalisePhone, storedPhone, phoneLookupDigits } from './onboarding-phone';
import { resolveReporting, ReportingRow } from './onboarding-hierarchy';
import { createDuplicateIndex } from './onboarding-duplicates';
import { duplicateImportPerson, duplicateFindings, refreshedDuplicateRecord, ONBOARDING_TEXT_FIELDS } from './onboarding-duplicate-context';

class OnboardingDuplicateConflict extends BadRequestException {
  constructor(readonly findings: ReturnType<typeof duplicateFindings>) {
    super('Possible duplicate or identity conflict. Review the matching people before registration.');
  }
}

class OnboardingFieldConflict extends BadRequestException {
  constructor(readonly findings: { field: string; message: string }[]) {
    const labels: Record<string, string> = {
      fiveSLocationCategory: '5S location category', jobDesignation: 'Job title', workEmail: 'Email', hodDesignation: 'HOD job title',
      reportingToDesignation: 'Reporting to job title',
      reliever1Designation: '1st reliever job title', reliever2Designation: '2nd reliever job title',
    };
    super(findings.map(f => `${labels[f.field] ?? f.field}: ${f.message}`).join('; '));
  }
}

// Caller authority is separate from record validation; never downgrade a row for it.
class OnboardingAdminRegistrationRequired extends Error {}

// An organisation setting changed, rather than a person's imported data.
class OnboardingChannelChangedError extends Error {}

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
    const filled = fields.filter((f) => f === 'reportingManagerId' ? isFilled(emp[f]) || emp.reportsToBoard === true || isReportingBody(emp.reportingBody) : isFilled(emp[f])).length;
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
  plantBranch: true, workStation: true, fiveSLocationCategory: true, section: true, subSection: true, shift: true,
  reportingManagerId: true,
  reportsToBoard: true, reportingBody: true, pendingReportingRecordId: true,
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

// Raw persisted record statuses. NEEDS_FIXING also includes upstream-chain waiting;
// the imports list must not present it as a count of direct field errors only.
const emptyOnboardingStatusCounts = () => ({
  DRAFT: 0, NEEDS_FIXING: 0, READY: 0, REGISTERED: 0, EXCLUDED: 0,
});

// ── Onboarding validation ────────────────────────────────────────────────────
type ValidationFinding = { field: string; message: string };

// JSONB may return object keys in a different order. Compare JSON values, not
// object prototypes, and retain array order because it controls finding display.
function validationJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}

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

/** Fields every record needs. N/A is never accepted for these. Keep in sync with ALWAYS_REQUIRED_FIELDS on the web. */
const REQUIRED_RECORD_FIELDS = [
  'employeeCode', 'firstName', 'lastName', 'mobileNumber', 'currentDepartment',
  'beesAccessLevel', 'jobDesignation', 'reportingToName', 'reportingToDesignation',
] as const;

/** Optional fields with a format check. When one says N/A, the check is skipped. */
const FORMAT_CHECKED_OPTIONAL_FIELDS = [
  'whatsappNumber', 'workEmail', 'gender', 'employmentStatus', 'employmentType',
] as const;

function notApplicableMessage(field: string): string {
  return field === 'reportingToName'
    ? 'N/A is not accepted. Choose a reporting person, or leave this blank and enter Board, Committee, Management Committee or Owner in the Reporting to job title field.'
    : 'This field applies to every employee, so N/A is not accepted';
}

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
      select: { ...EMS_EMPLOYEE_SELECT, importedExtraFields: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const source = await this.prisma.emsOnboardingRecord.findFirst({
      where: { employeeId, organizationId, status: 'REGISTERED', batch: { organizationId } },
      select: {
        id: true, rowNumber: true,
        registeredAt: true,
        batch: { select: { id: true, label: true, sourceFileName: true, createdAt: true } },
      },
    });
    const sourceImport = source ? {
      recordId: source.id,
      batchId: source.batch.id,
      importedAt: source.batch.createdAt,
      label: source.batch.label,
      sourceFileName: source.batch.sourceFileName,
      rowNumber: source.rowNumber,
      registeredAt: source.registeredAt,
    } : null;
    const { overall, groups } = calcEmployeeCompletion(emp as Record<string, unknown>);
    return { employee: emp, completion: { overall, groups }, sourceImport };
  }

  // ── HR/Admin: paginated employee list with completion ─────────────────────
  async getEmployees(organizationId: string, query: QueryEmsEmployeesDto) {
    const limit = query.limit ?? 20;
    const where = employeeListWhere(organizationId, query);
    const select = { ...EMS_EMPLOYEE_SELECT, emsOnboardingRecord: { select: EMPLOYEE_SOURCE_SELECT } };
    // One read snapshot keeps totals, clamped page and rows consistent during registration.
    return this.prisma.$transaction(async tx => {
      const total = await tx.employee.count({ where });
      const pages = Math.ceil(total / limit);
      const page = Math.min(query.page ?? 1, Math.max(1, pages));
      const skip = (page - 1) * limit;
      const byImport = query.sort === 'IMPORT_NEWEST' || query.sort === 'IMPORT_OLDEST';
      let employees;
      if (query.search?.trim() && (!query.sort || query.sort === 'BEST_MATCH')) {
        employees = [] as Prisma.EmployeeGetPayload<{ select: typeof select }>[];
        const groups = employeeSearchGroups(query.search);
        let offset = skip;
        let remaining = total;
        for (let index = 0; index < groups.length && employees.length < limit && remaining > 0; index++) {
          const groupWhere: Prisma.EmployeeWhereInput = { AND: [where, groups[index]] };
          // The final count is the remainder: at most two extra count queries.
          const count = index === groups.length - 1 ? remaining : await tx.employee.count({ where: groupWhere });
          remaining -= count;
          if (offset >= count) { offset -= count; continue; }
          employees.push(...await tx.employee.findMany({
            where: groupWhere, select, skip: offset, take: Math.min(limit - employees.length, count - offset),
            orderBy: employeeNameOrder(),
          }));
          offset = 0;
        }
      } else if (byImport) {
        // Always put employees without an import last, in both date directions.
        // Paginate across the two segments in SQL; never load all employees to sort.
        const importedWhere: Prisma.EmployeeWhereInput = { AND: [where, { emsOnboardingRecord: { is: registeredSourceWhere(organizationId) } }] };
        const importedCount = await tx.employee.count({ where: importedWhere });
        const direction = query.sort === 'IMPORT_NEWEST' ? 'desc' : 'asc';
        const imported = skip < importedCount ? await tx.employee.findMany({
          where: importedWhere, select, skip, take: Math.min(limit, importedCount - skip),
          orderBy: [{ emsOnboardingRecord: { batch: { createdAt: direction } } }, { id: 'asc' }],
        }) : [];
        const unlinked = imported.length < limit ? await tx.employee.findMany({
          where: { AND: [where, { emsOnboardingRecord: { isNot: registeredSourceWhere(organizationId) } }] }, select,
          skip: Math.max(0, skip - importedCount), take: limit - imported.length, orderBy: employeeNameOrder(),
        }) : [];
        employees = [...imported, ...unlinked];
      } else {
        employees = await tx.employee.findMany({ where, select, skip, take: limit, orderBy: employeeNameOrder(query.sort === 'NAME_DESC') });
      }
      const data = employees.map(({ emsOnboardingRecord, ...emp }) => ({
        ...emp, completion: calcEmployeeCompletion(emp as Record<string, unknown>),
        sourceImport: employeeImportSource(emsOnboardingRecord, organizationId),
      }));
      return { data, pagination: { page, limit, total, pages } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  // Small source list only; excludes batches with no linked registered employees.
  async getEmployeeImportBatches(organizationId: string) {
    const batches = await this.prisma.emsOnboardingBatch.findMany({
      where: { organizationId, records: { some: { organizationId, status: 'REGISTERED', employee: { is: { organizationId } } } } },
      select: { id: true, label: true, sourceFileName: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return batches.map(({ createdAt, ...batch }) => ({ ...batch, importedAt: createdAt }));
  }

  getEmploymentStatus(employeeId: string, organizationId: string) {
    return getEmploymentStatus(this.prisma, organizationId, employeeId);
  }

  changeEmploymentStatus(employeeId: string, organizationId: string, actorUserId: string, dto: ChangeEmploymentStatusDto) {
    return changeEmploymentStatus(this.prisma, this.dwmsService, organizationId, employeeId, actorUserId, dto);
  }

  retryEmploymentActivitySync(employeeId: string, organizationId: string, changeId: string) {
    return retryEmploymentActivitySync(this.prisma, this.dwmsService, organizationId, employeeId, changeId);
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
        organization: { select: { timeZone: true } },
      },
    });
    if (!existing) throw new NotFoundException('Employee not found');
    assertProfileBirthDate(dto.dateOfBirth, existing.organization?.timeZone);
    const fiveSCategory = normaliseFiveSLocation(dto.fiveSLocationCategory);
    if (dto.fiveSLocationCategory !== undefined && fiveSCategory === undefined)
      throw new BadRequestException(FIVE_S_LOCATION_ERROR);

    const updated = await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const current = await tx.employee.findFirst({
        where: { id: employeeId, organizationId },
        select: { id: true, employmentStatus: true, reportingManagerId: true, pendingReportingRecordId: true, reportsToBoard: true, reportingBody: true },
      });
      if (!current) throw new NotFoundException('Employee not found');
      if (dto.employmentStatus !== undefined && dto.employmentStatus !== current.employmentStatus)
        throw new BadRequestException('Use Change employment status on the profile, with a reason and confirmation.');
      const DATE_FIELDS = new Set(['dateOfBirth', 'dateJoined']);
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(dto)) {
        if (['fiveSLocationCategory', 'employmentStatus', 'employmentStatusRevision', 'employmentStatusChanges', 'reportingManagerId', 'firstRelieverId', 'secondRelieverId', 'pendingFirstRelieverRecordId', 'pendingSecondRelieverRecordId', 'hodName', 'hodDesignation'].includes(key) || value === undefined || value === '') continue;
        updateData[key] = DATE_FIELDS.has(key) ? new Date(value as string) : value;
      }
      if (dto.fiveSLocationCategory !== undefined) updateData.fiveSLocationCategory = fiveSCategory;
      if (dto.reportingManagerId && dto.reportingManagerId !== current.reportingManagerId) {
        Object.assign(updateData, await this.reportingAssignmentData(tx, organizationId, employeeId, `employee:${dto.reportingManagerId}`));
      }
      const result = await tx.employee.update({ where: { id: employeeId, organizationId }, data: updateData, select: EMS_EMPLOYEE_SELECT });
      await this.resolvePendingAssignments(tx, organizationId);
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));

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
      (e) => isActiveEmployment(e.employmentStatus),
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
        (e) => isActiveEmployment(e.employmentStatus),
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
    knownEmployees?: { phone: string | null; userId: string | null }[],
    knownCandidates?: { id: string; phone: string; email: string | null }[],
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
    const candidates = knownCandidates ?? await db.$queryRaw<{ id: string; phone: string; email: string | null }[]>`
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
    
    return user;
  }

  /** One bounded account lookup per group of phone variants, never a platform-wide account download. */
  private async onboardingAccountCandidates(db: Prisma.TransactionClient, phones: readonly string[]) {
    type Account = { id: string; phone: string; email: string | null };
    const variants = new Map([...new Set(phones)].map(phone => [phone, phoneLookupDigits(phone)]));
    const lookup = [...new Set([...variants.values()].flat())];
    const byDigits = new Map<string, Map<string, Account>>();
    // Bound SQL parameters for large imports; all results stay inside this transaction.
    for (let start = 0; start < lookup.length; start += 1000) {
      const chunk = lookup.slice(start, start + 1000);
      const candidates = await db.$queryRaw<Account[]>`
        SELECT id, phone, email FROM "User"
        WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (${Prisma.join(chunk)})
      `;
      for (const candidate of candidates) {
        const digits = candidate.phone.replace(/\D/g, '');
        const entries = byDigits.get(digits) ?? new Map<string, Account>();
        entries.set(candidate.id, candidate);
        byDigits.set(digits, entries);
      }
    }
    return new Map([...variants].map(([phone, digits]) => [phone,
      [...new Map(digits.flatMap(value => [...(byDigits.get(value)?.values() ?? [])])
        .map(candidate => [candidate.id, candidate])).values()],
    ]));
  }

  async getCommunicationChannel(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { communicationChannel: true },
    });
    if (!organization) throw new NotFoundException('Organisation not found');
    return organization;
  }

  async updateCommunicationChannel(organizationId: string, dto: UpdateCommunicationChannelDto) {
    return this.changeCommunicationChannel(organizationId, dto.communicationChannel);
  }

  async resetCommunicationChannel(organizationId: string) {
    // Also gate direct service calls, not just the HTTP route.
    if (process.env.EMS_DEMO_TOOLS !== 'true') throw new NotFoundException();
    return this.changeCommunicationChannel(organizationId, null, true);
  }

  private async changeCommunicationChannel(
    organizationId: string,
    communicationChannel: UpdateCommunicationChannelDto['communicationChannel'] | null,
    revalidateUnchanged = false,
  ) {
    return retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const current = await tx.organization.findUnique({
        where: { id: organizationId }, select: { communicationChannel: true },
      });
      if (!current) throw new NotFoundException('Organisation not found');
      if (current.communicationChannel === communicationChannel && !revalidateUnchanged) return current;

      await tx.organization.update({
        where: { id: organizationId }, data: { communicationChannel },
      });
      // One lock and transaction: never leave the new channel with old findings.
      const batches = await tx.emsOnboardingBatch.findMany({
        where: { organizationId, status: { notIn: ['CANCELLED', 'REGISTERED'] } },
        select: { id: true },
      });
      for (const batch of batches) {
        await this.validateOnboardingBatchLocked(tx, organizationId, batch.id);
      }
      return { communicationChannel };
    }, { timeout: 20000 }));
  }

  async updateOnboardingBatchCountry(
    organizationId: string, batchId: string, dto: UpdateOnboardingBatchCountryDto,
  ) {
    if (!getCountries().some((code) => code === dto.defaultPhoneCountry)) {
      throw new BadRequestException('Select a supported default country for phone numbers');
    }
    await retryOnboardingTransaction(() => this.prisma.$transaction(async (tx) => {
      await this.lockReporting(tx, organizationId);
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
      await this.validateOnboardingBatchLocked(tx, organizationId, batchId);
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async createOnboardingBatch(
    userId: string,
    organizationId: string,
    dto: CreateOnboardingBatchDto,
  ) {
    const batch = await this.prisma.emsOnboardingBatch.create({
      data: {
        organizationId,
        uploadedById: userId,
        label: dto.label,
        sourceFileName: dto.sourceFileName,
        defaultPhoneCountry: dto.defaultPhoneCountry,
      },
      select: BATCH_LIST_SELECT,
    });
    return { ...batch, statusCounts: emptyOnboardingStatusCounts() };
  }

  async listOnboardingBatches(organizationId: string) {
    // Read batch totals and the grouped breakdown from one snapshot. No reporting
    // write lock, validation, full-record loading or per-batch count query is needed.
    return this.prisma.$transaction(async tx => {
      const batches = await tx.emsOnboardingBatch.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: BATCH_LIST_SELECT,
      });
      if (!batches.length) return [];
      const grouped = await tx.emsOnboardingRecord.groupBy({
        by: ['batchId', 'status'],
        where: { organizationId, batchId: { in: batches.map(batch => batch.id) } },
        _count: { _all: true },
      });
      const counts = new Map(batches.map(batch => [batch.id, emptyOnboardingStatusCounts()]));
      for (const group of grouped) {
        const statusCounts = counts.get(group.batchId);
        if (statusCounts) statusCounts[group.status] = group._count._all;
      }
      return batches.map(batch => ({ ...batch, statusCounts: counts.get(batch.id)! }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** Serialize reporting writes within an organization, including cross-import pending links. */
  private async lockReporting(db: Prisma.TransactionClient, organizationId: string) {
    await db.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
  }

  private async reportingContext(db: Prisma.TransactionClient, organizationId: string, knownEmployees?: OnboardingEmployeeSnapshot[]) {
    const employees = knownEmployees ?? await this.reportingEmployees(db, organizationId);
    const pendingIds = employees.flatMap(e => e.pendingReportingRecordId ? [e.pendingReportingRecordId] : []);
    if (!pendingIds.length) return { employees, records: [] as ReportingRow[] };
    // Only imports referenced by a pending employee are needed as historical context.
    const referenced = await db.emsOnboardingRecord.findMany({
      where: { organizationId, id: { in: pendingIds } }, select: { batchId: true },
    });
    const batchIds = [...new Set(referenced.map(r => r.batchId))];
    const records = await db.emsOnboardingRecord.findMany({
      where: { organizationId, batchId: { in: batchIds } },
      select: {
        id: true, batchId: true, status: true, rowNumber: true, employeeId: true,
        firstName: true, middleName: true, lastName: true, employeeCode: true,
        currentDepartment: true, plantBranchCode: true, jobDesignation: true,
        reportingToName: true, reportingToDesignation: true,
        reportingToRecordId: true, reportingToEmployeeId: true, reportingToBoard: true, reportingToBody: true,
        batch: { select: { status: true } },
      },
    });
    return { employees, records };
  }

  private async reportingHierarchy(db: Prisma.TransactionClient, organizationId: string, rows: ReportingRow[], knownEmployees?: OnboardingEmployeeSnapshot[]) {
    const context = await this.reportingContext(db, organizationId, knownEmployees);
    return resolveReporting(rows, context.employees, context.records);
  }

  /** Runs in the same transaction that registers the selected manager or repairs their chain. */
  private async resolvePendingAssignments(db: Prisma.TransactionClient, organizationId: string) {
    await resolvePendingPeopleLinks(db, organizationId);
    const context = await this.reportingContext(db, organizationId);
    const hierarchy = resolveReporting(context.records, context.employees);
    for (const employee of context.employees) {
      if (!employee.pendingReportingRecordId) continue;
      const result = hierarchy.byEmployee[employee.id];
      if (!result || result.error || !result.target?.startsWith('employee:')) continue;
      const managerId = result.target.slice(9);
      if (managerId === employee.id) continue;
      // Conditional update is idempotent and cannot overwrite an HR replacement.
      await db.employee.updateMany({
        where: { id: employee.id, organizationId, pendingReportingRecordId: employee.pendingReportingRecordId,
          reportingManagerId: null, reportsToBoard: false, reportingBody: null },
        data: { reportingManagerId: managerId, pendingReportingRecordId: null },
      });
    }
  }

  private async reportingAssignmentData(db: Prisma.TransactionClient, organizationId: string, employeeId: string, target: string) {
    const context = await this.reportingContext(db, organizationId);
    if (!context.employees.some(e => e.id === employeeId)) throw new NotFoundException('Employee not found');
    if (!isReportingBody(target) && (!target.startsWith('employee:') || !context.employees.some(e => `employee:${e.id}` === target))) {
      throw new BadRequestException('Choose a top-level reporting body or an existing reporting manager in this organization');
    }
    const data = { reportingManagerId: isReportingBody(target) ? null : target.slice(9),
      reportsToBoard: target === 'BOARD', reportingBody: isReportingBody(target) && target !== 'BOARD' ? target : null, pendingReportingRecordId: null };
    const employees = context.employees.map(e => e.id === employeeId ? { ...e, ...data } : e);
    const resolved = resolveReporting(context.records, employees).byEmployee[employeeId];
    if (data.reportingManagerId === employeeId) throw new BadRequestException('A person cannot report to themselves');
    if (resolved.error) throw new BadRequestException(resolved.error);
    return data;
  }

  async getEmployeeReporting(employeeId: string, organizationId: string) {
    return this.prisma.$transaction(async tx => {
      const context = await this.reportingContext(tx, organizationId);
      if (!context.employees.some(e => e.id === employeeId)) throw new NotFoundException('Employee not found');
      const hierarchy = resolveReporting(context.records, context.employees);
      return {
        assignment: hierarchy.byEmployee[employeeId],
        options: hierarchy.options.filter(o => o.target.startsWith('employee:') && o.target !== `employee:${employeeId}`),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }

  async updateEmployeeReporting(employeeId: string, organizationId: string, target: string) {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const data = await this.reportingAssignmentData(tx, organizationId, employeeId, target);
      await tx.employee.update({ where: { id: employeeId, organizationId }, data });
      await this.resolvePendingAssignments(tx, organizationId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getEmployeeReporting(employeeId, organizationId);
  }

  private async reportingEmployees(db: Prisma.TransactionClient, organizationId: string) {
    return db.employee.findMany({
      where: { organizationId },
      select: {
        id: true, firstName: true, middleName: true, lastName: true, jobTitle: true,
        employeeCode: true, plantBranch: true, reportingManagerId: true,
        reportsToBoard: true, reportingBody: true, pendingReportingRecordId: true,
        department: { select: { name: true } },
      },
    });
  }

  /** One candidate index per validation/detail snapshot, scoped to the organisation. */
  private async duplicateContext(db: Prisma.TransactionClient, organizationId: string, knownEmployees?: OnboardingEmployeeSnapshot[]) {
    const employees = knownEmployees ?? await db.employee.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, middleName: true, lastName: true, employeeCode: true,
        phone: true, jobTitle: true, plantBranch: true, department: { select: { name: true } },
        emsOnboardingRecord: { select: { id: true } } },
    });
    const imports = await db.emsOnboardingRecord.findMany({
      where: { organizationId, status: { notIn: ['REGISTERED', 'EXCLUDED'] },
        batch: { organizationId, status: { not: 'CANCELLED' } } },
      select: { id: true, batchId: true, rowNumber: true, firstName: true, middleName: true, lastName: true,
        employeeCode: true, mobileNumber: true, currentDepartment: true, jobDesignation: true, plantBranchCode: true,
        batch: { select: { defaultPhoneCountry: true, label: true, sourceFileName: true } } },
    });
    return createDuplicateIndex(organizationId, [
      ...employees.map(raw => {
        const e = cleanRecord(raw);
        return { organizationId, kind: 'EMPLOYEE' as const, id: e.id, originRecordId: e.emsOnboardingRecord?.id,
          firstName: e.firstName, middleName: e.middleName, lastName: e.lastName, employeeCode: e.employeeCode,
          canonicalPhone: storedPhone(e.phone), department: e.department?.name, designation: e.jobTitle, branch: e.plantBranch };
      }),
      ...imports.map(row => ({ ...duplicateImportPerson(row, organizationId, row.batch.defaultPhoneCountry),
        batchLabel: row.batch.label, sourceFileName: row.batch.sourceFileName })),
    ]);
  }

  async confirmOnboardingDifferentPerson(organizationId: string, recordId: string, userId: string, token: string) {
    if (!userId?.trim()) throw new ForbiddenException('An authenticated reviewer is required');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BadRequestException('A current review token is required');
    const batchId = await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const record = await tx.emsOnboardingRecord.findFirst({
        where: { id: recordId, organizationId, batch: { organizationId } }, include: { batch: true },
      });
      if (!record) throw new NotFoundException('Onboarding record not found');
      if (record.batch.status === 'CANCELLED' || ['REGISTERED', 'EXCLUDED'].includes(record.status))
        throw new BadRequestException('Only an active unregistered record can be reviewed');
      const index = await this.duplicateContext(tx, organizationId);
      const review = index.review(duplicateImportPerson(record, organizationId, record.batch.defaultPhoneCountry));
      if (review.hardConflicts.length) throw new BadRequestException('Correct employee-code and personal-mobile conflicts before confirming different people');
      if (!review.possibleMatches.length || review.token !== token)
        throw new ConflictException('The record or matching people changed. Refresh and review the current matches before confirming.');
      await tx.emsOnboardingRecord.update({ where: { id: recordId }, data: {
        duplicateReviewReceipt: { version: 1, token, confirmedByUserId: userId, confirmedAt: new Date().toISOString() },
      } });
      await this.validateOnboardingBatchLocked(tx, organizationId, record.batchId);
      return record.batchId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async undoOnboardingDifferentPerson(organizationId: string, recordId: string, userId: string, token: string) {
    if (!userId?.trim()) throw new ForbiddenException('An authenticated reviewer is required');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BadRequestException('A current confirmation token is required');
    const batchId = await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const record = await tx.emsOnboardingRecord.findFirst({
        where: { id: recordId, organizationId, batch: { organizationId } }, include: { batch: true },
      });
      if (!record) throw new NotFoundException('Onboarding record not found');
      if (record.batch.status === 'CANCELLED' || ['REGISTERED', 'EXCLUDED'].includes(record.status))
        throw new BadRequestException('Only an active unregistered record can have its confirmation undone');
      const receipt = record.duplicateReviewReceipt;
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.token !== token)
        throw new ConflictException('The confirmation changed. Refresh the record before undoing it.');
      await tx.emsOnboardingRecord.update({ where: { id: recordId }, data: { duplicateReviewReceipt: Prisma.DbNull } });
      await this.validateOnboardingBatchLocked(tx, organizationId, record.batchId);
      return record.batchId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async getOnboardingBatch(organizationId: string, batchId: string) {
    return this.prisma.$transaction(async tx => {
      const timing = onboardingPerformance('detail', organizationId, batchId);
      const batch = await tx.emsOnboardingBatch.findFirst({
        where: { id: batchId, organizationId },
        include: {
          uploadedBy: { select: { id: true, name: true } },
          records: { orderBy: { rowNumber: 'asc' } },
        },
      });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      timing.mark('batchRead');
      const context = onboardingReadContext(tx, organizationId);
      const employees = await context.employees();
      timing.mark('employeesRead');
      const hierarchy = await this.reportingHierarchy(tx, organizationId, batch.records, employees);
      timing.mark('hierarchy');
      const active = batch.status !== 'CANCELLED' && batch.records.some(r => !['REGISTERED', 'EXCLUDED'].includes(r.status));
      const index = active ? await this.duplicateContext(tx, organizationId, employees) : null;
      timing.mark('duplicateContext');
      const records = batch.records.map(record => refreshedDuplicateRecord(record,
        index && !['REGISTERED', 'EXCLUDED'].includes(record.status)
          ? index.review(duplicateImportPerson(record, organizationId, batch.defaultPhoneCountry), record.duplicateReviewReceipt) : null));
      timing.mark('duplicateReview');
      const departments = await context.departments();
      const peopleLinks = await loadPeopleLinks(tx, organizationId, batch.records, { employees, departments });
      timing.mark('peopleLinks');
      for (const record of records) {
        if (['REGISTERED', 'EXCLUDED'].includes(record.status) || batch.status === 'CANCELLED') continue;
        const old = Array.isArray(record.validationErrors)
          ? record.validationErrors
          : [];

        const isPeopleLinkFinding = (f: unknown): boolean =>
          f !== null &&
          typeof f === 'object' &&
          !Array.isArray(f) &&
          'code' in f &&
          f.code === 'PEOPLE_LINK';

        const findings = [
          ...old.filter(f => !isPeopleLinkFinding(f) && !(f && typeof f === 'object' && !Array.isArray(f) && 'field' in f && ['firstName', 'lastName'].includes(String(f.field)))),
          ...(['firstName', 'lastName'] as const).flatMap(field => {
            const value = cleanRecord(record)[field];
            const message = isNotApplicable(value) ? notApplicableMessage(field) : onboardingNameIssue(value);
            return message ? [{ field, message }] : [];
          }),
          ...peopleLinkFindings(peopleLinks.byRecord[record.id]),
        ];

        if (
          record.status === 'READY' ||
          (record.status === 'NEEDS_FIXING' && old.some(isPeopleLinkFinding))
        ) {
          record.status = findings.length ? 'NEEDS_FIXING' : 'READY';
        }

        record.validationErrors = findings.length ? findings : null;
      }
      const byId = new Map(records.map(r => [r.id, r]));
      const pending = records.filter(r => !['REGISTERED', 'EXCLUDED'].includes(r.status));
      const status = batch.status === 'CANCELLED' ? batch.status
        : records.some(r => r.status === 'REGISTERED') ? pending.length ? 'PARTIALLY_REGISTERED' : 'REGISTERED'
        : pending.length && pending.every(r => r.status === 'READY') ? 'READY' : 'DRAFT';
      const result = { ...batch, status, fieldOptions: onboardingFieldOptions(departments, employees, batch.records), records: hierarchy.orderedIds.map(id => byId.get(id)!), hierarchy, peopleLinks: { options: peopleLinks.options, byRecord: peopleLinks.byRecord, hodDirectory: peopleLinks.hodDirectory, hodEvidence: peopleLinks.hodEvidence } };
      timing.mark('responseAssembly');
      timing.finish(records.length);
      return result;

    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }

  private checkedExtraFields(input: unknown, previous?: {stored: unknown}) {
    try { return previous ? reviseExtraFields(previous.stored, input) : readExtraFields(input); }
    catch (error) {
      if (error instanceof ExtraFieldsError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  async addOnboardingRecords(
    organizationId: string,
    batchId: string,
    dto: AddOnboardingRecordsDto,
  ) {
    await this.addOnboardingRecordsAck(organizationId, batchId, dto);
    return this.getOnboardingBatch(organizationId, batchId);
  }

  /** Import-only acknowledgement, returned after the upload transaction commits. */
  async addOnboardingRecordsAck(
    organizationId: string,
    batchId: string,
    dto: AddOnboardingRecordsDto,
  ): Promise<{ id: string }> {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const batch = await tx.emsOnboardingBatch.findFirst({ where: { id: batchId, organizationId }, select: { id: true, status: true } });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      if (['REGISTERED', 'CANCELLED'].includes(batch.status)) throw new BadRequestException('This import is closed');
      await tx.emsOnboardingRecord.createMany({
        data: dto.records.map(record => ({
          ...Object.fromEntries(ONBOARDING_TEXT_FIELDS.filter(key => record[key] !== undefined).map(key => [key, record[key]])),
          ...(record.extraFields === undefined ? {} : { extraFields: this.checkedExtraFields(record.extraFields) }),
          rowNumber: record.rowNumber, batchId, organizationId,
          status: 'DRAFT' as const, duplicateReviewReceipt: Prisma.DbNull,
        })),
      });
      await tx.emsOnboardingBatch.update({ where: { id: batchId }, data: {
        status: batch.status === 'PARTIALLY_REGISTERED' ? 'PARTIALLY_REGISTERED' : 'DRAFT',
      } });
    }));

    return { id: batchId };
  }
  async validateOnboardingBatch(organizationId: string, batchId: string) {
    await this.validateOnboardingBatchAck(organizationId, batchId);
    return this.getOnboardingBatch(organizationId, batchId);
  }

  /** Completion means checks were saved; rows may still need fixing. */
  async validateOnboardingBatchAck(organizationId: string, batchId: string): Promise<{ id: string }> {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await this.validateOnboardingBatchLocked(tx, organizationId, batchId);
    }, { timeout: 20000 }));
    return { id: batchId };
  }

  private async validateOnboardingBatchLocked(db: Prisma.TransactionClient, organizationId: string, batchId: string) {
    const timing = onboardingPerformance('validation', organizationId, batchId);
    const batch = await db.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      include: { records: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');

    if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { communicationChannel: true },
    });
    const channel = organization?.communicationChannel ?? null;
    timing.mark('batchAndChannel');
    // This context is created after the caller's edits. It never survives a write/retry.
    const context = onboardingReadContext(db, organizationId);
    const existing = await context.employees();
    const takenCodes  = new Set(existing.map((e) => normaliseKey(e.employeeCode)).filter(Boolean));

    const departments = await context.departments();
    timing.mark('employeesAndDepartments');
    const knownDepartments = departmentIndex(departments);

    // Codes seen within this batch, to detect internal duplicates
    const seenCodes = new Set<string>();

    // Count equivalent phone numbers across all non-excluded rows.
    const phoneCounts = new Map<string, number>();

    for (const raw of batch.records) {
      if (raw.status === 'EXCLUDED') continue;
      const record = cleanRecord(raw);

      const phone = normalisePhone(
        record.mobileNumber,
        batch.defaultPhoneCountry,
      );

      if (phone) {
        phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      }
    }

    const identityPhones = batch.records.flatMap(raw => {
      if (raw.status === 'EXCLUDED' || raw.status === 'REGISTERED') return [];
      const phone = normalisePhone(cleanRecord(raw).mobileNumber, batch.defaultPhoneCountry);
      return phone && phoneCounts.get(phone) === 1 ? [phone] : [];
    });
    const accountCandidates = await this.onboardingAccountCandidates(db, identityPhones);

    timing.mark('phonesAndAccounts');
    const hierarchy = await this.reportingHierarchy(db, organizationId, batch.records, existing);
    timing.mark('hierarchy');
    const duplicateIndex = await this.duplicateContext(db, organizationId, existing);
    timing.mark('duplicateContext');
    const peopleLinks = await loadPeopleLinks(db, organizationId, batch.records, { employees: existing, departments });
    timing.mark('peopleLinks');
    const reportingOptions = new Map(hierarchy.options.map(option => [option.target, option]));
    let readyCount = 0, changedRows = 0;

    const requiredContact =
      channel === 'WHATSAPP' ? 'whatsappNumber' : channel === 'EMAIL' ? 'workEmail' : null;
    const requiredNow: string[] = [...REQUIRED_RECORD_FIELDS, ...(requiredContact ? [requiredContact] : [])];

    for (const raw of batch.records) {
      if (raw.status === 'EXCLUDED' || raw.status === 'REGISTERED') continue;
      const record = cleanRecord(raw);
      const resolution = hierarchy.byRecord[record.id];
      const selected = resolution?.target ? reportingOptions.get(resolution.target) : undefined;
      if (isReportingBody(resolution?.target)) {
        record.reportingToName = null;
        record.reportingToDesignation = reportingBodyLabel(resolution.target);
      } else if (selected && !resolution.error) {
        record.reportingToName = selected.name;
        record.reportingToDesignation = selected.designation;
      }
      const values = record as unknown as Record<string, string | null>;

      // N/A in a required field gets its own message (added below), replacing any other finding for it.
      const naFields = new Set(requiredNow.filter((field) => isNotApplicable(values[field])));

      // N/A in an optional field simply means "does not apply", so skip its format check.
      for (const field of FORMAT_CHECKED_OPTIONAL_FIELDS) {
        if (!requiredNow.includes(field) && isNotApplicable(values[field])) values[field] = null;
      }

      const findings: ValidationFinding[] = [...extraProfileData(record.extraFields, value => normalisePhone(value, batch.defaultPhoneCountry)).findings];

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

      for (const field of ['firstName', 'lastName'] as const) {
        const message = onboardingNameIssue(record[field]);
        if (message) findings.push({ field, message });
      }
      
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
            db, organizationId, phone, existing, accountCandidates.get(phone) ?? [],
          );
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          findings.push({ field: 'mobileNumber', message: error.message });
        }
      }

      if (record.gender?.trim() && !GENDER_VALUES[normaliseKey(record.gender)]) {
        findings.push({ field: 'gender', message: `Unrecognised value "${record.gender}"` });
      }

      if (record.employmentStatus?.trim() && !matchEnumValue(record.employmentStatus, EMPLOYMENT_STATUS_VALUES)) {
        findings.push({ field: 'employmentStatus', message: `Unrecognised value "${record.employmentStatus}"` });
      }

      if (record.employmentType?.trim() && !matchEnumValue(record.employmentType, EMPLOYMENT_TYPE_VALUES)) {
        findings.push({ field: 'employmentType', message: `Unrecognised value "${record.employmentType}"` });
      }

      if (!record.beesAccessLevel?.trim()) {
        findings.push({ field: 'beesAccessLevel', message: 'Required' });
      } else if (!importedAccountRole(record.beesAccessLevel)) {
        findings.push({
          field: 'beesAccessLevel',
          message: `Unrecognised access level "${record.beesAccessLevel}"`,
        });
      }

      const departmentError = departmentIssue(record.currentDepartment, knownDepartments);
      if (departmentError) findings.push({ field: 'currentDepartment', message: departmentError });

      if (record.workEmail?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.workEmail.trim())) {
        findings.push({
          field: 'workEmail',
          message: `"${record.workEmail}" is not a valid email address`,
        });
      }

       const whatsapp = normalisePhone(record.whatsappNumber, batch.defaultPhoneCountry);
      if (!record.whatsappNumber?.trim()) {
        if (channel === 'WHATSAPP') {
          findings.push({
            field: 'whatsappNumber',
            message: 'A WhatsApp number is required because your organisation communicates by WhatsApp',
          });
        }
      } else if (!whatsapp) {
        findings.push({
          field: 'whatsappNumber',
          message: 'Enter a valid WhatsApp number for the selected country, or use + followed by the country code and number.',
        });
      }

      if (channel === 'EMAIL' && !record.workEmail?.trim()) {
        findings.push({
          field: 'workEmail',
          message: 'An email address is required because your organisation communicates by email',
        });
      }

      
      if (normaliseFiveSLocation(record.fiveSLocationCategory) === undefined)
        findings.push({field: 'fiveSLocationCategory', message: FIVE_S_LOCATION_ERROR});
      if (!record.jobDesignation?.trim()) {
        findings.push({ field: 'jobDesignation', message: 'Required' });
      }

      // A resolved top-level body is a valid alternative to a named manager.
      const reportsToBody = isReportingBody(resolution?.target) && !resolution.error;
      if (!record.reportingToName?.trim() && !reportsToBody) {
        findings.push({
          field: 'reportingToName',
          message: 'Choose a reporting person, or leave the name blank and use Board, Committee, Management Committee or Owner in the Reporting to job title field.',
        });
      }
      if (!record.reportingToDesignation?.trim() && !reportsToBody) {
        findings.push({field: 'reportingToDesignation', message: 'Required' });
      }
      
      if (resolution?.error && !findings.some(f => f.field === 'reportingToName' || f.field === 'reportingToDesignation')) findings.push({ field: 'reportingToName', message: resolution.error });

      for (const field of naFields) {
        for (let i = findings.length - 1; i >= 0; i--) {
          if (findings[i].field === field) findings.splice(i, 1);
        }
        findings.push({ field, message: notApplicableMessage(field) });
      }

      const duplicateErrors = duplicateFindings(duplicateIndex.review(
        duplicateImportPerson(raw, organizationId, batch.defaultPhoneCountry), raw.duplicateReviewReceipt));
      for (const duplicate of duplicateErrors) {
        // Replace the older exact-clash message, retaining a single actionable finding per identity field.
        for (let i = findings.length - 1; i >= 0; i--) {
          if (findings[i].field === duplicate.field && [
            'Already used by an existing employee', 'Duplicated within this import',
            'This phone number appears on another record in this import',
            'This phone number is already used by an employee in this company',
          ].includes(findings[i].message)) findings.splice(i, 1);
        }
        findings.push(duplicate);
      }
      findings.push(...peopleLinkFindings(peopleLinks.byRecord[record.id]));
      const status = findings.length > 0 ? 'NEEDS_FIXING' : 'READY';
      if (status === 'READY') readyCount++;

      // JSONB object-key order is not meaningful. Avoid rewriting identical results
      // (and changing updatedAt) when validation finds nothing new.
      if (raw.status !== status || validationJson(raw.validationErrors ?? null) !== validationJson(findings.length ? findings : null)) {
        changedRows++;
        await db.emsOnboardingRecord.update({
          where: { id: record.id, organizationId, batchId },
          data: { status, validationErrors: findings.length > 0 ? findings : Prisma.DbNull },
        });
      }
    }

    timing.mark('rowChecksAndWrites');
    const pending = batch.records.filter(
      (r) => r.status !== 'EXCLUDED' && r.status !== 'REGISTERED',
    ).length;

    await db.emsOnboardingBatch.update({
      where: { id: batchId },
      data: {
        status: batch.records.some((r) => r.status === 'REGISTERED')
          ? (pending === 0 ? 'REGISTERED' : 'PARTIALLY_REGISTERED')
          : (readyCount === pending && pending > 0 ? 'READY' : 'DRAFT'),
      },
    });

    timing.mark('batchStatusWrite');
    timing.finish(batch.records.length, changedRows);
    return;
  }

  async updateOnboardingRecord(organizationId: string, recordId: string, dto: UpdateOnboardingRecordDto) {
    const record = await this.prisma.emsOnboardingRecord.findFirst({
      where: { id: recordId, organizationId }, select: { batchId: true },
    });
    if (!record) throw new NotFoundException('Onboarding record not found');
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await tx.$queryRaw`SELECT id FROM "EmsOnboardingBatch"
        WHERE id = ${record.batchId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const batch = await tx.emsOnboardingBatch.findFirst({
        where: { id: record.batchId, organizationId }, include: { records: true },
      });
      const found = batch?.records.find(r => r.id === recordId);
      if (!batch || !found || batch.status === 'CANCELLED') throw new BadRequestException('This import is unavailable or cancelled');
      if (found.status === 'REGISTERED') throw new BadRequestException('This record has already been registered');
      // Excluded rows skip validation, so edits would be stored unchecked. Put back first.
      if (found.status === 'EXCLUDED') throw new BadRequestException('This record is excluded. Put it back in before editing it.');
      const data: Record<string, string | boolean | null> = {};
      for (const key of ONBOARDING_TEXT_FIELDS) {
        const value = dto[key];
        if (value === undefined) continue;
        data[key] = value === null || value.trim() === '' ? null : value.trim();
      }
      if ((['currentDepartment', 'plantBranchCode', 'hodName', 'hodDesignation'] as const).some(key => key in data && data[key] !== found[key])) data.hodReviewKey = null;
      Object.assign(data, await relieverDraftData(tx, organizationId, batch.records, found, dto));
      const textChanged = ('reportingToName' in data && data.reportingToName !== found.reportingToName)
        || ('reportingToDesignation' in data && data.reportingToDesignation !== found.reportingToDesignation);
      if (dto.reportingTarget !== undefined || textChanged) {
        data.reportingToRecordId = null;
        data.reportingToEmployeeId = null;
        data.reportingToBoard = false;
        data.reportingToBody = null;
      }
      if (dto.reportingTarget) {
        const employees = await this.reportingEmployees(tx, organizationId);
        const options = resolveReporting(batch.records, employees).options;
        const target = dto.reportingTarget;
        if (isReportingBody(target)) {
          data.reportingToBoard = target === 'BOARD'; data.reportingToBody = target === 'BOARD' ? null : target;
          data.reportingToName = null; data.reportingToDesignation = reportingBodyLabel(target);
        } else {
          const selected = options.find(o => o.target === target);
          if (!selected || target === `record:${recordId}`) throw new BadRequestException('Choose another person in this organization/import');
          data[target.startsWith('record:') ? 'reportingToRecordId' : 'reportingToEmployeeId'] = target.slice(target.indexOf(':') + 1);
          data.reportingToName = selected.name;
          data.reportingToDesignation = selected.designation;
        }
      }
      await tx.emsOnboardingRecord.update({
        where: { id: recordId },
        data: { ...data, ...(dto.extraFields === undefined ? {} : { extraFields: this.checkedExtraFields(dto.extraFields, {stored: found.extraFields}) }), status: 'DRAFT', validationErrors: Prisma.DbNull },
      });
      await this.validateOnboardingBatchLocked(tx, organizationId, record.batchId);
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, record.batchId);
  }

  async excludeOnboardingRecord(organizationId: string, recordId: string, dto: ExcludeOnboardingRecordDto) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('An exclusion reason is required');
    if (reason.length < 5) throw new BadRequestException('Exclusion reason must contain at least 5 characters');
    const batchId = await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const record = await tx.emsOnboardingRecord.findFirst({
        where: { id: recordId, organizationId }, select: { id: true, batchId: true, status: true },
      });
      if (!record) throw new NotFoundException('Onboarding record not found');
      if (record.status === 'REGISTERED') throw new BadRequestException('This record has already been registered');
      await tx.emsOnboardingRecord.update({ where: { id: recordId },
        data: { status: 'EXCLUDED', exclusionReason: reason, validationErrors: Prisma.DbNull } });
      // Pending employee references are preserved: their computed status becomes NEEDS_ATTENTION.
      await this.validateOnboardingBatchLocked(tx, organizationId, record.batchId);
      return record.batchId;
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async includeOnboardingRecord(organizationId: string, recordId: string) {
    const batchId = await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const record = await tx.emsOnboardingRecord.findFirst({
        where: { id: recordId, organizationId }, select: { id: true, batchId: true, status: true },
      });
      if (!record) throw new NotFoundException('Onboarding record not found');
      if (record.status !== 'EXCLUDED') throw new BadRequestException('Only excluded records can be restored');
      await tx.emsOnboardingRecord.update({ where: { id: recordId }, data: { status: 'DRAFT', exclusionReason: null } });
      await this.validateOnboardingBatchLocked(tx, organizationId, record.batchId);
      return record.batchId;
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  /**
   * What "Exclude remaining records" would do to a partially registered import:
   * counts, pending people links that would point at excluded records, and a token
   * identifying exactly which records were reviewed.
   */
  private async excludeRemainingPlan(db: Prisma.TransactionClient, organizationId: string, batchId: string) {
    const batch = await db.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId },
      select: { id: true, status: true,
        records: { select: { id: true, status: true, firstName: true, lastName: true, employeeCode: true } } },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
    const remainingIds = batch.records.filter(r => isRemainingRecord(r.status)).map(r => r.id);
    if (!batch.records.some(r => r.status === 'REGISTERED')) {
      throw new BadRequestException('No employees from this import are registered yet. Cancel the import instead.');
    }
    if (!remainingIds.length) throw new BadRequestException('Every record in this import is already registered or excluded.');
    // Record ids are already organization-scoped; employees are also filtered by organization.
    const [employees, hods] = await Promise.all([
      db.employee.findMany({
        where: { organizationId, OR: [
          { pendingReportingRecordId: { in: remainingIds } },
          { pendingFirstRelieverRecordId: { in: remainingIds } },
          { pendingSecondRelieverRecordId: { in: remainingIds } },
        ] },
        select: { id: true, firstName: true, lastName: true,
          pendingReportingRecordId: true, pendingFirstRelieverRecordId: true, pendingSecondRelieverRecordId: true },
      }),
      db.emsDepartmentHod.findMany({
        where: { pendingRecordId: { in: remainingIds } },
        select: { pendingRecordId: true, branchLabel: true, department: { select: { name: true } } },
      }),
    ]);
    return { preview: buildExcludeRemainingPreview(batch.id, batch.records, employees, hods), remainingIds };
  }

  /** Remembered destination for each heading, in the same order; null where nothing is remembered. */
  async lookupImportColumnChoices(organizationId: string, dto: LookupImportColumnChoicesDto) {
    const keys = dto.headings.map(columnHeadingKey);
    const wanted = [...new Set(keys.filter(Boolean))];
    const rows = wanted.length ? await this.prisma.emsImportColumnChoice.findMany({
      where: { organizationId, headingKey: { in: wanted } }, select: { headingKey: true, destination: true },
    }) : [];
    const byKey = new Map(rows.map(row => [row.headingKey, row.destination]));
    return { choices: keys.map(key => (key && byKey.get(key)) || null) };
  }

  /** Remember HR's confirmed choices. Called after an import's rows are saved; last choice per heading wins. */
  async saveImportColumnChoices(organizationId: string, userId: string, dto: SaveImportColumnChoicesDto) {
    const choices = normaliseColumnChoices(dto.choices);
    if (choices.length) await this.prisma.$transaction(choices.map(choice => this.prisma.emsImportColumnChoice.upsert({
      where: { organizationId_headingKey: { organizationId, headingKey: choice.headingKey } },
      create: { organizationId, ...choice, updatedById: userId },
      update: { heading: choice.heading, destination: choice.destination, updatedById: userId },
    })));
    return { saved: choices.length };
  }

  /**
   * Send one extra column to a profile field (or keep it for reference) for every
   * unregistered, non-excluded record in the import, then re-validate. Registered
   * employees keep what they had. The choice is also remembered for future imports.
   */
  async setOnboardingColumnDestination(organizationId: string, batchId: string, userId: string, dto: SetOnboardingColumnDestinationDto) {
    const target = dto.target ?? null;
    if (target !== null && !isExtraProfileField(target)) throw new BadRequestException('Choose a supported profile field or keep this for reference');
    const heading = dto.heading ?? '';
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await tx.$queryRaw`SELECT id FROM "EmsOnboardingBatch" WHERE id = ${batchId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const batch = await tx.emsOnboardingBatch.findFirst({
        where: { id: batchId, organizationId },
        select: { status: true, records: { select: { id: true, status: true, extraFields: true } } },
      });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
      let changed = 0;
      for (const record of batch.records) {
        if (record.status === 'REGISTERED' || record.status === 'EXCLUDED') continue;
        let fields;
        // A record with unreadable extra data keeps its validation finding; it is not rewritten here.
        try { fields = readExtraFields(record.extraFields); } catch (error) { if (error instanceof ExtraFieldsError) continue; throw error; }
        const index = fields.findIndex(field => field.column === dto.column && field.heading === heading);
        if (index < 0) continue;
        if (fields[index].target !== target) {
          fields[index] = { ...fields[index], target: target as (typeof fields)[number]['target'] };
          await tx.emsOnboardingRecord.update({ where: { id: record.id },
            data: { extraFields: fields as unknown as Prisma.InputJsonValue, validationErrors: Prisma.DbNull } });
        }
        changed++;
      }
      if (!changed) throw new BadRequestException('No unregistered records in this import have that column.');
      await this.validateOnboardingBatchLocked(tx, organizationId, batchId);
      const key = columnHeadingKey(heading);
      if (key) await tx.emsImportColumnChoice.upsert({
        where: { organizationId_headingKey: { organizationId, headingKey: key } },
        create: { organizationId, headingKey: key, heading: heading.trim().slice(0, 200), destination: target ? `profile:${target}` : 'extra', updatedById: userId },
        update: { heading: heading.trim().slice(0, 200), destination: target ? `profile:${target}` : 'extra', updatedById: userId },
      });
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async previewExcludeRemainingOnboardingRecords(organizationId: string, batchId: string) {
    const { preview } = await this.prisma.$transaction(tx => this.excludeRemainingPlan(tx, organizationId, batchId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
    return preview;
  }

  /**
   * Exclude every unregistered record of a partially registered import in one step.
   * Registered employees, their import history and their pending links are kept;
   * links to excluded records show Needs attention, as with a single exclusion.
   */
  async excludeRemainingOnboardingRecords(organizationId: string, batchId: string, dto: ExcludeRemainingOnboardingRecordsDto) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('An exclusion reason is required');
    if (reason.length < 5) throw new BadRequestException('Exclusion reason must contain at least 5 characters');
    if (reason.length > 300) throw new BadRequestException('Exclusion reason must contain at most 300 characters');
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const { preview, remainingIds } = await this.excludeRemainingPlan(tx, organizationId, batchId);
      if (preview.token !== dto.expectedToken) {
        throw new ConflictException('This import changed after you reviewed it. Review the records to exclude again before confirming.');
      }
      await tx.emsOnboardingRecord.updateMany({
        where: { id: { in: remainingIds }, batchId, organizationId, status: { notIn: ['REGISTERED', 'EXCLUDED'] } },
        data: { status: 'EXCLUDED', exclusionReason: reason, validationErrors: Prisma.DbNull },
      });
      await this.validateOnboardingBatchLocked(tx, organizationId, batchId);
    }, { timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async registerOnboardingBatch(organizationId: string, batchId: string, actorRole: Role) {
    if (!canRegisterOnboarding(actorRole)) throw new ForbiddenException('Only HR or an Admin can register imported employees.');
    const batch = await this.prisma.emsOnboardingBatch.findFirst({
      where: { id: batchId, organizationId }, include: { records: true },
    });
    if (!batch) throw new NotFoundException('Onboarding batch not found');
    if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
    const initialHierarchy = await this.reportingHierarchy(this.prisma, organizationId, batch.records);
    const initialDuplicates = await this.duplicateContext(this.prisma, organizationId);
    const byId = new Map(batch.records.map(record => [record.id, refreshedDuplicateRecord(record,
      !['REGISTERED', 'EXCLUDED'].includes(record.status) ? initialDuplicates.review(
        duplicateImportPerson(record, organizationId, batch.defaultPhoneCountry), record.duplicateReviewReceipt) : null)]));
    const persistedReady = new Set(batch.records.filter(r => r.status === 'READY').map(r => r.id));
    const ready = initialHierarchy.orderedIds.map(id => byId.get(id)!).filter(r => r.status === 'READY' || persistedReady.has(r.id));
    if (!ready.length) throw new BadRequestException('No records are ready to register');

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { communicationChannel: true },
    });
    if (!organization?.communicationChannel) {
      throw new BadRequestException(
        "Choose your organisation's communication channel (WhatsApp or email) before registering",
      );
    }

    const roles = await this.prisma.role.findMany({ select: { id: true, name: true } });
    const roleIds = new Map(roles.map((r) => [r.name, r.id]));
    const results: { recordId: string; employeeId?: string; error?: string }[] = [];
    let interruption: string | null = null;
    const awaitingAdmin = new Set<string>();

    for (const candidate of ready) {
      if (registrationAccess(actorRole, candidate.beesAccessLevel) === 'ADMIN_REQUIRED') {
        awaitingAdmin.add(candidate.id);
        continue;
      }
      try {
        const employee = await retryOnboardingTransaction(() => this.prisma.$transaction(async (tx) => {
          await this.lockReporting(tx, organizationId);
          const lockedOrganization = await tx.organization.findUnique({
            where: { id: organizationId }, select: { communicationChannel: true },
          });
          if (!lockedOrganization?.communicationChannel ||
              lockedOrganization.communicationChannel !== organization.communicationChannel) {
            throw new OnboardingChannelChangedError(
              'The communication channel changed. Choose a channel if needed, then validate the import and try again.',
            );
          }
          // Serialize registration and country changes for this batch.
          await tx.$queryRaw`SELECT id FROM "EmsOnboardingBatch"
            WHERE id = ${batchId} AND "organizationId" = ${organizationId} FOR UPDATE`;
          const current = await tx.emsOnboardingBatch.findFirst({
            where: { id: batchId, organizationId }, include: { records: true },
          });
          if (!current || current.status === 'CANCELLED') {
            throw new BadRequestException('This import is unavailable or cancelled');
          }
          const found = current.records.find((r) => r.id === candidate.id);
          if (found && ['REGISTERED', 'EXCLUDED'].includes(found.status)) return null;
          if (!found || !['READY', 'NEEDS_FIXING'].includes(found.status)) {
            throw new BadRequestException('This record is no longer ready; validate the import again');
          }
          const record = cleanRecord(found);
          // Recheck the locked row: another reviewer may have changed its access
          // after the initial batch read. This happens before account/employee writes.
          if (registrationAccess(actorRole, record.beesAccessLevel) === 'ADMIN_REQUIRED')
            throw new OnboardingAdminRegistrationRequired();
          const additional = extraProfileData(found.extraFields, value => normalisePhone(value, current.defaultPhoneCountry));
          if (additional.findings.length) throw new OnboardingFieldConflict(additional.findings);
          const fiveSCategory = normaliseFiveSLocation(record.fiveSLocationCategory);
          if (fiveSCategory === undefined) throw new OnboardingFieldConflict([{field: 'fiveSLocationCategory', message: FIVE_S_LOCATION_ERROR}]);
          const nameFindings: { field: string; message: string }[] = [];
          for (const field of ['firstName', 'lastName'] as const) {
            const problem = isNotApplicable(record[field]) ? notApplicableMessage(field) : onboardingNameIssue(record[field]);
            if (problem) nameFindings.push({field, message: problem});
          }
          if (nameFindings.length) throw new OnboardingFieldConflict(nameFindings);
          const duplicateIndex = await this.duplicateContext(tx, organizationId);
          const duplicateReview = duplicateIndex.review(
            duplicateImportPerson(found, organizationId, current.defaultPhoneCountry), found.duplicateReviewReceipt);
          if (duplicateReview.blocked) throw new OnboardingDuplicateConflict(duplicateFindings(duplicateReview));
          if (refreshedDuplicateRecord(found, duplicateReview).status !== 'READY')
            throw new BadRequestException('This record is no longer ready; validate the import again');
          const hierarchy = await this.reportingHierarchy(tx, organizationId, current.records);
          const reporting = hierarchy.byRecord[record.id];
          if (!reporting || reporting.error || !reporting.target) throw new BadRequestException(reporting?.error ?? 'Choose a reporting person or top-level body');
          let reportingManagerId: string | null = null;
          let pendingReportingRecordId: string | null = null;
          if (reporting.target.startsWith('employee:')) reportingManagerId = reporting.target.slice(9);
          else if (reporting.target.startsWith('record:')) {
            const manager = current.records.find(r => r.id === reporting.target!.slice(7));
            if (!manager || manager.status === 'EXCLUDED') throw new BadRequestException('The selected manager is unavailable');
            if (manager.status === 'REGISTERED' && manager.employeeId) reportingManagerId = manager.employeeId;
            else pendingReportingRecordId = manager.id; // The reporting graph was checked above; only the employee link is pending.
          }

          const peopleContext = await loadPeopleLinks(tx, organizationId, current.records);
          const currentDepartments = departmentIndex(peopleContext.departments);
          const departmentError = departmentIssue(record.currentDepartment, currentDepartments);
          if (departmentError) throw new OnboardingFieldConflict([{ field: 'currentDepartment', message: departmentError }]);
          const departmentId = currentDepartments.get(normaliseKey(record.currentDepartment))![0].id;
          const personLinks = registrationPeopleData(peopleContext.byRecord[record.id]);
          const phone = normalisePhone(record.mobileNumber, current.defaultPhoneCountry);
          if (!phone) throw new BadRequestException('Enter a valid phone number and check the default country');
          const duplicates = current.records.filter((r) =>
            r.status !== 'EXCLUDED' &&
            normalisePhone(r.mobileNumber, current.defaultPhoneCountry) === phone,
          );
          if (duplicates.length > 1) {
            throw new BadRequestException('This phone number appears on another record in this import');
          }
          const roleName = importedAccountRole(record.beesAccessLevel);
          const roleId = roleName ? roleIds.get(roleName) : undefined;
          if (!roleId) throw new BadRequestException('The selected access level is not configured');
          // N/A is a valid answer, but never an address to send to.
          const email = isNotApplicable(record.workEmail) ? null : record.workEmail?.toLowerCase() ?? null;
          let user = await this.checkOnboardingIdentity(tx, organizationId, phone);
          if (!user) {
            user = await tx.user.create({
              data: { phone, name: [record.firstName, record.lastName].filter(Boolean).join(' ') },
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
              reportingManagerId,
              pendingReportingRecordId,
              reportsToBoard: reporting.target === 'BOARD',
              reportingBody: isReportingBody(reporting.target) && reporting.target !== 'BOARD' ? reporting.target : null,
              firstName: record.firstName!,
              lastName: record.lastName!,
              middleName: record.middleName,
              email,
              phone,
              whatsappNumber: normalisePhone(record.whatsappNumber, current.defaultPhoneCountry),
              employeeCode: record.employeeCode,
              companyCode: record.companyCode,
              plantBranch: record.plantBranchCode,
              gender: GENDER_VALUES[normaliseKey(record.gender)] as any,
              nationality: record.nationality,
              departmentId,
              jobTitle: record.jobDesignation,
              workStation: record.workArea,
              fiveSLocationCategory: fiveSCategory,
              subSection: record.subSection,
              shift: record.shift,
              employmentStatus: (matchEnumValue(record.employmentStatus, EMPLOYMENT_STATUS_VALUES) ?? 'ACTIVE') as any,
              employmentType: matchEnumValue(record.employmentType, EMPLOYMENT_TYPE_VALUES) as any,
              beesAccessLevel: record.beesAccessLevel,
              ...additional.data,
              ...(found.extraFields == null ? {} : { importedExtraFields: readExtraFields(found.extraFields) }),
              ...personLinks,
            },
          });

          await tx.emsOnboardingRecord.update({
            where: { id: record.id },
            data: {
              reportingToRecordId: pendingReportingRecordId,
              reportingToEmployeeId: reportingManagerId,
              reportingToBoard: reporting.target === 'BOARD',
              reportingToBody: isReportingBody(reporting.target) && reporting.target !== 'BOARD' ? reporting.target : null,
              status: 'REGISTERED',
              employeeId: employee.id,
              registeredAt: new Date(),
              validationErrors: Prisma.DbNull,
            },
          });
          await this.resolvePendingAssignments(tx, organizationId);
          return employee;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
        if (employee) results.push({ recordId: candidate.id, employeeId: employee.id });
      } catch (error: unknown) {
        if (error instanceof OnboardingAdminRegistrationRequired) {
          awaitingAdmin.add(candidate.id);
          continue;
        }
        if (!(error instanceof BadRequestException)) {
          // Database/connection/programming failures describe the operation, not the
          // person's data. Preserve already committed registrations and stop safely.
          interruption = error instanceof OnboardingChannelChangedError ? error.message
            : 'A technical problem interrupted registration. Contact an administrator if it persists.';
          break;
        }
        const message = error instanceof BadRequestException
          ? error.message
          : 'Registration could not be completed. Validate and retry; contact an administrator if it persists.';
        // Do not downgrade a record another request has already registered/excluded.
        await this.prisma.emsOnboardingRecord.updateMany({
          where: { id: candidate.id, organizationId, status: { in: ['READY', 'NEEDS_FIXING'] }, updatedAt: candidate.updatedAt },
          data: { status: 'NEEDS_FIXING', validationErrors: error instanceof OnboardingDuplicateConflict || error instanceof OnboardingFieldConflict ? error.findings : [{ field: 'registration', message }] },
        });
        results.push({ recordId: candidate.id, error: message });
      }
    }
    // A permissions-only skip changes neither records nor the batch status.
    if (awaitingAdmin.size === ready.length && !interruption) return {
      registered: 0, failed: 0, awaitingAdmin: awaitingAdmin.size,
      batch: await this.getOnboardingBatch(organizationId, batchId),
    };
    const after = await this.prisma.emsOnboardingRecord.findMany({
      where: { batchId, organizationId }, select: { status: true },
    });
    const outstanding = after.filter((r) => r.status !== 'REGISTERED' && r.status !== 'EXCLUDED').length;
    const registered = after.filter((r) => r.status === 'REGISTERED').length;
    await this.prisma.emsOnboardingBatch.updateMany({
      where: { id: batchId, organizationId, status: { not: 'CANCELLED' } },
      data: { status: outstanding === 0 ? 'REGISTERED' : registered > 0 ? 'PARTIALLY_REGISTERED' : 'DRAFT' },
    });
    if (interruption) {
      const registeredNow = results.filter(r => r.employeeId).length;
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `Registration stopped. ${registeredNow} record(s) registered in this request before it stopped. ${interruption} Refresh this import to see the current results.`,
        registered: registeredNow,
        failed: results.filter(r => r.error).length,
        awaitingAdmin: awaitingAdmin.size,
      });
    }
    return {
      registered: results.filter((r) => r.employeeId).length,
      failed: results.filter((r) => r.error).length,
      awaitingAdmin: awaitingAdmin.size,
      batch: await this.getOnboardingBatch(organizationId, batchId),
    };
  }

  async cancelOnboardingBatch(organizationId: string, batchId: string) {
    return retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const batch = await tx.emsOnboardingBatch.findFirst({
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
        const remaining = await tx.emsOnboardingRecord.count({
          where: { batchId, organizationId, status: { notIn: ['REGISTERED', 'EXCLUDED'] } },
        });
        throw new BadRequestException(remaining > 0
          ? `Cannot cancel — ${batch._count.records} employee(s) from this import are already registered. `
            + `Open the import and use "Exclude remaining records" to stop the other ${remaining}; registered employees are kept.`
          : `Cannot cancel — every record in this import is already registered or excluded, so there is nothing left to cancel.`);
      }

      await assertPeopleLinksAllowBatchRemoval(tx, organizationId, batchId);
      return tx.emsOnboardingBatch.update({
        where: { id: batchId },
        data: { status: 'CANCELLED' },
        select: BATCH_LIST_SELECT,
      });
    }));
  }

  async deleteOnboardingBatch(organizationId: string, batchId: string) {
    return retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      const batch = await tx.emsOnboardingBatch.findFirst({
        where: { id: batchId, organizationId },
        select: { id: true, status: true },
      });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      if (batch.status !== 'CANCELLED') {
        throw new BadRequestException('Cancel the import before deleting it');
      }

      await assertPeopleLinksAllowBatchRemoval(tx, organizationId, batchId);
      await tx.emsOnboardingBatch.delete({ where: { id: batchId } });
      return { deleted: true };
    }));
  }


  async updateOnboardingDepartmentHod(organizationId: string, batchId: string, recordId: string, target: string, expectedVersion: string, userId: string) {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await saveDepartmentHod(tx, organizationId, batchId, recordId, target, expectedVersion, userId);
      await this.validateOnboardingBatchLocked(tx, organizationId, batchId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getOnboardingBatch(organizationId, batchId);
  }

  async getEmployeePeopleLinks(employeeId: string, organizationId: string) {
    return this.prisma.$transaction(tx => employeePeopleLinks(tx, organizationId, employeeId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }

  async updateEmployeeRelievers(employeeId: string, organizationId: string, first: string, second: string, expectedVersion: string) {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await saveEmployeeRelievers(tx, organizationId, employeeId, first, second, expectedVersion);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getEmployeePeopleLinks(employeeId, organizationId);
  }

  async updateEmployeeDepartmentHod(employeeId: string, organizationId: string, target: string, expectedVersion: string, userId: string) {
    await retryOnboardingTransaction(() => this.prisma.$transaction(async tx => {
      await this.lockReporting(tx, organizationId);
      await saveEmployeeHod(tx, organizationId, employeeId, target, expectedVersion, userId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return this.getEmployeePeopleLinks(employeeId, organizationId);
  }

}
