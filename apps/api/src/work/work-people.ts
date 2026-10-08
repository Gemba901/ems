// The minimal employee shape shown next to tasks, comments, members and attendance.
export const EMPLOYEE_SUMMARY_SELECT = { id: true, firstName: true, lastName: true } as const;

export type EmployeeSummary = { id: string; name: string };

export function toEmployeeSummary(employee: { id: string; firstName: string; lastName: string }): EmployeeSummary;
export function toEmployeeSummary(employee: { id: string; firstName: string; lastName: string } | null): EmployeeSummary | null;
export function toEmployeeSummary(employee: { id: string; firstName: string; lastName: string } | null): EmployeeSummary | null {
    if (!employee) return null;
    return { id: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() };
}
