import { SetMetadata } from '@nestjs/common';

export const PUBLIC_HEALTH_KEY = 'proxy:public-health';

// The only opt-out from ProxySecretGuard. Reserved for the unauthenticated
// health check; a coverage test fails if any other route uses it.
export const PublicHealth = () => SetMetadata(PUBLIC_HEALTH_KEY, true);
