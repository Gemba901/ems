import {
    Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import {
    CreateLeaveRequestDto, ReviewLeaveRequestDto, LeaveBalanceUpsertDto,
    LeaveQueryDto, UpsertLeavePolicyDto, ApplyLeavePolicyDto,
    UpdateLeaveSettingsDto, UpdateDeptMinHeadcountDto,
} from './dto/leave.dto';
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

    // ── Policy ────────────────────────────────────────────────────────────────

    @Get('policy')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    getPolicy(
        @CurrentUser() user: { organizationId: string },
        @Query('year') year?: string,
    ) {
        return this.leave.getPolicy(user.organizationId, year ? parseInt(year) : new Date().getFullYear());
    }

    @Post('policy')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    upsertPolicy(
        @CurrentUser() user: { organizationId: string },
        @Body() dto: UpsertLeavePolicyDto,
    ) {
        return this.leave.upsertPolicy(user.organizationId, dto);
    }

    @Post('policy/apply')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    applyPolicy(
        @CurrentUser() user: { organizationId: string },
        @Body() dto: ApplyLeavePolicyDto,
    ) {
        return this.leave.applyPolicy(user.organizationId, dto);
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    @Get('settings')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    getSettings(@CurrentUser() user: { organizationId: string }) {
        return this.leave.getLeaveSettings(user.organizationId);
    }

    @Patch('settings')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    updateSettings(
        @CurrentUser() user: { organizationId: string },
        @Body() dto: UpdateLeaveSettingsDto,
    ) {
        return this.leave.updateLeaveSettings(user.organizationId, dto);
    }

    // ── Departments ───────────────────────────────────────────────────────────

    @Get('departments')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    getDepartments(@CurrentUser() user: { organizationId: string }) {
        return this.leave.getDepartments(user.organizationId);
    }

    @Patch('departments/:deptId/min-headcount')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    updateDeptMin(
        @Param('deptId') deptId: string,
        @Body() dto: UpdateDeptMinHeadcountDto,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.updateDeptMinHeadcount(deptId, user.organizationId, dto);
    }

    // ── Colleagues / Overlap ──────────────────────────────────────────────────

    @Get('colleagues')
    getColleagues(@CurrentUser() user: { userId: string; organizationId: string }) {
        return this.leave.getColleagues(user.userId, user.organizationId);
    }

    @Get('overlap')
    checkOverlap(
        @CurrentUser() user: { userId: string; organizationId: string },
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.leave.checkOverlap(user.organizationId, startDate, endDate, user.userId);
    }

    // ── Summary / Analytics ───────────────────────────────────────────────────

    @Get('summary')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getSummary(
        @CurrentUser() user: { organizationId: string },
        @Query('year') year?: string,
    ) {
        return this.leave.getSummary(user.organizationId, year);
    }

    @Get('analytics/years')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getYearlyAnalytics(@CurrentUser() user: { organizationId: string }) {
        return this.leave.getYearlyAnalytics(user.organizationId);
    }

    @Get('coverage')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getCoverageAlerts(@CurrentUser() user: { userId: string; organizationId: string; roleLevel: string }) {
        return this.leave.getCoverageAlerts(user.organizationId, user.roleLevel, user.userId);
    }

    // ── Balance ───────────────────────────────────────────────────────────────

    @Get('balance')
    getMyBalance(@CurrentUser() user: { userId: string; organizationId: string }) {
        return this.leave.getMyBalance(user.userId, user.organizationId);
    }

    @Get('balance/summary')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getBalanceSummary(
        @CurrentUser() user: { organizationId: string },
        @Query('year') year?: string,
    ) {
        return this.leave.getBalanceSummary(user.organizationId, year ? parseInt(year) : new Date().getFullYear());
    }

    @Get('balance/:employeeId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    getEmployeeBalance(
        @Param('employeeId') employeeId: string,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.getEmployeeBalance(employeeId, user.organizationId);
    }

    @Post('balance/:employeeId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    upsertBalance(
        @Param('employeeId') employeeId: string,
        @Body() dto: LeaveBalanceUpsertDto,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.upsertBalance(employeeId, user.organizationId, dto);
    }

    // ── Requests ──────────────────────────────────────────────────────────────

    @Get('requests')
    listRequests(
        @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
        @Query() query: LeaveQueryDto,
    ) {
        return this.leave.listRequests(user.organizationId, user.roleLevel, user.userId, query);
    }

    @Post('requests')
    submitRequest(
        @CurrentUser() user: { userId: string; organizationId: string },
        @Body() dto: CreateLeaveRequestDto,
    ) {
        return this.leave.submitRequest(user.userId, user.organizationId, dto);
    }

    @Get('requests/:id')
    getRequest(
        @Param('id') id: string,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.leave.getRequest(id, user.organizationId);
    }

    @Patch('requests/:id/review')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD)
    reviewRequest(
        @Param('id') id: string,
        @Body() dto: ReviewLeaveRequestDto,
        @CurrentUser() user: { userId: string; organizationId: string },
    ) {
        return this.leave.reviewRequest(id, user.organizationId, user.userId, dto);
    }

    @Patch('requests/:id/cancel')
    cancelRequest(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string; organizationId: string },
    ) {
        return this.leave.cancelRequest(id, user.organizationId, user.userId);
    }
}
