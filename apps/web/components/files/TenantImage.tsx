'use client';
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { apiClient } from '@/lib/api-client';

// Private image requests need the same current membership checks as API calls.
// Public/static assets retain normal browser loading behavior.
export function TenantImage({ src, alt = '', organizationId: targetOrganizationId, ...props }: ImgHTMLAttributes<HTMLImageElement> & { organizationId?: string }) {
  const token = useAuthStore(state => state.accessToken);
  const organizationId = useAuthStore(state => state.user?.organizationId);
  const platformAdmin = useAuthStore(state => state.user?.isAdminOrg && state.user?.roleLevel === 'SUPER_ADMIN');
  const managed = typeof src === 'string' && src.startsWith('/api/uploads/files/');
  const [image, setImage] = useState<{ src: string; token: string; url: string } | null>(null);
  useEffect(() => {
    if (!managed || !token || typeof src !== 'string') return;
    let url: string | undefined;
    const controller = new AbortController();
    const path = platformAdmin && targetOrganizationId ? `/api/operations/files/${targetOrganizationId}/${src.split('/').at(-1)}` : src;
    void apiClient(path, { signal: controller.signal }, token).then(async response => {
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImage({ src, token, url });
    }).catch(() => { /* Missing membership or connection: do not display another workspace's image. */ });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [src, token, organizationId, managed, targetOrganizationId, platformAdmin]);
  const visible = managed ? (image && image.src === src && image.token === token ? image.url : undefined) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} src={visible} />;
}
