import { CanActivate, ExecutionContext, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const EMS_DEMO_ONLY = 'ems:demo-only';
export const EmsDemoOnly = () => SetMetadata(EMS_DEMO_ONLY, true);

/** EMS-only availability check; existing authentication/tenant/role/module guards still run. */
@Injectable()
export class EmsDemoToolsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Method-only metadata: no other EMS route is gated by this flag.
    if (this.reflector.get<boolean>(EMS_DEMO_ONLY, context.getHandler()) &&
        process.env.EMS_DEMO_TOOLS !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
