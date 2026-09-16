import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';

import { TENANT_REQUIRED_KEY } from './tenant-route.decorator';
import { TenantResolverService } from './tenant-resolver.service';
import type { TenantRequest } from './tenant-context';

@Injectable()
export class TrustedTenantContextGuard implements CanActivate {
  private readonly expectedSecretHash: Buffer;

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantResolver: TenantResolverService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('TENANT_PROXY_SECRET');

    // Generate a cryptographically random secret.
    // Length validation catches missing/obviously unsuitable configuration;
    // it does not prove the secret was generated randomly.
    if (typeof secret !== 'string' || secret.length < 64 || secret.length > 1024 || /\s/.test(secret)) {
      throw new Error(
        'TENANT_PROXY_SECRET must contain 64–1024 characters without whitespace.',
      );
    }

    this.expectedSecretHash = this.hashSecret(secret);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<TenantRequest>();

    // Never reuse context attached by an earlier, untrusted component.
    delete request.tenant;

    const tenantRequired = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );

    // This guard only handles routes explicitly requiring a company.
    // Other routes retain their own authentication requirements.
    if (!tenantRequired) {
      return true;
    }

    const proxySecret = request.headers['x-gemba-proxy-secret'];

    // Missing, repeated/array-valued or excessively large credentials fail.
    if (
      typeof proxySecret !== 'string' ||
      proxySecret.length > 1024 ||
      !timingSafeEqual(
        this.hashSecret(proxySecret),
        this.expectedSecretHash,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid tenant forwarding credentials.',
      );
    }

    // Read the company hostname only after authenticating the proxy.
    // The Next.js forwarding layer must overwrite this header.
    const hostname = request.headers['x-gemba-tenant-hostname'];

    if (
      typeof hostname !== 'string' ||
      hostname.length === 0 ||
      hostname.length > 253
    ) {
      throw new UnauthorizedException(
        'Missing or invalid company hostname.',
      );
    }

    // The resolver validates the complete hostname, looks up the company,
    // and rejects unknown, suspended or inactive organizations.
    request.tenant =
      await this.tenantResolver.resolveCompanyHostname(hostname);

    // This means tenant resolution succeeded.
    // JWT and membership checks must still run afterward.
    return true;
  }

  private hashSecret(value: string): Buffer {
    // Fixed-size hashes let timingSafeEqual compare equal-length buffers.
    return createHash('sha256').update(value).digest();
  }
}
