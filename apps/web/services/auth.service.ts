import { endSession } from "@/lib/session";
import { apiClient } from "@/lib/api-client";
const API_URL = "/api";

async function signInError(response: Response, fallback: string): Promise<Error> {
    if (response.status === 429) {
        const seconds = Number(response.headers.get("Retry-After"));
        return new Error(Number.isFinite(seconds) && seconds > 0
            ? `Too many sign-in attempts. Please wait ${Math.ceil(seconds)} seconds before trying again.`
            : "Too many sign-in attempts. Please wait a few minutes before trying again.");
    }
    if (response.status >= 500 || response.status === 408) {
        return new Error("The sign-in service is temporarily unavailable. Please try again shortly.");
    }
    // Some API exceptions return a JSON string rather than { message: ... }.
    // An unavailable or unrecognised response must not imply a missing account.
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "string"
        ? body
        : body && typeof body === "object" && "message" in body
            ? body.message
            : null;
    return new Error(typeof message === "string" && message.trim() ? message : fallback);
}

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
            throw await signInError(res, "Unable to verify your account. Please try again.");
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
            throw await signInError(res, "Unable to sign in. Please try again.");
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
        await endSession();
    },

    async updateMyOrg(token: string, data: { logoUrl?: string; primaryColor?: string }) {
        const res = await apiClient('/api/company/organization', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, token);
        if (!res.ok) throw new Error('Failed to update company profile');
        return res.json();
    },

    async getMyOrg(token: string): Promise<{ id: string; name: string; status: string; modules: string[]; logoUrl: string | null; primaryColor: string | null; timeZone: string }> {
        const res = await apiClient(`${API_URL}/auth/my-org`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
        }, token);
        if (!res.ok) throw new Error("Failed to load organization info.");
        return res.json();
    },

    // Guided tours the signed-in person has already finished or skipped, on any device.
    async getCompletedTours(token: string): Promise<string[]> {
        const res = await apiClient(`${API_URL}/auth/tours`, { headers: { Authorization: `Bearer ${token}` } }, token);
        if (!res.ok) throw new Error("Failed to load tours.");
        return res.json();
    },

    async markTourCompleted(token: string, tourKey: string): Promise<string[]> {
        const res = await apiClient(`${API_URL}/auth/tours`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ tourKey }),
        }, token);
        if (!res.ok) throw new Error("Failed to save tour progress.");
        return res.json();
    },
};
