import { SetMetadata } from "@nestjs/common";

// A shared metadata key used by the decorator and guard.
export const TENANT_REQUIRED_KEY = 'tenancy:required';


// can be placed on a controller or an individual handler.
// This only marks the route; the guard enforces the requirement.
export const TenantRequired = () =>
    SetMetadata(TENANT_REQUIRED_KEY, true);