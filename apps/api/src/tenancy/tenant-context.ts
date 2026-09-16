import type { Request } from 'express'
import type { AccessTokenPayload } from 'src/auth/access-token-payload';

// The organization resolved from a verified company hostname.
// This Identifies the workspace; It does not authorize the user.
export interface TenantContext {
    organizationId: string;
    slug: string;
    name: string
}


// tenant is optional because it does not exist untill the guard runs.
// Platform routes may never receive a tenant context.

export interface TenantRequest extends Request {
    tenant?: TenantContext;

    user? : AccessTokenPayload;
}