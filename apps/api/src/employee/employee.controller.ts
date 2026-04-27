import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, UpdateEmployeeDto, PaginationDto } from './dto/employee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('employee')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  // GET /employee/me — returns the employee profile for the logged-in user
  @Get('me')
  async getMe(@CurrentUser() user: { userId: string }) {
    return this.employeeService.getMyEmployeeProfile(user.userId);
  }

  // GET /employee/organization/:orgId/departments
  @Get('organization/:orgId/departments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
  async getDepartments(@Param('orgId') orgId: string) {
    return this.employeeService.getDepartmentsByOrganization(orgId);
  }

  /**
   * Get employee by ID
   * All authenticated users can view employee details
   * GET /employee/:id
   */
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.employeeService.getEmployeeById(id);
  }

  /**
   * Get all employees in an organization with pagination
   * SUPER_ADMIN, ADMIN, and MANAGEMENT can view all organization employees
   * GET /employee/organization/:orgId?page=1&limit=10
   */
  @Get('organization/:orgId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async getByOrganization(
    @Param('orgId') orgId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    const { page = 1, limit = 10 } = paginationDto;

    if (page < 1 || limit < 1) {
      throw new BadRequestException('Page and limit must be greater than 0');
    }

    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      this.employeeService.getEmployeesByOrganization(orgId, skip, limit),
      this.employeeService.countEmployeesByOrganization(orgId),
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
  ) {
    const { page = 1, limit = 10 } = paginationDto;

    if (page < 1 || limit < 1) {
      throw new BadRequestException('Page and limit must be greater than 0');
    }

    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      this.employeeService.getEmployeesByDepartment(deptId, undefined, skip, limit),
      this.employeeService.countEmployeesByDepartment(deptId),
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeeService.updateEmployee(id, updateEmployeeDto);
  }

  // DELETE /employee/:id
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async remove(@Param('id') id: string) {
    return this.employeeService.deleteEmployee(id);
  }
}
