/**
 * The Employees list remembers its search, filters, page and ticked people for this browser tab, so opening a
 * profile and coming back (Back, or the profile's back arrow) doesn't lose them. Clear empties the ticks.
 * Kept per company. Session storage only: it ends with the tab and is never sent anywhere.
 */
export type EmployeeListState<F> = { search: string; filters: F; selected: [string, string][]; allMatching: boolean; moreFilters: boolean };
const key = (organizationId: string) => `ems-employee-list:${organizationId}`;

export function saveEmployeeListState<F>(organizationId: string | null | undefined, state: EmployeeListState<F>) {
  if (!organizationId) return;
  try { sessionStorage.setItem(key(organizationId), JSON.stringify(state)); } catch { /* Private mode or full storage: it's a convenience only. */ }
}

/** The saved state, merged over the defaults so a newer filter added since it was saved still has a value. */
export function loadEmployeeListState<F extends object>(organizationId: string | null | undefined, defaults: F): EmployeeListState<F> | null {
  if (!organizationId) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key(organizationId)) ?? 'null');
    if (!value || typeof value !== 'object' || !Array.isArray(value.selected)) return null;
    const selected = value.selected.filter((entry: unknown): entry is [string, string] =>
      Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string');
    return { search: typeof value.search === 'string' ? value.search : '', filters: { ...defaults, ...(value.filters ?? {}) },
      selected, allMatching: value.allMatching === true, moreFilters: value.moreFilters === true };
  } catch { return null; }
}
