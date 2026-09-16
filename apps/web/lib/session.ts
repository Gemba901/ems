import { useAuthStore } from '@/store/auth.store';

let refreshPromise: Promise<string | null> | null = null;
let sessionGeneration = 0;
let lockTail: Promise<unknown> = Promise.resolve();

// Web Locks serialize refresh/logout across tabs on the same origin.
export async function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('gemba-session', action);
    }
    // Also serialize within one tab when Web Locks are unavailable.
    const result = lockTail.then(action);
    lockTail = result.catch(() => undefined);
    return result;
}

export function invalidateLocalSession() {
    sessionGeneration++;
    useAuthStore.getState().logout();
}

export async function refreshSession(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;
    const generation = sessionGeneration;
    refreshPromise = withSessionLock(async () => {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) throw new Error('Unable to restore your session. Please try again.');
        const data = await res.json();
        if (generation !== sessionGeneration) return null;
        if (data.workspaceUrl) { window.location.assign(data.workspaceUrl); return null; }
        if (typeof data.accessToken !== 'string' || !data.user) throw new Error('Invalid session response');
        // Refresh also updates the user's current role and organization details.
        useAuthStore.getState().setAuth(data.user, data.accessToken);
        return data.accessToken;
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
}

export async function endSession() {
    // Discard results of a refresh already running in this tab.
    sessionGeneration++;
    await withSessionLock(async () => {
        const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error('Unable to sign out. Please try again.');
    });
    invalidateLocalSession();
    if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('gemba-session');
        channel.postMessage('logout');
        channel.close();
    }
}
