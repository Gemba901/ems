import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `Request failed with status ${res.status}`);
    }
    return res.json();
}

export interface EmployeeApiResponse {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    departmentId: string | null;
    organizationId: string;
    userId: string | null;
    avatarUrl: string | null;
    createdAt: string;
    department: { id: string; name: string; organizationId: string } | null;
    committeeMembers: {
        committeeId: string;
        employeeId: string;
        committee: { id: string; name: string; type: string; organizationId: string };
    }[];
    user: {
        id: string;
        email: string | null;
        phone: string;
        name: string;
        organizations: {
            userId: string;
            organizationId: string;
            roleId: number;
            role: { id: number; name: string };
        }[];
    } | null;
}

export interface EmployeeListResponse {
    data: EmployeeApiResponse[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export interface OrgStatsResponse {
    total: number;
    withAccounts: number;
    withoutAccounts: number;
    recentlyAdded: number;
    byDepartment: { name: string; count: number }[];
    byRole: { name: string; count: number }[];
    recentEmployees: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        department: string | null;
        createdAt: string;
        hasActiveAccount: boolean;
    }[];
}

export interface EmployeeImportSummary {
    organizationId: string;
    organizationName: string;
    rowsRead: number;
    validRows: number;
    invalidRows: number;
    created: number;
    updated: number;
    deleted: number;
    preserved: number;
    dryRun: boolean;
    issues: { row: number; message: string }[];
}

export const EmployeeService = {
    async getByOrganization(
        orgId: string,
        token: string,
        page = 1,
        limit = 20,
        search?: string,
        departmentId?: string,
    ): Promise<EmployeeListResponse> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search)       params.set('search',       search);
        if (departmentId) params.set('departmentId', departmentId);
        const res = await apiClient(
            `${API_URL}/employee/organization/${orgId}?${params}`,
            { headers: authHeaders(token) },
            token,
        );
        return handleResponse<EmployeeListResponse>(res);
    },

    async getMe(token: string): Promise<EmployeeApiResponse> {
        const res = await apiClient(`${API_URL}/employee/me`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<EmployeeApiResponse>(res);
    },

    async getById(id: string, token: string): Promise<EmployeeApiResponse> {
        const res = await apiClient(`${API_URL}/employee/${id}`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<EmployeeApiResponse>(res);
    },

    async getDepartments(orgId: string, token: string): Promise<{ id: string; name: string; _count: { employees: number } }[]> {
        const res = await apiClient(`${API_URL}/employee/organization/${orgId}/departments`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<{ id: string; name: string; _count: { employees: number } }[]>(res);
    },

    async getOrgStats(orgId: string, token: string): Promise<OrgStatsResponse> {
        const res = await apiClient(`${API_URL}/employee/organization/${orgId}/stats`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<OrgStatsResponse>(res);
    },

    async getByDepartment(
        deptId: string,
        token: string,
        page = 1,
        limit = 20,
    ): Promise<EmployeeListResponse> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        const res = await apiClient(
            `${API_URL}/employee/department/${deptId}?${params}`,
            { headers: authHeaders(token) },
            token,
        );
        return handleResponse<EmployeeListResponse>(res);
    },

    async onboard(data: Record<string, unknown>, token: string): Promise<EmployeeApiResponse> {
        const res = await apiClient(`${API_URL}/employee/onboard`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        }, token);
        return handleResponse<EmployeeApiResponse>(res);
    },

    async update(id: string, data: Record<string, unknown>, token: string): Promise<EmployeeApiResponse> {
        const res = await apiClient(`${API_URL}/employee/${id}`, {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        }, token);
        return handleResponse<EmployeeApiResponse>(res);
    },

    async remove(id: string, token: string): Promise<{ message: string }> {
        const res = await apiClient(`${API_URL}/employee/${id}`, {
            method: "DELETE",
            headers: authHeaders(token),
        }, token);
        return handleResponse<{ message: string }>(res);
    },

    async updateRole(id: string, roleId: number, token: string): Promise<{ message: string }> {
        const res = await apiClient(`${API_URL}/employee/${id}/role`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify({ roleId }),
        }, token);
        return handleResponse<{ message: string }>(res);
    },

    async resetPassword(id: string, newPassword: string, token: string): Promise<{ message: string }> {
        const res = await apiClient(`${API_URL}/employee/${id}/reset-password`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify({ newPassword }),
        }, token);
        return handleResponse<{ message: string }>(res);
    },

    async updateAvatar(id: string, avatarUrl: string, token: string): Promise<EmployeeApiResponse> {
        const res = await apiClient(`${API_URL}/employee/${id}/avatar`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify({ avatarUrl }),
        }, token);
        return handleResponse<EmployeeApiResponse>(res);
    },

    async importEmployees(file: File, token: string, dryRun = false): Promise<EmployeeImportSummary> {
        const form = new FormData();
        form.append("file", file);
        const res = await apiClient(`${API_URL}/employee/import?dryRun=${dryRun ? "true" : "false"}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        }, token);
        return handleResponse<EmployeeImportSummary>(res);
    },

    async createDepartment(name: string, token: string): Promise<{ id: string; name: string; organizationId: string }> {
        const res = await apiClient(`${API_URL}/departments`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ name }),
        }, token);
        return handleResponse<{ id: string; name: string; organizationId: string }>(res);
    },
};
