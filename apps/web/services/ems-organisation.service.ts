import { apiClient } from '@/lib/api-client';
import type { DepartmentDirectory, DepartmentPeople } from '@/components/ems/department-directory';
import type { HodDirectoryEntry, PersonLinkResolution, PersonSuggestion, ReportingOption } from '@/services/ems.service';

/** Choose HOD for one department at one branch: registered employees only. */
export type DepartmentHodChoices = {
  departmentId: string; departmentName: string; branchKey: string; branchLabel: string; hasHodAssignment: boolean;
  hod: PersonLinkResolution; hodDirectory: HodDirectoryEntry[]; recordedHodSuggestions: PersonSuggestion[];
  hodOptions: ReportingOption[]; hodVersion: string;
};

async function read<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await apiClient(`/api/ems/organisation/departments${path}`, init, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(value.message) ? value.message.join(' ') : value.message || 'Unable to load departments');
  return value;
}
export const EmsOrganisationService = {
  departments: (token: string) => read<DepartmentDirectory>('', token),
  people: (id: string, query: { page: number; search: string; branch: string | null; activity: string; noManager?: boolean }, token: string) => {
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.search) params.set('search', query.search);
    if (query.branch !== null) params.set('branch', query.branch);
    if (query.activity) params.set('activity', query.activity);
    if (query.noManager) params.set('noManager', 'true');
    return read<DepartmentPeople>(`/${encodeURIComponent(id)}/people?${params}`, token);
  },
  hod: (id: string, branch: string, token: string) =>
    read<DepartmentHodChoices>(`/${encodeURIComponent(id)}/hod?${new URLSearchParams({ branch })}`, token),
  saveHod: (id: string, change: { branch: string; target: string; expectedVersion: string }, token: string) =>
    read<DepartmentHodChoices>(`/${encodeURIComponent(id)}/hod`, token,
      // The same headers EmsService sends with its HOD saves.
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(change) }),
};
