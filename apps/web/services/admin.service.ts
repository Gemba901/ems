import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `Request failed with status ${res.status}`);
    }
    return res.json();
}


export type OrgStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type ModuleType = "SIMS" | "EMS" | "CALENDAR" | "LEAVE";

export const AVAILABLE_MODULES: { key: ModuleType; label: string; description: string }[] = [
    { key: "SIMS",     label: "SIMS",     description: "Suggestions & Idea Management" },
    { key: "EMS",      label: "EMS",      description: "Employee Master Data" },
    { key: "CALENDAR", label: "Calendar", description: "Visit Scheduling" },
    { key: "LEAVE",    label: "Leave",    description: "Leave Request Management" },
];

export interface Organization {
    id: string;
    name: string;
    logoUrl: string | null;
    industry: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    status: OrgStatus;
    modules: ModuleType[];
    isAdminOrg: boolean;
    createdAt: string;
    updatedAt: string;
    _count: {
        employees: number;
        departments: number;
        users: number;
        suggestions: number;
    };
}

export interface OrgDetail extends Organization {
    departments: {
        id: string;
        name: string;
        _count: { employees: number };
    }[];
}

export interface PlatformStats {
    organizationCount: number;
    employeeCount: number;
    departmentCount: number;
    suggestionCount: number;
    implementationRate: number;
    byStatus: { active: number; suspended: number; inactive: number };
    last30Days: { newOrganizations: number; newEmployees: number };
    suggestionsByStatus: Record<string, number>;
    moduleUsage: Record<string, number>;
}

export interface OrgStats {
    employeeCount: number;
    departmentCount: number;
    userCount: number;
    suggestionCount: number;
    implementationRate: number;
    approvalRate: number;
    last30Days: { newEmployees: number; newSuggestions: number };
    suggestionsByStatus: Record<string, number>;
    suggestionsByCategory: Record<string, number>;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; pages: number };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const AdminService = {
    async getPlatformStats(token: string): Promise<PlatformStats> {
        const res = await apiClient(`${API_URL}/organizations/stats`, { headers: authHeaders(token) }, token);
        return handleResponse<PlatformStats>(res);
    },

    async listOrganizations(
        token: string,
        page = 1,
        limit = 20,
    ): Promise<PaginatedResponse<Organization>> {
        const res = await apiClient(`${API_URL}/organizations?page=${page}&limit=${limit}`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<PaginatedResponse<Organization>>(res);
    },

    async getOrganization(token: string, id: string): Promise<OrgDetail> {
        const res = await apiClient(`${API_URL}/organizations/${id}`, { headers: authHeaders(token) }, token);
        return handleResponse<OrgDetail>(res);
    },

    async getOrgStats(token: string, id: string): Promise<OrgStats> {
        const res = await apiClient(`${API_URL}/organizations/${id}/stats`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<OrgStats>(res);
    },

    async getOrgEmployees(
        token: string,
        id: string,
        page = 1,
        limit = 20,
        departmentId?: string,
    ): Promise<PaginatedResponse<any>> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (departmentId) params.set("departmentId", departmentId);
        const res = await apiClient(`${API_URL}/organizations/${id}/employees?${params}`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<PaginatedResponse<any>>(res);
    },

    async getOrgSuggestions(
        token: string,
        id: string,
        page = 1,
        limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const res = await fetch(
            `${API_URL}/organizations/${id}/suggestions?page=${page}&limit=${limit}`,
            { headers: authHeaders(token) },
        );
        return handleResponse<PaginatedResponse<any>>(res);
    },

    async getOrgRoles(token: string, id: string): Promise<any[]> {
        const res = await apiClient(`${API_URL}/organizations/${id}/roles`, {
            headers: authHeaders(token),
        }, token);
        return handleResponse<any[]>(res);
    },

    async updateOrgStatus(token: string, id: string, status: OrgStatus): Promise<any> {
        const res = await apiClient(`${API_URL}/organizations/${id}/status`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify({ status }),
        }, token);
        return handleResponse<any>(res);
    },

    async updateOrganization(token: string, id: string, data: Partial<Organization>): Promise<any> {
        const res = await apiClient(`${API_URL}/organizations/${id}`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        }, token);
        return handleResponse<any>(res);
    },

    async createOrganization(token: string, data: Record<string, string> & { modules?: ModuleType[]; adminFirstName: string; adminLastName: string; adminEmail: string; adminPhone: string }): Promise<any> {
        const res = await apiClient(`${API_URL}/organizations`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        }, token);
        return handleResponse<any>(res);
    },

    async updateCompanyTheme(token: string, primaryColor: string): Promise<{ id: string; primaryColor: string }> {
        const res = await apiClient(`${API_URL}/employee/company/theme`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify({ primaryColor }),
        }, token);
        return handleResponse<{ id: string; primaryColor: string }>(res);
    },

    async setAdminOrg(token: string, orgId: string): Promise<{ message: string; organization: Organization }> {
        const res = await apiClient(`${API_URL}/organizations/${orgId}/set-admin-org`, {
            method: "PATCH",
            headers: authHeaders(token),
        }, token);
        return handleResponse(res);
    },

    async deleteOrganization(token: string, id: string, confirmName: string): Promise<{ message: string }> {
        const params = new URLSearchParams({ confirmName });
        const res = await apiClient(`${API_URL}/organizations/${id}?${params}`, {
            method: "DELETE",
            headers: authHeaders(token),
        }, token);
        return handleResponse<{ message: string }>(res);
    },

    async deleteOrphanUsers(token: string): Promise<{ deleted: number; message: string }> {
        const res = await apiClient(`${API_URL}/organizations/orphan-users`, {
            method: "DELETE",
            headers: authHeaders(token),
        }, token);
        return handleResponse<{ deleted: number; message: string }>(res);
    },

    async importOrgEmployees(
        token: string,
        id: string,
        file: File,
        dryRun = false,
    ): Promise<{
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
    }> {
        const form = new FormData();
        form.append("file", file);
        const res = await apiClient(`${API_URL}/organizations/${id}/employees/import?dryRun=${dryRun ? "true" : "false"}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        }, token);
        return handleResponse(res);
    },
};
