const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const AuthService = {
    async verifyIdentifier(identifier: string) {
        const res = await fetch(`${API_URL}/auth/verify-first-time`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneOrEmail: identifier }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Account not found!");
        }
        return res.json();
    },

    async setupAccount(setupToken: string, newPassword: string) {
        const res = await fetch(`${API_URL}/auth/create-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setupToken, newPassword }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Setup failed!");
        }
        return res.json();
    },

    async login(identifier: string, password: string) {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneOrEmail: identifier, password }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Login failed!");
        }
        return res.json();
    },

    async selectOrg(selectionToken: string, organizationId: string) {
        const res = await fetch(`${API_URL}/auth/select-org`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectionToken, organizationId }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Organization selection failed!");
        }
        return res.json();
    },

    async getMyOrg(token: string): Promise<{ id: string; name: string; status: string; modules: string[]; logoUrl: string | null; primaryColor: string | null }> {
        const res = await fetch(`${API_URL}/auth/my-org`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load organization info.");
        return res.json();
    },
};
