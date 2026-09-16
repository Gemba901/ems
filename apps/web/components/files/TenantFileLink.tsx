'use client';
import { useState, type AnchorHTMLAttributes } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
export function TenantFileLink({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const token = useAuthStore(state => state.accessToken);
  const [error, setError] = useState('');
  const managed = href?.startsWith('/api/uploads/files/');
  return <><a {...props} href={managed ? '#' : href} onClick={async event => {
    onClick?.(event);
    if (!managed || event.defaultPrevented) return;
    event.preventDefault(); setError('');
    if (!token || !href) { setError('Sign in to download this file.'); return; }
    try {
      const response = await apiClient(href, {}, token);
      if (!response.ok) throw new Error('File unavailable');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'download';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Unable to download this file. Check your connection and company access.'); }
  }}>{children}</a>{error && <span role="alert" className="text-sm text-red-600">{error}</span>}</>;
}
