import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateEmployeeRoleDto, UpdateAvatarDto, PaginationDto } from './dto/employee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@TenantRequired()
@Controller('employee')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard)
export class EmployeeController {
  constructor(private employeeService: EmployeeService) {}

  /**
   * Onboard a new employee
   * Only SUPER_ADMIN and ADMIN can onboard employees
   * POST /employee/onboard
   */
  @Post('onboard')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async onboard(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.employeeService.onboardEmployee(createEmployeeDto, user.organizationId);
  }

  /**
   * Bulk sync employees from an EMS Excel workbook.
   * POST /employee/import?dryRun=true
   */
  @Post('import')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  @UseInterceptors(FileInterceptor('file'))
  async importEmployees(
    @UploadedFile() file: any,
    @Query('dryRun') dryRun: string | undefined,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    if (!file?.buffer) throw new BadRequestException('Excel file is required');
    return this.employeeService.importEmployeesFromWorkbook(
      file.buffer,
      user.organizationId,
      user.userId,
      dryRun === 'true',
    );
  }

  // GET /employee/me — returns the employee profile for the logged-in user
  @Get('me')
  async getMe(@CurrentUser() user: { userId: string; organizationId: string }) {
    return this.employeeService.getMyEmployeeProfile(user.userId, user.organizationId);
  }

  // GET /employee/me/colleagues — department colleagues of the logged-in user (for team-member pickers)
  @Get('me/colleagues')
  async getMyColleagues(@CurrentUser() user: { userId: string; organizationId: string }) {
    return this.employeeService.getMyColleagues(user.userId, user.organizationId);
  }

  // GET /employee/organization/:orgId/departments
  @Get('organization/:orgId/departments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR)
  async getDepartments(@Param('orgId') orgId: string, @CurrentUser() user: { organizationId: string }) {
    if (orgId !== user.organizationId) throw new NotFoundException('Organization not found');
    return this.employeeService.getDepartmentsByOrganization(orgId);
  }

  // GET /employee/organization/:orgId/department-hods — HODs for the suggestion routing picker
  @Get('organization/:orgId/department-hods')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR)
  async getDepartmentHODs(@Param('orgId') orgId: string, @CurrentUser() user: { organizationId: string }) {
    if (orgId !== user.organizationId) throw new NotFoundException('Organization not found');
    return this.employeeService.getDepartmentHODs(orgId);
  }

  /**
   * Get employee by ID
   * All authenticated users can view employee details
   * GET /employee/:id
   */
  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.employeeService.getEmployeeById(id, user.organizationId);
  }

  // GET /employee/organization/:orgId/stats — workforce analytics for HR reports
  @Get('organization/:orgId/stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async getOrgStats(@Param('orgId') orgId: string, @CurrentUser() user: { organizationId: string }) {
    if (orgId !== user.organizationId) throw new NotFoundException('Organization not found');
    return this.employeeService.getOrganizationStats(orgId);
  }

  /**
   * Get all employees in an organization with pagination
   * SUPER_ADMIN, ADMIN, and MANAGEMENT can view all organization employees
   * GET /employee/organization/:orgId?page=1&limit=10
   */
  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR)
  async getByOrganization(
    @Param('orgId') orgId: string,
    @Query() paginationDto: PaginationDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    if (orgId !== user.organizationId) throw new NotFoundException('Organization not found');
    const { page = 1, limit = 10, search, departmentId } = paginationDto;

    if (page < 1 || limit < 1) {
      throw new BadRequestException('Page and limit must be greater than 0');
    }

    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      this.employeeService.getEmployeesByOrganization(orgId, skip, limit, search, departmentId),
      this.employeeService.countEmployeesByOrganization(orgId, search, departmentId),
    ]);

    return {
      data: employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get employees by department with pagination
   * HOD, MANAGEMENT, and ADMIN can view department employees
   * GET /employee/department/:deptId?page=1&limit=10
   */
  @Get('department/:deptId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
  async getByDepartment(
    @Param('deptId') deptId: string,
    @Query() paginationDto: PaginationDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    const { page = 1, limit = 10 } = paginationDto;

    if (page < 1 || limit < 1) {
      throw new BadRequestException('Page and limit must be greater than 0');
    }

    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      this.employeeService.getEmployeesByDepartment(deptId, user.organizationId, skip, limit),
      this.employeeService.countEmployeesByDepartment(deptId, user.organizationId),
    ]);

    return {
      data: employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update employee details
   * Only SUPER_ADMIN and ADMIN can update employees
   * PUT /employee/:id
   */
  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.employeeService.updateEmployee(id, updateEmployeeDto, user.organizationId);
  }

  // DELETE /employee/:id
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async remove(@Param('id') id: string, @CurrentUser() user: { organizationId: string }) {
    return this.employeeService.deleteEmployee(id, user.organizationId);
  }

  // PATCH /employee/company/theme — admin updates their company's primary color
  @Patch('company/theme')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async updateCompanyTheme(
    @Body() body: { primaryColor: string },
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.employeeService.updateCompanyTheme(user.organizationId, body.primaryColor);
  }

  // PATCH /employee/:id/role — change an employee's role within the org
  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeRoleDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.employeeService.updateEmployeeRole(id, dto.roleId, user.organizationId);
  }

  // PATCH /employee/:id/reset-password — admin clears an employee's password; they'll be
  // prompted to set a new one via the first-time-setup flow on their next login attempt
  @Patch(':id/reset-password')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.employeeService.resetEmployeePassword(id, user.organizationId);
  }

  // PATCH /employee/:id/avatar — update avatar URL
  @Patch(':id/avatar')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE)
  async updateAvatar(
    @Param('id') id: string,
    @Body() dto: UpdateAvatarDto,
    @CurrentUser() user: { organizationId: string; userId: string; roleLevel: Role },
  ) {
    return this.employeeService.updateAvatar(id, dto.avatarUrl, user.organizationId, user.userId, user.roleLevel);
  }
}
