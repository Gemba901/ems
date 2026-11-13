import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  PlanningEvidenceService,
  type PlanningFile,
} from './planning-evidence.service';
import { PlanningBackupService } from './planning-backup.service';
import { ModuleType } from 'db';
import { TenantRequired } from '../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../../tenancy/tenant.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { RequiresModule } from '../../auth/decorators/module.decorator';
import { PerformancePlanningService } from './performance-planning.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { Roles } from '../../auth/decorators/roles.decorator';
import { LEX_ALL } from '../common/lex-roles';
import { PlanningCommandDto } from './dto/performance-planning.dto';
import {
  calendarPeriods,
  resolveAssignmentCalendar,
} from './planning-calendar';
import { PlanningReferencesService } from './planning-references.service';
import type { Frequency } from './planning.types';

@TenantRequired()
@Controller('leadership-excellence/performance-planning')
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
@Roles(...LEX_ALL)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PerformancePlanningController {
  constructor(
    private readonly service: PerformancePlanningService,
    private readonly evidence: PlanningEvidenceService,
    private readonly backup: PlanningBackupService,
    private readonly references: PlanningReferencesService,
  ) {}

  @Get('backup')
  @Header('Cache-Control', 'no-store')
  exportBackup(@CurrentUser() user: AccessTokenPayload) {
    return this.backup.export(user);
  }

  @Post('restore')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 16 * 1024 * 1024, files: 1 },
    }),
  )
  restoreBackup(
    @CurrentUser() user: AccessTokenPayload,
    @Query('revision') revision: string,
    @UploadedFile() file: PlanningFile,
  ) {
    return this.backup.restore(user, Number(revision), file);
  }

  @Get(':documentId/findings/:findingId/evidence')
  @Header('Cache-Control', 'no-store')
  evidenceList(
    @CurrentUser() user: AccessTokenPayload,
    @Param('documentId') documentId: string,
    @Param('findingId') findingId: string,
  ) {
    return this.evidence.list(user, documentId, findingId);
  }

  @Post(':documentId/findings/:findingId/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 512000, files: 1 } }),
  )
  evidenceUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('documentId') documentId: string,
    @Param('findingId') findingId: string,
    @Query('revision') revision: string,
    @UploadedFile() file: PlanningFile,
  ) {
    return this.evidence.upload(
      user,
      documentId,
      findingId,
      Number(revision),
      file,
    );
  }

  @Get(':documentId/findings/:findingId/evidence/:id')
  async evidenceDownload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('documentId') documentId: string,
    @Param('findingId') findingId: string,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.evidence.download(user, documentId, findingId, id);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.send(Buffer.from(file.content));
  }

  @Get('periods')
  async periods(
    @CurrentUser() user: AccessTokenPayload,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('frequency') frequency: Frequency,
    @Query('weekStart') weekStart?: string,
    @Query('fortnightAnchor') fortnightAnchor?: string,
    @Query('twiceMonthlySplit') twiceMonthlySplit?: string,
    @Query('submissionDueDays') submissionDueDays?: string,
    @Query('documentId') documentId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('useCurrentCalendar') useCurrentCalendar?: string,
  ) {
    let baseCalendar;
    if (documentId && assignmentId && useCurrentCalendar !== 'true') {
      const view = await this.service.getWorkspace(user);
      const assignment = view.documents
        .find((document) => document.id === documentId)
        ?.data.assignments.find((item) => item.id === assignmentId);
      if (!assignment) throw new NotFoundException('KPI assignment not found.');
      baseCalendar = assignment.calendar;
    }
    const calendar = resolveAssignmentCalendar(
      baseCalendar || (await this.references.getCalendar(user.organizationId)),
      {
        ...(weekStart !== undefined ? { weekStart: Number(weekStart) } : {}),
        ...(fortnightAnchor !== undefined ? { fortnightAnchor } : {}),
        ...(twiceMonthlySplit !== undefined
          ? { twiceMonthlySplit: Number(twiceMonthlySplit) }
          : {}),
        ...(submissionDueDays !== undefined
          ? { submissionDueDays: Number(submissionDueDays) }
          : {}),
      },
    );
    return calendarPeriods(start, end, frequency, calendar);
  }

  @Get('workspace')
  @Header('Cache-Control', 'no-store')
  workspace(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getWorkspace(user);
  }

  @Post('commands')
  @Header('Cache-Control', 'no-store')
  command(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: PlanningCommandDto,
  ) {
    return this.service.command(user, dto);
  }

  @Get('approved')
  @Header('Cache-Control', 'no-store')
  approved(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getApproved(user);
  }
}
