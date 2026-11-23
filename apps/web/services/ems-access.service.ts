import { apiClient } from '@/lib/api-client';

export type AccessRole = 'EMPLOYEE' | 'MANAGEMENT' | 'HOD' | 'HR' | 'ADMIN' | 'SUPER_ADMIN';
export type SuggestionState = 'PENDING' | 'APPROVED' | 'DECLINED';
export type AccessChange = {
  id: string; kind: 'CHANGED' | 'APPROVED' | 'DECLINED'; fromRole: AccessRole | null; toRole: AccessRole | null;
  suggestedRole: AccessRole | null; reason: string; actorName: string | null; actorUserId: string; changedAt: string;
};
export type EmployeeAccess = {
  employeeId: string; role: AccessRole | null; accountLinked: boolean; sheetValue: string | null;
  suggestedAccess: AccessRole | null; suggestedAccessState: SuggestionState | null; revision: number; canChange: boolean;
  history: AccessChange[]; hasMoreHistory: boolean;
};
export type AccessSuggestion = {
  employeeId: string; name: string; employeeCode: string | null; department: string | null; jobTitle: string | null;
  role: AccessRole | null; accountLinked: boolean; suggestedAccess: AccessRole; sheetValue: string | null; revision: number;
};
export type AccessResult = { changed: number; changedIds: string[]; skipped: { employeeId: string; name: string; reason: string }[] };

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await apiClient(`/api/ems/access${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  }, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(value.message) ? value.message.join(' ') : value.message || 'Access could not be loaded');
  return value;
}

export const EmsAccessService = {
  employee: (id: string, token: string) => call<EmployeeAccess>(`/employees/${encodeURIComponent(id)}`, token),
  suggestions: (token: string, batchId?: string) =>
    call<{ canDecide: boolean; suggestions: AccessSuggestion[] }>(`/suggestions${batchId ? `?${new URLSearchParams({ batchId })}` : ''}`, token),
  change: (body: { employeeIds: string[]; role: AccessRole; reason: string; expectedRevisions?: Record<string, number> }, token: string) =>
    call<AccessResult>('/change', token, { method: 'POST', body: JSON.stringify(body) }),
  decide: (body: { employeeIds: string[]; decision: 'APPROVE' | 'DECLINE'; reason?: string; expectedRevisions?: Record<string, number> }, token: string) =>
    call<AccessResult>('/suggestions/decide', token, { method: 'POST', body: JSON.stringify(body) }),
};
