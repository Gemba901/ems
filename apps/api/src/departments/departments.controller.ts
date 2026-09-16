import { Controller, UseGuards, Post, Get, Patch, Delete, Body, Param, Request, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { DepartmentsService } from './departments.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

import { TenantRequired } from '../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import type { TenantRequest } from '../tenancy/tenant-context';

@Controller('departments')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard)
export class DepartmentsController {
    constructor(private departmentsService: DepartmentsService) {}

    private organizationId(request: TenantRequest): string {
        // Never allow missing context to become an undefined Prisma filter.
        if (!request.tenant?.organizationId) {
            throw new UnauthorizedException('Company context is required.');
        }
        return request.tenant.organizationId;
    }

    // only admins can create departments
    @Post()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    createDepartment(@Body() body: { name: string }, @Request() req: TenantRequest) {
        return this.departmentsService.createDepartment(body.name, this.organizationId(req));
    }

    // both admins and managers can view departments in their organization
    @Get()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    getDepartments(@Request() req: TenantRequest) {
        return this.departmentsService.getDepartments(this.organizationId(req));
    }

    // both admins and managers can view a single department by id
    @Get(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    getDepartmentById(@Param('id') id: string, @Request() req: TenantRequest) {
        return this.departmentsService.getDepartmentById(id, this.organizationId(req));
    }

    // only admins can rename a department
    @Patch(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    updateDepartment(@Param('id') id: string, @Body() body: { name: string }, @Request() req: TenantRequest) {
        return this.departmentsService.updateDepartment(id, body.name, this.organizationId(req));
    }

    // only admins can delete a department, and only if it has no employees
    @Delete(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    deleteDepartment(@Param('id') id: string, @Request() req: TenantRequest) {
        return this.departmentsService.deleteDepartment(id, this.organizationId(req));
    }
}
