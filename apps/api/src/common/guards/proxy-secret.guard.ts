import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';

import { PUBLIC_HEALTH_KEY } from '../decorators/public-health.decorator';

// Registered as APP_GUARD: every route requires the Next.js proxy's shared
// secret, so calling the API host directly bypasses nothing. Routes opt out
// only through @PublicHealth().
@Injectable()
export class ProxySecretGuard implements CanActivate {
  private readonly expectedSecretHash: Buffer;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    const secret = config.get<string>('TENANT_PROXY_SECRET');

    // Fail at startup rather than letting every request fail later.
    if (typeof secret !== 'string' || secret.length < 64 || secret.length > 1024 || /\s/.test(secret)) {
      throw new Error(
        'TENANT_PROXY_SECRET must contain 64–1024 characters without whitespace.',
      );
    }

    this.expectedSecretHash = hash(secret);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_HEALTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const provided = context.switchToHttp().getRequest().headers['x-gemba-proxy-secret'];

    // Missing, repeated/array-valued or excessively large credentials fail.
    if (
      typeof provided !== 'string' ||
      provided.length > 1024 ||
      !timingSafeEqual(hash(provided), this.expectedSecretHash)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }
}

// Fixed-size hashes let timingSafeEqual compare equal-length buffers.
function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
