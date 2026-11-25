import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import {
  MONITORING_ORG_WIDE,
  MONITORING_READERS,
  MONITORING_VERIFIERS,
} from './monitoring-control.roles';
import { VerificationService } from './verification/verification.service';
import { PerformanceService } from './performance/performance.service';
import { AlertsService } from './alerts/alerts.service';
import { DirectoryService } from './directory/directory.service';
import {
  ActionCheckDto,
  AlertNoteDto,
  AlertQueryDto,
  LinkFollowUpDto,
  MonitoringQueryDto,
  MonitoringSettingsDto,
  ReturnResultsDto,
  VerifyResultsDto,
} from './dto/monitoring-control.dto';

@TenantRequired()
@Controller('leadership-excellence/monitoring-control')
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class MonitoringControlController {
  constructor(
    private readonly verification: VerificationService,
    private readonly performance: PerformanceService,
    private readonly alerts: AlertsService,
    private readonly directory: DirectoryService,
  ) {}

  /** Names for the ids shown on the screens, and the caller's employee id. */
  @Get('directory')
  @Roles(...MONITORING_READERS)
  getDirectory(@CurrentUser() user: AccessTokenPayload) {
    return this.directory.get(user);
  }

  // ── 05.01 Verify results ──────────────────────────────
  @Get('verification/queue')
  @Roles(...MONITORING_VERIFIERS)
  queue(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: MonitoringQueryDto,
  ) {
    return this.verification.getQueue(user, q);
  }

  @Get('verification/history')
  @Roles(...MONITORING_READERS)
  history(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: MonitoringQueryDto,
  ) {
    return this.verification.getHistory(user, q);
  }

  @Post('verification/verify')
  @Roles(...MONITORING_VERIFIERS)
  verify(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: VerifyResultsDto,
  ) {
    return this.verification.verify(user, dto);
  }

  @Post('verification/return')
  @Roles(...MONITORING_VERIFIERS)
  returnResults(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReturnResultsDto,
  ) {
    return this.verification.returnForCorrection(user, dto);
  }

  @Get('verification/actions')
  @Roles(...MONITORING_VERIFIERS)
  actionChecks(@CurrentUser() user: AccessTokenPayload) {
    return this.verification.listActionChecks(user);
  }

  @Post('verification/actions/:actionId/check')
  @Roles(...MONITORING_VERIFIERS)
  checkAction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('actionId') actionId: string,
    @Body() dto: ActionCheckDto,
  ) {
    return this.verification.checkAction(user, actionId, dto);
  }

  // ── 05.02 Performance & gaps ──────────────────────────
  @Get('performance')
  @Roles(...MONITORING_READERS)
  overview(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: MonitoringQueryDto,
  ) {
    return this.performance.getOverview(user, q);
  }

  @Get('settings')
  @Roles(...MONITORING_READERS)
  getSettings(@CurrentUser() user: AccessTokenPayload) {
    return this.performance.getSettings(user);
  }

  @Put('settings')
  @Roles(...MONITORING_ORG_WIDE)
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: MonitoringSettingsDto,
  ) {
    return this.performance.updateSettings(user, dto);
  }

  @Get('performance/:assignmentId')
  @Roles(...MONITORING_READERS)
  detail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.performance.getAssignmentDetail(user, assignmentId);
  }

  // ── 05.03 Alerts & follow-up ──────────────────────────
  @Get('alerts')
  @Roles(...MONITORING_READERS)
  listAlerts(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: AlertQueryDto,
  ) {
    return this.alerts.list(user, q);
  }

  @Get('alerts/linkable-actions')
  @Roles(...MONITORING_READERS)
  linkableActions(@CurrentUser() user: AccessTokenPayload) {
    return this.alerts.linkableActions(user);
  }

  @Post('alerts/:id/acknowledge')
  @Roles(...MONITORING_READERS)
  acknowledge(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AlertNoteDto,
  ) {
    return this.alerts.acknowledge(user, id, dto.note);
  }

  @Post('alerts/:id/escalate')
  @Roles(...MONITORING_READERS)
  escalate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AlertNoteDto,
  ) {
    return this.alerts.escalate(user, id, dto.note);
  }

  @Post('alerts/:id/follow-up')
  @Roles(...MONITORING_READERS)
  followUp(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkFollowUpDto,
  ) {
    return this.alerts.linkFollowUp(user, id, dto);
  }
}
