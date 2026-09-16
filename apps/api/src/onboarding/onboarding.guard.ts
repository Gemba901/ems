import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    if (
      this.config.get('ONBOARDING_ENABLED') !== 'true' &&
      (context.getHandler().name === 'signup' ||
        this.config.get('ONBOARDING_WORKER_ENABLED') !== 'true')
    )
      throw new NotFoundException();
    const expected = this.config.get<string>('TENANT_PROXY_SECRET');
    const provided = context.switchToHttp().getRequest().headers[
      'x-gemba-proxy-secret'
    ];
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (
      !expected ||
      expected.length < 64 ||
      typeof provided !== 'string' ||
      provided.length > 1024 ||
      !timingSafeEqual(hash(expected), hash(provided))
    )
      throw new UnauthorizedException();
    return true;
  }
}
