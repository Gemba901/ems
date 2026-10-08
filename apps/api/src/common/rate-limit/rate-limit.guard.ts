import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { clientIp } from './client-ip';
import { RateLimitService, TooManyRequestsException } from './rate-limit.service';

export const RATE_LIMIT_KEY = 'rate-limit:rules';

export interface RateLimitRule {
  // Bucket name; counts are shared by every route using the same name.
  name: string;
  max: number;
  windowMs: number;
  // `ip` buckets by caller; a function buckets by whatever it returns
  // (e.g. the account being targeted). Returning undefined skips the rule.
  by: 'ip' | ((request: any) => string | undefined);
}

// Method-level guard, so it runs after class guards such as
// TrustedTenantContextGuard and after the global ProxySecretGuard.
export const RateLimit = (...rules: RateLimitRule[]) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, rules), UseGuards(RateLimitGuard));

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[]>(RATE_LIMIT_KEY, context.getHandler()) ?? [];
    const http = context.switchToHttp();
    const request = http.getRequest();

    for (const rule of rules) {
      const subject = rule.by === 'ip' ? `ip:${clientIp(request)}` : rule.by(request);
      if (!subject) continue;
      try {
        await this.limits.consume(`${rule.name}:${subject}`, rule.max, rule.windowMs);
      } catch (error) {
        if (error instanceof TooManyRequestsException) {
          http.getResponse().setHeader('Retry-After', String(error.retryAfterSeconds));
        }
        throw error;
      }
    }
    return true;
  }
}
