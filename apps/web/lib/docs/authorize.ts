import "server-only";
import { proxyRequest } from "@/lib/server/api-proxy.mjs";

// Docs are only served to signed-in users whose organization has the module enabled.
export async function authorizeModuleDocs(request: Request, moduleKey: string): Promise<Response | null> {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return new Response(null, { status: 401 });
  }

  const authorization = await proxyRequest(request, ["auth", "my-org"], {
    apiUrl: process.env.API_INTERNAL_URL,
    baseDomain: process.env.TENANT_BASE_DOMAIN,
    platformHosts: process.env.TENANT_PLATFORM_HOSTS,
    platformSlug: process.env.TENANT_PLATFORM_SLUG,
    secret: process.env.TENANT_PROXY_SECRET,
    production: process.env.NODE_ENV === "production",
  });
  if (!authorization.ok) {
    return new Response(null, { status: authorization.status });
  }
  const organization = (await authorization.json()) as { modules?: string[] };
  if (!organization.modules?.includes(moduleKey)) {
    return new Response(null, { status: 403 });
  }
  return null;
}
