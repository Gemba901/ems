import { useAuthStore } from "@/store/auth.store";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Deduplicate concurrent 401s so only one refresh call goes out
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: "POST",
                credentials: "include",
            });

            if (!res.ok) return null;

            const { accessToken } = await res.json();
            useAuthStore.getState().setAccessToken(accessToken);
            return accessToken as string;
        } catch {
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/**
 * Drop-in replacement for fetch that:
 * 1. Attaches `Authorization: Bearer <token>` automatically.
 * 2. On 401, attempts a silent token refresh via the httpOnly refresh-token cookie.
 * 3. Retries the original request once with the new access token.
 * 4. If refresh fails, clears the auth store and redirects to /login.
 */
export async function apiClient(
    url: string,
    options: RequestInit = {},
    token: string,
): Promise<Response> {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status !== 401) return response;

    const newToken = await tryRefresh();

    if (!newToken) {
        useAuthStore.getState().logout();
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
        return response;
    }

    // Retry once with the fresh token
    return fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
        },
    });
}
