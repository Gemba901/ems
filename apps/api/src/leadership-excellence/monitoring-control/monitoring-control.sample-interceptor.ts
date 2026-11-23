import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, switchMap } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import {
  SampleMonitoringSource,
  sampleDataEnabled,
} from './monitoring-control.sample-source';

/**
 * DEV ONLY: before each Area 05 request, make sure the signed-in employee has
 * sample KPIs and actions. Does nothing unless LEX05_SAMPLE_DATA=true.
 * Delete together with monitoring-control.sample-source.ts.
 */
@Injectable()
export class SampleCallerInterceptor implements NestInterceptor {
  private readonly enabled = sampleDataEnabled();

  constructor(
    private readonly sample: SampleMonitoringSource,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (!this.enabled) return next.handle();
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AccessTokenPayload }>().user;
    if (!user) return next.handle();
    return from(this.includeCaller(user)).pipe(switchMap(() => next.handle()));
  }

  private async includeCaller(user: AccessTokenPayload) {
    const me = await this.prisma.employee.findFirst({
      where: { userId: user.userId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (me) await this.sample.include(user.organizationId, me.id);
  }
}
