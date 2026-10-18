import { Prisma } from 'db';

// Union of the fields used by reporting, duplicate review, identity validation
// and HOD/reliever resolution. Never expose this internal result as an API DTO.
const EMPLOYEE_SELECT = {
  id: true, firstName: true, middleName: true, lastName: true,
  employeeCode: true, phone: true, email: true, userId: true,
  jobTitle: true, plantBranch: true, departmentId: true,
  department: { select: { name: true } },
  emsOnboardingRecord: { select: { id: true } },
  reportingManagerId: true, reportsToBoard: true, pendingReportingRecordId: true,
  hodName: true, hodDesignation: true, firstRelieverId: true, secondRelieverId: true,
  pendingFirstRelieverRecordId: true, pendingSecondRelieverRecordId: true,
} as const;

export type OnboardingEmployeeSnapshot = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>;

/**
 * Create inside ONE read/validation phase of ONE transaction, after any edits.
 * Discard before another write phase, retry or post-commit detail request.
 * There is deliberately no service/global cache and no cross-tenant reuse.
 */
export function onboardingReadContext(db: Prisma.TransactionClient, organizationId: string) {
  let employees: Promise<OnboardingEmployeeSnapshot[]> | undefined;
  let departments: Promise<{ id: string; name: string }[]> | undefined;
  return {
    employees: () => employees ??= db.employee.findMany({ where: { organizationId }, select: EMPLOYEE_SELECT }),
    departments: () => departments ??= db.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  };
}
