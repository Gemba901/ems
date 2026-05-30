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

@Controller('ems')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
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
}
