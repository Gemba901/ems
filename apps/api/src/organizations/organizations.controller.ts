import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    HttpCode,
    HttpStatus,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationsService } from './organizations.service';
import { EmployeeService } from 'src/employee/employee.service';
import {
    CreateOrganizationDto,
    UpdateOrganizationDto,
    UpdateOrgStatusDto,
    OrgPaginationDto,
    OrgEmployeePaginationDto,
} from './dto/organizations.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

/**
 * All routes in this controller are restricted to SUPER_ADMIN only.
 * The guard is applied at the controller level so every endpoint inherits it.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
        private readonly employeeService: EmployeeService,
    ) {}

    // ── Platform stats ───────────────────────────────────────────────────────
    /**
     * GET /organizations/stats
     * Returns aggregated platform-wide metrics.
     * Declared before /:id to prevent "stats" being captured as a param.
     */
    @Get('stats')
    getPlatformStats() {
        return this.organizationsService.getPlatformStats();
    }

    // ── GembaPMS platform team ───────────────────────────────────────────────
    /**
     * GET /organizations/platform-admins
     * Existing users holding SUPER_ADMIN in any org — candidates for the
     * GembaPMS platform-team department added to new organizations.
     * Declared before /:id to prevent "platform-admins" being captured as a param.
     */
    @Get('platform-admins')
    getPlatformSuperAdmins() {
        return this.organizationsService.getPlatformSuperAdmins();
    }

    // ── List ─────────────────────────────────────────────────────────────────
    /**
     * GET /organizations?page=1&limit=20
     * Paginated list of all organizations with counts.
     */
    @Get()
    listAll(@Query() dto: OrgPaginationDto) {
        return this.organizationsService.listAll(dto);
    }

    // ── Single org ───────────────────────────────────────────────────────────
    /**
     * GET /organizations/:id
     * Full organization detail including departments and counts.
     */
    @Get(':id')
    getById(@Param('id') id: string) {
        return this.organizationsService.getById(id);
    }

    /**
     * GET /organizations/:id/stats
     * Per-organization aggregate stats: employees, suggestions, rates, 30-day activity.
     */
    @Get(':id/stats')
    getOrgStats(@Param('id') id: string) {
        return this.organizationsService.getOrgStats(id);
    }

    /**
     * GET /organizations/:id/departments
     * All departments in this org with employee count per department.
     */
    @Get(':id/departments')
    getDepartments(@Param('id') id: string) {
        return this.organizationsService.getDepartments(id);
    }

    /**
     * GET /organizations/:id/employees?page=1&limit=20&departmentId=xxx
     * Paginated employee list. Optional departmentId filter.
     */
    @Get(':id/employees')
    getEmployees(
        @Param('id') id: string,
        @Query() dto: OrgEmployeePaginationDto,
    ) {
        return this.organizationsService.getEmployees(id, dto);
    }

    /**
     * POST /organizations/:id/employees/import?dryRun=true
     * Super-admin employee master sync for a selected client organization.
     */
    @Post(':id/employees/import')
    @UseInterceptors(FileInterceptor('file'))
    importEmployees(
        @Param('id') id: string,
        @UploadedFile() file: any,
        @Query('dryRun') dryRun: string | undefined,
    ) {
        if (!file?.buffer) throw new BadRequestException('Excel file is required');
        return this.employeeService.importEmployeesFromWorkbook(
            file.buffer,
            id,
            undefined,
            dryRun === 'true',
        );
    }

    /**
     * GET /organizations/:id/suggestions?page=1&limit=20
     * Paginated suggestions submitted by employees in this org.
     */
    @Get(':id/suggestions')
    getSuggestions(
        @Param('id') id: string,
        @Query() dto: OrgPaginationDto,
    ) {
        return this.organizationsService.getSuggestions(id, dto);
    }

    /**
     * GET /organizations/:id/roles
     * All roles configured for this org with user count and permissions.
     */
    @Get(':id/roles')
    getRoles(@Param('id') id: string) {
        return this.organizationsService.getRoles(id);
    }

    // ── Mutations ────────────────────────────────────────────────────────────
    /**
     * POST /organizations
     * Create a new organization. Automatically seeds 5 default roles.
     */
    @Post()
    create(@Body() dto: CreateOrganizationDto) {
        return this.organizationsService.create(dto);
    }

    /**
     * PATCH /organizations/:id
     * Update organization profile fields (name, logo, industry, contact info).
     * SUPER_ADMIN can update any org; ADMIN can only update their own.
     */
    @Patch(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    update(
        @Param('id') id: string,
        @Body() dto: UpdateOrganizationDto,
        @CurrentUser() user: { organizationId: string; roleLevel: Role },
    ) {
        if (user.roleLevel !== Role.SUPER_ADMIN && user.organizationId !== id) {
            throw new ForbiddenException('You can only update your own organization');
        }
        return this.organizationsService.update(id, dto);
    }

    /**
     * PATCH /organizations/:id/set-admin-org
     * Designate this organization as the platform company (Gemba PMS).
     * Unsets any previous admin org. Only one org can hold this flag at a time.
     */
    @Patch(':id/set-admin-org')
    setAdminOrg(@Param('id') id: string) {
        return this.organizationsService.setAdminOrg(id);
    }

    /**
     * PATCH /organizations/:id/status
     * Change org lifecycle status: ACTIVE | SUSPENDED | INACTIVE.
     * SUSPENDED = read-only access still works, new logins blocked.
     * INACTIVE  = required before hard delete.
     */
    @Patch(':id/status')
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateOrgStatusDto,
    ) {
        return this.organizationsService.updateStatus(id, dto.status);
    }

    /**
     * DELETE /organizations/:id
     * Permanently deletes the org and all its data in a safe transaction order.
     * Org must be INACTIVE first — prevents accidental deletion of live orgs.
     */
    /**
     * One-shot cleanup: removes User rows that have no org memberships and no
     * linked employees (left behind by the now-fixed org-delete bug).
     * Must be declared before DELETE :id so the literal path wins.
     */
    @Delete('orphan-users')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPER_ADMIN)
    @HttpCode(HttpStatus.OK)
    deleteOrphanUsers() {
        return this.organizationsService.deleteOrphanUsers();
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    delete(
        @Param('id') id: string,
        @Query('confirmName') confirmName?: string,
    ) {
        return this.organizationsService.delete(id, confirmName);
    }
}
