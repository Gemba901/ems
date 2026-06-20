const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(token: string) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
}

export type NoticeType = "ANNOUNCEMENT" | "REMINDER" | "INFO" | "ALERT";

export interface Notice {
    id: string;
    organizationId: string;
    type: NoticeType;
    title: string;
    body: string;
    pinned: boolean;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateNoticePayload {
    type: NoticeType;
    title: string;
    body: string;
    pinned?: boolean;
    expiresAt?: string | null;
}

export const NoticeService = {
    async getNotices(token: string): Promise<Notice[]> {
        const res = await fetch(`${API_URL}/notices`, { headers: authHeaders(token) });
        return handleResponse(res);
    },

    async createNotice(token: string, payload: CreateNoticePayload): Promise<Notice> {
        const res = await fetch(`${API_URL}/notices`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(payload),
        });
        return handleResponse(res);
    },

    async updateNotice(token: string, id: string, payload: Partial<CreateNoticePayload>): Promise<Notice> {
        const res = await fetch(`${API_URL}/notices/${id}`, {
            method: "PATCH",
            headers: authHeaders(token),
            body: JSON.stringify(payload),
        });
        return handleResponse(res);
    },

    async deleteNotice(token: string, id: string): Promise<void> {
        const res = await fetch(`${API_URL}/notices/${id}`, {
            method: "DELETE",
            headers: authHeaders(token),
        });
        return handleResponse(res);
    },
};
