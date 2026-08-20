const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const AuthService = {
    async verifyIdentifier(identifier: string, type: "phoneOrEmail" | "employeeCode" = "phoneOrEmail") {
        const body = type === "employeeCode"
            ? { employeeCode: identifier }
            : { phoneOrEmail: identifier };
        const res = await fetch(`${API_URL}/auth/verify-first-time`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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

    async login(identifier: string, password: string, type: "phoneOrEmail" | "employeeCode" = "phoneOrEmail") {
        const body = type === "employeeCode"
            ? { employeeCode: identifier, password }
            : { phoneOrEmail: identifier, password };
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectionToken, organizationId }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Organization selection failed!");
        }
        return res.json();
    },

    async forgotPassword(email: string) {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Something went wrong. Please try again.");
        }
        return res.json();
    },

    async resetPassword(token: string, newPassword: string) {
        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Failed to reset password.");
        }
        return res.json();
    },

    async verifyTempPassword(tempPassword: string): Promise<{ setupToken: string; message: string }> {
        const res = await fetch(`${API_URL}/auth/verify-temp-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tempPassword }),
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Invalid or expired temporary password.");
        }
        return res.json();
    },

    async logout() {
        await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
        }).catch(() => {});
    },

    async getMyOrg(token: string): Promise<{ id: string; name: string; status: string; modules: string[]; logoUrl: string | null; primaryColor: string | null }> {
        const res = await fetch(`${API_URL}/auth/my-org`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load organization info.");
        return res.json();
    },
};
