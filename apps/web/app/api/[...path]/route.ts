import 'server-only';
import { proxyRequest } from '@/lib/server/api-proxy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
    const { path } = await context.params;
    return proxyRequest(request, path, {
        apiUrl: process.env.API_INTERNAL_URL,
        baseDomain: process.env.TENANT_BASE_DOMAIN,
        platformHosts: process.env.TENANT_PLATFORM_HOSTS,
        platformSlug: process.env.TENANT_PLATFORM_SLUG,
        secret: process.env.TENANT_PROXY_SECRET,
        production: process.env.NODE_ENV === 'production',
    });
}

export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
