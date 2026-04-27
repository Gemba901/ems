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
    createdAt: string;
    department: { id: string; name: string; organizationId: string } | null;
    user: {
        id: string;
        email: string | null;
        phone: string;
        name: string;
        roleId: string;
        organizationId: string;
        role: { id: string; name: string } | null;
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

export const EmployeeService = {
    async getByOrganization(
        orgId: string,
        token: string,
        page = 1,
        limit = 20,
    ): Promise<EmployeeListResponse> {
        const res = await fetch(
            `${API_URL}/employee/organization/${orgId}?page=${page}&limit=${limit}`,
            { headers: authHeaders(token) },
        );
        return handleResponse<EmployeeListResponse>(res);
    },

    async getMe(token: string): Promise<EmployeeApiResponse> {
        const res = await fetch(`${API_URL}/employee/me`, {
            headers: authHeaders(token),
        });
        return handleResponse<EmployeeApiResponse>(res);
    },

    async getById(id: string, token: string): Promise<EmployeeApiResponse> {
        const res = await fetch(`${API_URL}/employee/${id}`, {
            headers: authHeaders(token),
        });
        return handleResponse<EmployeeApiResponse>(res);
    },

    async getDepartments(orgId: string, token: string): Promise<{ id: string; name: string }[]> {
        const res = await fetch(`${API_URL}/employee/organization/${orgId}/departments`, {
            headers: authHeaders(token),
        });
        return handleResponse<{ id: string; name: string }[]>(res);
    },

    async onboard(data: Record<string, unknown>, token: string): Promise<EmployeeApiResponse> {
        const res = await fetch(`${API_URL}/employee/onboard`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        });
        return handleResponse<EmployeeApiResponse>(res);
    },

    async update(id: string, data: Record<string, unknown>, token: string): Promise<EmployeeApiResponse> {
        const res = await fetch(`${API_URL}/employee/${id}`, {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify(data),
        });
        return handleResponse<EmployeeApiResponse>(res);
    },

    async remove(id: string, token: string): Promise<{ message: string }> {
        const res = await fetch(`${API_URL}/employee/${id}`, {
            method: "DELETE",
            headers: authHeaders(token),
        });
        return handleResponse<{ message: string }>(res);
    },
};
