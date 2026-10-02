import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import {
  Controller, Get, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { EmsService } from './ems.service';
import { UpdateEmployeeEmsDto, QueryEmsEmployeesDto } from './dto/ems.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';
import { Post } from '@nestjs/common';   // add Post to the existing { Controller, Get, Patch, ... } import
import { AddOnboardingRecordsDto, CreateOnboardingBatchDto, 
  UpdateOnboardingRecordDto, ExcludeOnboardingRecordDto } from './dto/onboarding.dto';

@TenantRequired()
@Controller('ems')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.EMS)
export class EmsController {
  constructor(private ems: EmsService) {}

  /** GET /ems/me — employee's own profile + completion */
  @Get('me')
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

  /** GET /ems/employees/:id — single employee detail */
  @Get('employees/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getEmployee(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.ems.getEmployeeById(id, user.organizationId);
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

  /** POST /ems/onboarding/batches/:id/records — load rows into an import */
  @Post('onboarding/batches/:id/records')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async addOnboardingRecords(
    @Param('id') id: string,
    @Body() dto: AddOnboardingRecordsDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.ems.addOnboardingRecords(user.organizationId, id, dto);
  }
    
  /** POST /ems/onboarding/batches/:id/validate — check every record */
  @Post('onboarding/batches/:id/validate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async validateOnboardingBatch(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
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
}
