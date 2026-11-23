import { apiClient } from '@/lib/api-client';
import type { DepartmentDirectory, DepartmentPeople } from '@/components/ems/department-directory';

async function read<T>(path: string, token: string): Promise<T> {
  const response = await apiClient(`/api/ems/organisation/departments${path}`, {}, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(value.message) ? value.message.join(' ') : value.message || 'Unable to load departments');
  return value;
}
export const EmsOrganisationService = {
  departments: (token: string) => read<DepartmentDirectory>('', token),
  people: (id: string, query: { page: number; search: string; branch: string | null; activity: string }, token: string) => {
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.search) params.set('search', query.search);
    if (query.branch !== null) params.set('branch', query.branch);
    if (query.activity) params.set('activity', query.activity);
    return read<DepartmentPeople>(`/${encodeURIComponent(id)}/people?${params}`, token);
  },
};
