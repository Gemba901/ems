export type EmployeePerformanceAccess = {
  currentEmployeeId: string;
  canViewEmployeePerformance: boolean;
  employeePerformanceEmployeeIds: string[];
  teamPerformanceEmployeeIds?: string[];
};

export type EmployeePerformanceDestination =
  | "my-performance"
  | "employee-performance";

export function canShowEmployeePerformanceTab(
  access?: EmployeePerformanceAccess | null,
) {
  return Boolean(access?.canViewEmployeePerformance);
}

export function filterEmployeePerformanceOptions<T extends { id: string }>(
  employees: T[],
  access?: EmployeePerformanceAccess | null,
) {
  const permittedIds = new Set(
    access?.employeePerformanceEmployeeIds ?? [],
  );
  return employees.filter((employee) => permittedIds.has(employee.id));
}

export function resolveEmployeePerformanceDestination(
  employeeId: string,
  access?: EmployeePerformanceAccess | null,
): EmployeePerformanceDestination | null {
  if (!access) return null;
  if (employeeId === access.currentEmployeeId) return "my-performance";
  return access.employeePerformanceEmployeeIds.includes(employeeId) ||
    (access.teamPerformanceEmployeeIds ?? []).includes(employeeId)
    ? "employee-performance"
    : null;
}
