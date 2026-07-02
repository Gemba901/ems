import { Controller, UseGuards, Post, Get, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { DepartmentsService } from './departments.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
    constructor(private departmentsService: DepartmentsService) {}

    // only admins can create departments
    @Post()
    @Roles(Role.ADMIN)
    createDepartment(@Body() body: { name: string }, @Request() req) {
        return this.departmentsService.createDepartment(body.name, req.user.organizationId);
    }

    // both admins and managers can view departments in their organization
    @Get()
    @Roles(Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    getDepartments(@Request() req) {
        return this.departmentsService.getDepartments(req.user.organizationId);
    }

    // both admins and managers can view a single department by id
    @Get(':id')
    @Roles(Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    getDepartmentById(@Request() req) {
        return this.departmentsService.getDepartmentById(req.params.id);
    }

    // only admins can rename a department
    @Patch(':id')
    @Roles(Role.ADMIN)
    updateDepartment(@Param('id') id: string, @Body() body: { name: string }, @Request() req) {
        return this.departmentsService.updateDepartment(id, body.name, req.user.organizationId);
    }

    // only admins can delete a department, and only if it has no employees
    @Delete(':id')
    @Roles(Role.ADMIN)
    deleteDepartment(@Param('id') id: string, @Request() req) {
        return this.departmentsService.deleteDepartment(id, req.user.organizationId);
    }
}
