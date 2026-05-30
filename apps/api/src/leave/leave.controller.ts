import {
    Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto, ReviewLeaveRequestDto, LeaveBalanceUpsertDto, LeaveQueryDto } from './dto/leave.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.LEAVE)
export class LeaveController {
    constructor(private leave: LeaveService) {}

    /** GET /leave/summary — pending/approved/rejected counts (HR/ADMIN/HOD) */
    @Get('summary')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getSummary(@CurrentUser() user: { organizationId: string }) {
        return this.leave.getSummary(user.organizationId);
    }

    /** GET /leave/balance — my leave balance for the current year */
    @Get('balance')
    getMyBalance(@CurrentUser() user: { userId: string; organizationId: string }) {
        return this.leave.getMyBalance(user.userId, user.organizationId);
    }

    /** GET /leave/balance/:employeeId — HR views a specific employee's balance */
    @Get('balance/:employeeId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getEmployeeBalance(
        @Param('employeeId') employeeId: string,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.getEmployeeBalance(employeeId, user.organizationId);
    }

    /** POST /leave/balance/:employeeId — HR sets leave allocation for an employee */
    @Post('balance/:employeeId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    upsertBalance(
        @Param('employeeId') employeeId: string,
        @Body() dto: LeaveBalanceUpsertDto,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.upsertBalance(employeeId, user.organizationId, dto);
    }

    /** GET /leave/requests — list (employees see own; HR/HOD see all) */
    @Get('requests')
    listRequests(
        @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
        @Query() query: LeaveQueryDto,
    ) {
        return this.leave.listRequests(user.organizationId, user.roleLevel, user.userId, query);
    }

    /** POST /leave/requests — employee submits a leave request */
    @Post('requests')
    submitRequest(
        @CurrentUser() user: { userId: string; organizationId: string },
        @Body() dto: CreateLeaveRequestDto,
    ) {
        return this.leave.submitRequest(user.userId, user.organizationId, dto);
    }

    /** GET /leave/requests/:id */
    @Get('requests/:id')
    getRequest(
        @Param('id') id: string,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.getRequest(id, user.organizationId);
    }

    /** PATCH /leave/requests/:id/review — HR/HOD approves or rejects */
    @Patch('requests/:id/review')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    reviewRequest(
        @Param('id') id: string,
        @Body() dto: ReviewLeaveRequestDto,
        @CurrentUser() user: { userId: string; organizationId: string },
    ) {
        return this.leave.reviewRequest(id, user.organizationId, user.userId, dto);
    }

    /** PATCH /leave/requests/:id/cancel — employee cancels their own request */
    @Patch('requests/:id/cancel')
    cancelRequest(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string; organizationId: string },
    ) {
        return this.leave.cancelRequest(id, user.organizationId, user.userId);
    }
}
