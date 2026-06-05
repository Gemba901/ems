const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Request failed with status ${res.status}`);
    }
    return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "MATERNITY" | "PATERNITY" | "COMPASSIONATE" | "STUDY";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveColleague {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    department: { name: string } | null;
}

export interface LeaveOverlapEntry {
    status: LeaveStatus;
    startDate: string;
    endDate: string;
    employee: { firstName: string; lastName: string; jobTitle: string | null; department: { name: string } | null };
}

export interface LeaveRequest {
    id: string;
    employeeId: string;
    organizationId: string;
    type: LeaveType;
    status: LeaveStatus;
    startDate: string;
    endDate: string;
    days: number;
    reason: string | null;
    handoverEmployeeId: string | null;
    handoverNotes: string | null;
    handoverEmployee?: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    createdAt: string;
    employee?: { id: string; firstName: string; lastName: string; jobTitle: string | null };
    reviewedBy?: { id: string; name: string } | null;
}

export interface LeaveBalance {
    id: string;
    employeeId: string;
    year: number;
    type: LeaveType;
    allocated: number;
    used: number;
}

export interface LeavePolicy {
    id: string;
    organizationId: string;
    year: number;
    type: LeaveType;
    allocated: number;
}

export interface LeaveSummary {
    pending: number;
    approved: number;
    rejected: number;
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
    ANNUAL: "Annual Leave",
    SICK: "Sick Leave",
    UNPAID: "Unpaid Leave",
    MATERNITY: "Maternity Leave",
    PATERNITY: "Paternity Leave",
    COMPASSIONATE: "Compassionate Leave",
    STUDY: "Study Leave",
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-500",
};

// ── API calls ─────────────────────────────────────────────────────────────────

export const LeaveService = {
    async getPolicy(token: string, year: number): Promise<LeavePolicy[]> {
        const res = await fetch(`${API_URL}/leave/policy?year=${year}`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async upsertPolicy(token: string, body: { year: number; entries: { type: LeaveType; allocated: number }[] }): Promise<LeavePolicy[]> {
        const res = await fetch(`${API_URL}/leave/policy`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async applyPolicy(token: string, year: number): Promise<{ applied: number; leaveTypes: number; year: number }> {
        const res = await fetch(`${API_URL}/leave/policy/apply`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ year }),
        });
        return handleResponse(res);
    },

    async getSummary(token: string): Promise<LeaveSummary> {
        const res = await fetch(`${API_URL}/leave/summary`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async getMyBalance(token: string): Promise<LeaveBalance[]> {
        const res = await fetch(`${API_URL}/leave/balance`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async getEmployeeBalance(token: string, employeeId: string): Promise<LeaveBalance[]> {
        const res = await fetch(`${API_URL}/leave/balance/${employeeId}`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async upsertBalance(token: string, employeeId: string, body: { type: LeaveType; allocated: number; year?: number }): Promise<LeaveBalance> {
        const res = await fetch(`${API_URL}/leave/balance/${employeeId}`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async listRequests(token: string, params?: { status?: LeaveStatus; employeeId?: string }): Promise<LeaveRequest[]> {
        const qs = new URLSearchParams();
        if (params?.status) qs.set("status", params.status);
        if (params?.employeeId) qs.set("employeeId", params.employeeId);
        const res = await fetch(`${API_URL}/leave/requests?${qs}`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async getColleagues(token: string): Promise<LeaveColleague[]> {
        const res = await fetch(`${API_URL}/leave/colleagues`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async checkOverlap(token: string, startDate: string, endDate: string): Promise<{ count: number; colleagues: LeaveOverlapEntry[] }> {
        const res = await fetch(`${API_URL}/leave/overlap?startDate=${startDate}&endDate=${endDate}`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async submitRequest(token: string, body: {
        type: LeaveType; startDate: string; endDate: string; days: number;
        reason?: string; handoverEmployeeId?: string; handoverNotes?: string;
    }): Promise<{ request: LeaveRequest; overlapping: LeaveOverlapEntry[] }> {
        const res = await fetch(`${API_URL}/leave/requests`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async reviewRequest(token: string, id: string, body: { status: "APPROVED" | "REJECTED"; reviewNote?: string }): Promise<LeaveRequest> {
        const res = await fetch(`${API_URL}/leave/requests/${id}/review`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify(body),
        });
        return handleResponse(res);
    },

    async cancelRequest(token: string, id: string): Promise<LeaveRequest> {
        const res = await fetch(`${API_URL}/leave/requests/${id}/cancel`, {
            method: "PATCH",
            headers: authHeaders(token),
        });
        return handleResponse(res);
    },
};
