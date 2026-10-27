import { UpdateDepartmentHodDto, UpdateEmployeeRelieversDto, UpdateEmployeeHodDto } from './dto/onboarding.dto';
import { UpdateEmployeeReportingDto } from './dto/onboarding.dto';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import {
  Controller, Get, Patch, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { EmsService } from './ems.service';
import { EmsInvitationsService } from './ems-invitations';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import { EmsDemoOnly, EmsDemoToolsGuard } from './ems-demo-tools.guard';
import { UpdateEmployeeEmsDto, QueryEmsEmployeesDto, ChangeEmploymentStatusDto, InvitationSelectionDto, SendInvitationsDto } from './dto/ems.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule, SkipModuleCheck } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';
import { Post, Delete, Put } from '@nestjs/common';   // add Post to the existing { Controller, Get, Patch, ... } import
import { AddOnboardingRecordsDto, CreateOnboardingBatchDto, UpdateCommunicationChannelDto,
  UpdateOnboardingRecordDto, ExcludeOnboardingRecordDto, UpdateOnboardingBatchCountryDto, ConfirmOnboardingDuplicateDto,
  ExcludeRemainingOnboardingRecordsDto, ForgetImportColumnChoicesDto, LookupImportColumnChoicesDto, SaveImportColumnChoicesDto, SetOnboardingColumnDestinationDto } from './dto/onboarding.dto';

@TenantRequired()
@Controller('ems')
@UseGuards(EmsDemoToolsGuard, TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.EMS)
export class EmsController {
  constructor(private ems: EmsService, private invitations: EmsInvitationsService) {}

  /** GET /ems/me — employee's own profile + completion. Every user has a profile, so this isn't EMS-gated. */
  @Get('me')
  @SkipModuleCheck()
  async getMyProfile(@CurrentUser() user: { userId: string; organizationId: string }) {
    return this.ems.getMyProfile(user.userId, user.organizationId);
  }

  /** GET /ems/dashboard — Admin/HR org-wide stats */
  @Get('dashboard')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getDashboard(@CurrentUser() user: { organizationId: string }) {
    return this.ems.getDashboard(user.organizationId);
  }

  /** GET /ems/employees — paginated employee list with completion */
  @Get('employees')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployees(
    @Query() query: QueryEmsEmployeesDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.getEmployees(user.organizationId, query);
  }

  /** POST /ems/employees/invitations/preview — who would get which invitation, and who is skipped */
  @Post('employees/invitations/preview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async previewInvitations(@Body() dto: InvitationSelectionDto, @CurrentUser() user: { organizationId: string }) {
    return this.invitations.preview(user.organizationId, dto);
  }

  /** POST /ems/employees/invitations/send — email them, or prepare WhatsApp messages for HR to share */
  @Post('employees/invitations/send')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async sendInvitations(@Body() dto: SendInvitationsDto, @Req() request: TenantRequest,
    @CurrentUser() user: { organizationId: string; userId: string }) {
    // The guard has verified this header; links may only point at this company's address.
    const host = request.headers['x-gemba-tenant-hostname'];
    return this.invitations.send(user.organizationId, user.userId, dto, dto.origin, typeof host === 'string' ? host : undefined);
  }

  @Get('employees/:id/invitation')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployeeInvitation(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.invitations.getForEmployee(user.organizationId, id);
  }

  @Patch('employees/:id/invitation/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async cancelEmployeeInvitation(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.invitations.cancel(user.organizationId, id);
  }

  /** Import sources for the employee-list filter; must precede employees/:id. */
  @Get('employees/import-batches')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployeeImportBatches(@CurrentUser() user: { organizationId: string }) {
    return this.ems.getEmployeeImportBatches(user.organizationId);
  }

  /** GET /ems/employees/:id — single employee detail */
  @Get('employees/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployee(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.getEmployeeById(id, user.organizationId);
  }

  @Get('employees/:id/employment-status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmploymentStatus(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.ems.getEmploymentStatus(id, user.organizationId);
  }

  @Patch('employees/:id/employment-status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async changeEmploymentStatus(@Param('id') id: string, @Body() dto: ChangeEmploymentStatusDto,
    @CurrentUser() user: { organizationId: string; userId: string }) {
    return this.ems.changeEmploymentStatus(id, user.organizationId, user.userId, dto);
  }

  @Post('employees/:id/employment-status/:changeId/retry-sync')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async retryEmploymentActivitySync(@Param('id') id: string, @Param('changeId') changeId: string,
    @CurrentUser() user: { organizationId: string }) {
    return this.ems.retryEmploymentActivitySync(id, user.organizationId, changeId);
  }

  @Get('employees/:id/reporting')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployeeReporting(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.ems.getEmployeeReporting(id, user.organizationId);
  }

  @Patch('employees/:id/reporting')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async updateEmployeeReporting(@Param('id') id: string, @Body() dto: UpdateEmployeeReportingDto,
    @CurrentUser() user: { organizationId: string }) {
    return this.ems.updateEmployeeReporting(id, user.organizationId, dto.target);
  }

  /** PATCH /ems/employees/:id — update employee EMS data */
  @Patch('employees/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeEmsDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.updateEmployee(id, user.organizationId, dto);
  }
  /** GET /ems/onboarding/communication-channel — the org's chosen channel, or null */
  @Get('onboarding/communication-channel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getCommunicationChannel(@CurrentUser() user: { organizationId: string }) {
    return this.ems.getCommunicationChannel(user.organizationId);
  }

  /** PATCH /ems/onboarding/communication-channel — choose WhatsApp or email */
  @Patch('onboarding/communication-channel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async updateCommunicationChannel(
    @Body() dto: UpdateCommunicationChannelDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.updateCommunicationChannel(user.organizationId, dto);
  }

  /** DELETE /ems/onboarding/communication-channel — deliberately enabled demos only */
  @Delete('onboarding/communication-channel')
  @EmsDemoOnly()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async resetCommunicationChannel(@CurrentUser() user: { organizationId: string }) {
    return this.ems.resetCommunicationChannel(user.organizationId);
  }

  /** POST /ems/onboarding/column-choices/lookup — remembered destinations for these headings */
  @Post('onboarding/column-choices/lookup')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async lookupImportColumnChoices(@Body() dto: LookupImportColumnChoicesDto, @CurrentUser() user: { organizationId: string }) {
    return this.ems.lookupImportColumnChoices(user.organizationId, dto);
  }

  /** POST /ems/onboarding/column-choices/forget — forget remembered destinations for these headings */
  @Post('onboarding/column-choices/forget')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async forgetImportColumnChoices(@Body() dto: ForgetImportColumnChoicesDto, @CurrentUser() user: { organizationId: string }) {
    return this.ems.forgetImportColumnChoices(user.organizationId, dto);
  }

  /** PUT /ems/onboarding/column-choices — remember confirmed column choices */
  @Put('onboarding/column-choices')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async saveImportColumnChoices(@Body() dto: SaveImportColumnChoicesDto, @CurrentUser() user: { organizationId: string; userId: string }) {
    return this.ems.saveImportColumnChoices(user.organizationId, user.userId, dto);
  }

    /** POST /ems/onboarding/batches — start a new import */
  @Post('onboarding/batches')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async createOnboardingBatch(
    @Body() dto: CreateOnboardingBatchDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.ems.createOnboardingBatch(user.userId, user.organizationId, dto);
  }

  /** GET /ems/onboarding/batches — list imports */
  @Get('onboarding/batches')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async listOnboardingBatches(@CurrentUser() user: { organizationId: string }) {
    return this.ems.listOnboardingBatches(user.organizationId);
  }

  /** GET /ems/onboarding/batches/:id — one import with its rows */
  @Get('onboarding/batches/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.getOnboardingBatch(user.organizationId, id);
  }

  @Patch('onboarding/batches/:id/phone-country')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async updateOnboardingBatchCountry(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingBatchCountryDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.updateOnboardingBatchCountry(user.organizationId, id, dto);
  }

  /** POST /ems/onboarding/batches/:id/records — load rows into an import */
  @Post('onboarding/batches/:id/records')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async addOnboardingRecords(
    @Param('id') id: string,
    @Body() dto: AddOnboardingRecordsDto,
    @CurrentUser() user: { userId: string; organizationId: string },
    @Query('response') response?: string,
  ) {
    if (response === 'ack') return this.ems.addOnboardingRecordsAck(user.organizationId, id, dto);
    return this.ems.addOnboardingRecords(user.organizationId, id, dto);
  }
    
  /** POST /ems/onboarding/batches/:id/validate — check every record */
  @Post('onboarding/batches/:id/validate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async validateOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
    @Query('response') response?: string,
  ) {
    if (response === 'ack') return this.ems.validateOnboardingBatchAck(user.organizationId, id);
    return this.ems.validateOnboardingBatch(user.organizationId, id);
  }

    /** PATCH /ems/onboarding/records/:id — correct a record's fields */
  @Patch('onboarding/records/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async updateOnboardingRecord(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingRecordDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.updateOnboardingRecord(user.organizationId, id, dto);
  }

  @Post('onboarding/records/:id/confirm-different-person')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async confirmOnboardingDifferentPerson(
    @Param('id') id: string,
    @Body() dto: ConfirmOnboardingDuplicateDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.ems.confirmOnboardingDifferentPerson(user.organizationId, id, user.userId, dto.token);
  }

  @Post('onboarding/records/:id/undo-different-person')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async undoOnboardingDifferentPerson(
    @Param('id') id: string,
    @Body() dto: ConfirmOnboardingDuplicateDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.ems.undoOnboardingDifferentPerson(user.organizationId, id, user.userId, dto.token);
  }

  /** PATCH /ems/onboarding/records/:id/exclude — leave this row out */
  @Patch('onboarding/records/:id/exclude')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async excludeOnboardingRecord(
    @Param('id') id: string,
    @Body() dto: ExcludeOnboardingRecordDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.excludeOnboardingRecord(user.organizationId, id, dto);
  }

  /** PATCH /ems/onboarding/records/:id/include — undo an exclusion */
  @Patch('onboarding/records/:id/include')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async includeOnboardingRecord(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.includeOnboardingRecord(user.organizationId, id);
  }

  /** GET /ems/onboarding/batches/:id/exclude-remaining — preview excluding every unregistered record */
  @Get('onboarding/batches/:id/exclude-remaining')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async previewExcludeRemainingOnboardingRecords(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.previewExcludeRemainingOnboardingRecords(user.organizationId, id);
  }

  /** POST /ems/onboarding/batches/:id/exclude-remaining — exclude the reviewed unregistered records */
  @Post('onboarding/batches/:id/exclude-remaining')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async excludeRemainingOnboardingRecords(
    @Param('id') id: string,
    @Body() dto: ExcludeRemainingOnboardingRecordsDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.excludeRemainingOnboardingRecords(user.organizationId, id, dto);
  }

  /** PATCH /ems/onboarding/batches/:id/column-destination — one extra column's destination for all unregistered records */
  @Patch('onboarding/batches/:id/column-destination')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async setOnboardingColumnDestination(
    @Param('id') id: string,
    @Body() dto: SetOnboardingColumnDestinationDto,
    @CurrentUser() user: { organizationId: string; userId: string },
  ) {
    return this.ems.setOnboardingColumnDestination(user.organizationId, id, user.userId, dto);
  }

  /** POST /ems/onboarding/batches/:id/register — turn ready records into employees */
  @Post('onboarding/batches/:id/register')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async registerOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string; roleLevel: Role },
  ) {
    return this.ems.registerOnboardingBatch(user.organizationId, id, user.roleLevel);
  }

  /** PATCH /ems/onboarding/batches/:id/cancel — abandon an import */
  @Patch('onboarding/batches/:id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async cancelOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.cancelOnboardingBatch(user.organizationId, id);
  }

  /** DELETE /ems/onboarding/batches/:id — remove a cancelled import */
  @Delete('onboarding/batches/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async deleteOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.deleteOnboardingBatch(user.organizationId, id);
  }
  @Patch('onboarding/batches/:id/department-hod')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  updateOnboardingDepartmentHod(@Param('id') id: string, @Body() dto: UpdateDepartmentHodDto,
    @CurrentUser() user: { organizationId: string; userId: string }) {
    return this.ems.updateOnboardingDepartmentHod(user.organizationId, id, dto.recordId, dto.target, dto.expectedVersion, user.userId);
  }

  @Get('employees/:id/people-links')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  getEmployeePeopleLinks(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.ems.getEmployeePeopleLinks(id, user.organizationId);
  }

  @Patch('employees/:id/relievers')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  updateEmployeeRelievers(@Param('id') id: string, @Body() dto: UpdateEmployeeRelieversDto,
    @CurrentUser() user: { organizationId: string }) {
    return this.ems.updateEmployeeRelievers(id, user.organizationId, dto.first, dto.second, dto.expectedVersion);
  }

  @Patch('employees/:id/department-hod')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  updateEmployeeDepartmentHod(@Param('id') id: string, @Body() dto: UpdateEmployeeHodDto,
    @CurrentUser() user: { organizationId: string; userId: string }) {
    return this.ems.updateEmployeeDepartmentHod(id, user.organizationId, dto.target, dto.expectedVersion, user.userId);
  }

}
