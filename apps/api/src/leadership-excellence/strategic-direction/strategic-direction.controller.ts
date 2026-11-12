import {
  Controller,
  UseGuards,
  Get,
  Patch,
  Put,
  Body,
  Post,
} from '@nestjs/common';
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
import {
  DIRECTION_ADMINS,
  DIRECTION_EDITORS,
  DIRECTION_READERS,
} from './strategic-direction.roles';
import {
  ReasonDto,
  SaveDraftDto,
  SetApproversDto,
} from './dto/strategic-direction.dto';

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
  @Roles(...DIRECTION_EDITORS)
  getDraft(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getDraftFor(user);
  }

  @Get('history')
  @Roles(...DIRECTION_EDITORS)
  getHistory(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getHistory(user.organizationId);
  }

  @Get('approved')
  @Roles(...DIRECTION_READERS)
  getApprovedDirection(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getPublished(user.organizationId);
  }

  @Patch('draft')
  @Roles(...DIRECTION_EDITORS)
  saveDraft(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SaveDraftDto,
  ) {
    return this.service.saveDraft(user, dto);
  }

  @Post('submit')
  @Roles(...DIRECTION_EDITORS)
  submit(@CurrentUser() user: AccessTokenPayload) {
    return this.service.submit(user);
  }

  @Post('withdraw')
  @Roles(...DIRECTION_EDITORS)
  withdraw(@CurrentUser() user: AccessTokenPayload) {
    return this.service.withdraw(user);
  }

  @Post('return')
  @Roles(...DIRECTION_EDITORS)
  returnForChanges(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReasonDto,
  ) {
    return this.service.returnForChanges(user, dto.reason);
  }

  @Post('approve')
  @Roles(...DIRECTION_EDITORS)
  approve(@CurrentUser() user: AccessTokenPayload) {
    return this.service.approve(user);
  }

  @Post('revise')
  @Roles(...DIRECTION_EDITORS)
  startRevision(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReasonDto,
  ) {
    return this.service.startRevision(user, dto.reason);
  }

  @Get('approvers')
  @Roles(...DIRECTION_EDITORS)
  getApprovers(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getApprovers(user.organizationId);
  }

  @Get('approvers/candidates')
  @Roles(...DIRECTION_ADMINS)
  getApproverCandidates(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getApproverCandidates(user.organizationId);
  }

  @Put('approvers')
  @Roles(...DIRECTION_ADMINS)
  setApprovers(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SetApproversDto,
  ) {
    return this.service.setApprovers(user, dto.employeeIds);
  }
}
