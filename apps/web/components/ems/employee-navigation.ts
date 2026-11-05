import type { EmployeeListFilters } from '@/services/ems.service';

/**
 * Previous / Next between employee profiles follows the list HR came from: same search, filters,
 * sort and page. The list saves its current page here; profiles read it. Kept per browser tab.
 */
export type EmployeeNavContext = { filters: EmployeeListFilters; page: number; limit: number; pages: number; total: number; ids: string[] };
const KEY = 'ems-employee-nav';

export function saveEmployeeNav(context: EmployeeNavContext) {
  try { sessionStorage.setItem(KEY, JSON.stringify(context)); } catch { /* Private mode or storage full: navigation is optional. */ }
}

export function loadEmployeeNav(): EmployeeNavContext | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return value && Array.isArray(value.ids) && typeof value.page === 'number' ? value : null;
  } catch { return null; }
}

/** Where this employee sits in the saved list, and who is before and after on the same page. */
export function employeeNeighbours(context: EmployeeNavContext | null, employeeId: string) {
  if (!context) return null;
  const index = context.ids.indexOf(employeeId);
  if (index < 0) return null;
  return {
    position: (context.page - 1) * context.limit + index + 1,
    total: context.total,
    previousId: context.ids[index - 1] ?? null,
    nextId: context.ids[index + 1] ?? null,
    // At a page edge the neighbour is on the adjacent page.
    previousPage: index === 0 && context.page > 1 ? context.page - 1 : null,
    nextPage: index === context.ids.length - 1 && context.page < context.pages ? context.page + 1 : null,
  };
}
