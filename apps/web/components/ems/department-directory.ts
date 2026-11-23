export type DepartmentHod = {
  state: 'NOT_RECORDED' | 'UNASSIGNED' | 'ASSIGNED' | 'PENDING' | 'NEEDS_ATTENTION';
  person: { id: string | null; name: string; employeeCode: string | null; jobTitle: string | null } | null;
};
export type DepartmentBranch = { key: string; label: string; total: number; active: number; inactive: number; hod: DepartmentHod };
export type DepartmentDirectoryRow = { id: string; name: string; total: number; active: number; inactive: number; branches: DepartmentBranch[] };
export type DepartmentDirectory = { source: 'EMS'; asOf: string; counts: { total: number; active: number; inactive: number; unassigned: number }; departments: DepartmentDirectoryRow[] };
export type DepartmentPeople = {
  department: { id: string; name: string };
  data: { id: string; firstName: string; middleName: string | null; lastName: string; employeeCode: string | null; jobTitle: string | null; plantBranch: string | null; employmentStatus: string }[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export const HOD_STATE_LABEL: Record<DepartmentHod['state'], string> = {
  NOT_RECORDED: 'HOD not recorded', UNASSIGNED: 'Explicitly unassigned', ASSIGNED: 'Confirmed HOD',
  PENDING: 'HOD awaiting registration', NEEDS_ATTENTION: 'HOD needs review',
};
export function filterDepartments(rows: DepartmentDirectoryRow[], search: string, selectedBranch: string | null) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(row => !term || row.name.toLocaleLowerCase().includes(term)).flatMap(row => {
    if (selectedBranch === null) return [row];
    const branches = row.branches.filter(branch => branch.key === selectedBranch);
    if (!branches.length) return [];
    return [{ ...row, branches, total: branches.reduce((n, b) => n + b.total, 0),
      active: branches.reduce((n, b) => n + b.active, 0), inactive: branches.reduce((n, b) => n + b.inactive, 0) }];
  });
}
