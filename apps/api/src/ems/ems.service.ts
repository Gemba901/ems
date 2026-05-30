import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { UpdateEmployeeEmsDto, QueryEmsEmployeesDto } from './dto/ems.dto';

// ── Field groups that define completeness ────────────────────────────────────
export const EMS_GROUPS = {
  IDENTITY:            ['firstName', 'lastName', 'employeeCode', 'middleName', 'gender', 'nationalId', 'dateOfBirth', 'nationality'],
  WORK_ALLOCATION:     ['departmentId', 'employmentStatus', 'employmentType', 'jobTitle', 'dateJoined', 'workStation', 'section', 'subSection', 'shift', 'reportingManagerId'],
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
  workStation: true, section: true, subSection: true, shift: true,
  reportingManagerId: true,
  reportingManager: { select: { id: true, firstName: true, lastName: true } },
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

@Injectable()
export class EmsService {
  constructor(private prisma: PrismaService) {}

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

    const { overall, groups } = calcEmployeeCompletion(emp as Record<string, unknown>);
    return { employee: emp, completion: { overall, groups } };
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
      select: { id: true },
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
      where: { id: employeeId },
      data: updateData,
      select: EMS_EMPLOYEE_SELECT,
    });

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
}
