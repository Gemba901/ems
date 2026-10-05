import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { workValidationPipe } from '../dto/common.dto';
import { PeopleQueryDto } from '../dto/people.dto';
import { PeopleService } from './people.service';

@TenantRequired()
@Controller('work/people')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class PeopleController {
  constructor(private people: PeopleService) {}

  // Who may search is decided per caller in the service (project managers are per-project).
  @Get()
  search(@CurrentUser() user: AccessTokenPayload, @Query() query: PeopleQueryDto) {
    return this.people.search(user, query);
  }
}
