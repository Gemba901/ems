'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { invalidateLocalSession, refreshSession } from '@/lib/session';

export function SessionProvider({ children }: { children: React.ReactNode }) {
    const ready = useAuthStore(state => state._hasHydrated);
    const [error, setError] = useState<string | null>(null);
    const restore = useCallback(async () => {
        setError(null);
        try {
            const token = await refreshSession();
            if (!token) invalidateLocalSession();
            useAuthStore.getState().setHasHydrated(true);
        } catch {
            setError('Unable to connect. Please try again.');
        }
    }, []);
    useEffect(() => {
        // Remove the previous persisted bearer token rather than trusting it.
        try { localStorage.removeItem('geos-auth-storage'); } catch { /* Storage may be disabled. */ }
        void restore();
        const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gemba-session') : null;
        if (channel) channel.onmessage = event => {
            if (event.data === 'logout') {
                invalidateLocalSession();
                window.location.assign('/login');
            }
        };
        return () => channel?.close();
    }, [restore]);
    if (error) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><p>{error}</p><button onClick={() => void restore()} className="rounded bg-slate-900 px-4 py-2 text-white">Try again</button></div>;
    if (!ready) return <div className="min-h-screen flex items-center justify-center" role="status">Loading your workspace…</div>;
    return <>{children}</>;
}
