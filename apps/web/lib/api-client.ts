import { useAuthStore } from '@/store/auth.store';
import { invalidateLocalSession, refreshSession } from './session';

export async function apiClient(url: string, options: RequestInit = {}, token: string): Promise<Response> {
    // Keep bearer tokens on this origin even if a future caller supplies a bad URL.
    if (!url.startsWith('/api/') || url.includes('\\')) throw new Error('API requests must use the same-origin proxy');
    const send = (accessToken: string) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', headers });
    };
    const current = useAuthStore.getState().accessToken ?? token;
    const response = await send(current);
    if (response.status !== 401) return response;
    // A different request may already have refreshed while this one was in flight.
    const latest = useAuthStore.getState().accessToken;
    const refreshed = latest && latest !== current ? latest : await refreshSession();
    if (!refreshed) {
        invalidateLocalSession();
        if (typeof window !== 'undefined') window.location.assign('/login');
        return response;
    }
    return send(refreshed);
}
