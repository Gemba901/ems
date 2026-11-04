import { Controller, UseGuards, Get, Patch, Body } from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { StrategicDirectionService } from './strategic-direction.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { LEX_ALL, LEX_EDITORS } from '../common/lex-roles';
import { SaveDraftDto } from './dto/strategic-direction.dto';

@TenantRequired()
@Controller('leadership-excellence/strategic-direction')
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class StrategicDirectionController {
  constructor(private readonly service: StrategicDirectionService) {}

  @Get()
  @Roles(...LEX_EDITORS)
  getDraft(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getDraft(user.organizationId);
  }

  @Get('approved')
  @Roles(...LEX_ALL)
  getApprovedDirection(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getApproved(user.organizationId);
  }

  @Patch('draft')
  @Roles(...LEX_EDITORS)
  saveDraft(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SaveDraftDto,
  ) {
    return this.service.saveDraft(user, dto);
  }
}
