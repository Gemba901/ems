import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SgaService } from './sga.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import {
    CreateSgaDto,
    UpdateSgaReasonDto,
    UpdateSgaInfoDto,
    UpdateSgaImpactDto,
    UpdateSgaTeamDto,
    UpdateSgaMeetingPlanDto,
    UpdateSgaResourcesDto,
    SubmitSgaHodApprovalDto,
    UpdateSgaConditionDto,
    UpdateSgaRootCauseDto,
    CreateSgaMeetingReportDto,
    UpdateSgaMeetingReportDto,
    UpdateSgaActionPlanDto,
    UpdateSgaImplementationDto,
    UpdateSgaResultsDto,
    UpdateSgaBenefitsDto,
    UpdateSgaVerifyingDepartmentDto,
    SubmitSgaVerificationStageDto,
} from './dto/sga.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ModuleType } from 'db';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';

@TenantRequired()
@Controller('sga')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.SGA)
export class SgaController {
    constructor(
        private sgaService: SgaService
    ) {}

    /**
     * POST /sga
     * Step 1 §1: any authenticated employee can raise an SGA (creates DRAFT).
     */
    @Post()
    async create(
        @Body() dto: CreateSgaDto,
        @CurrentUser() user: { userId: string; organizationId: string }
    ) {
        return this.sgaService.createSga(user.userId, dto, user.organizationId)
    }

    /**
     * DELETE /sga/:id
     * raiser (or admin/management/superadmin) discards a draft that was never submitted
     */
    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string; organizationId: string }
    ) {
        return this.sgaService.deleteSga(id, user.userId, user.organizationId)
    }

    /**
     * GET /sga
     * all organizations SGAs; super admin, admin and management only
     */
    @Get()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
    async getAllSgas(
        @CurrentUser() user: { organizationId: string }
    ){
        return this.sgaService.getAllSgas(user.organizationId)
    }

    /**
     * GET /sga/me
     * everyone can see their own SGAs (raised, owned or as team member)
     */
    @Get('me')
    async getMySgas(
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.getMySgas(user.userId, user.organizationId)
    }

    /**
     * GET /sga/pending-verification
     * SGAs awaiting the current user's step-6 verification action
     * (affected department HOD/rep / department HOD / steering committee member / Finance HOD / privileged)
     */
    @Get('pending-verification')
    async getPendingVerification(
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.getPendingVerification(user.userId, user.organizationId)
    }

    /**
     * GET /sga/department/{departmentId}
     * hods can see their own departmental SGAs; superadmins, admins and management can view any department
     */
    @Get('department/:departmentId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    async getDepartmentalSgas(
        @Param('departmentId') departmentId: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.getDepartmentalSgas(departmentId, user.userId, user.organizationId)
    }

    /**
     * GET /sga/:id
     * raiser, owner, team member, main/verifying department HOD, department rep,
     * steering committee member, Finance HOD, or admin/management/superadmin can view a single SGA
     */
    @Get(':id')
    async getSpecificSga(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.getSpecificSga(id, user.userId, user.organizationId)
    }

    /**
     * GET /sga/:id/history
     * review/status history for an SGA; same access rule as viewing the SGA itself
     */
    @Get(':id/history')
    async getSgaHistory(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.getSgaHistory(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /sga/:id/reason
     * Step 1 §1: raiser only, while editable
     */
    @Patch(':id/reason')
    async updateReason(
        @Param('id') id: string,
        @Body() dto: UpdateSgaReasonDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateReason(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/info
     * Step 1 §2: raiser only, while editable
     */
    @Patch(':id/info')
    async updateInfo(
        @Param('id') id: string,
        @Body() dto: UpdateSgaInfoDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateInfo(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/impact
     * Step 1 §3: raiser only, while editable
     */
    @Patch(':id/impact')
    async updateImpact(
        @Param('id') id: string,
        @Body() dto: UpdateSgaImpactDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateImpact(id, user.userId, dto, user.organizationId)
    }

    /**
     * GET /sga/:id/team-candidates?departmentIds=a,b,c
     * Step 2 §4: employees in the SGA's main + other departments; raiser only, while editable.
     * `departmentIds`, when given, overrides the persisted departments so the picker can
     * reflect a Step 1.2 department selection that hasn't been saved yet.
     */
    @Get(':id/team-candidates')
    async getTeamCandidates(
        @Param('id') id: string,
        @Query('departmentIds') departmentIds: string | undefined,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        const parsed = departmentIds ? departmentIds.split(',').filter(Boolean) : undefined;
        return this.sgaService.getTeamCandidates(id, user.userId, user.organizationId, parsed)
    }

    /**
     * PATCH /sga/:id/team
     * Step 2 §4: raiser only, while editable
     */
    @Patch(':id/team')
    async updateTeam(
        @Param('id') id: string,
        @Body() dto: UpdateSgaTeamDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateTeam(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/meeting-plan
     * Step 2 §5: raiser only, while editable
     */
    @Patch(':id/meeting-plan')
    async updateMeetingPlan(
        @Param('id') id: string,
        @Body() dto: UpdateSgaMeetingPlanDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateMeetingPlan(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/resources
     * Step 2 §6: raiser only, while editable (resources/investment, not the HOD decision itself)
     */
    @Patch(':id/resources')
    async updateResources(
        @Param('id') id: string,
        @Body() dto: UpdateSgaResourcesDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateResources(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/submit-for-hod-approval
     * raiser submits steps 1-2 for HOD approval
     */
    @Patch(':id/submit-for-hod-approval')
    async submitForHodApproval(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.submitForHodApproval(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /sga/:id/hod-approval
     * Step 2 §6 HOD decision: department HOD or admin/management/superadmin
     */
    @Patch(':id/hod-approval')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    async submitHodApproval(
        @Param('id') id: string,
        @Body() dto: SubmitSgaHodApprovalDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.submitHodApproval(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/condition
     * Step 3 §7: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/condition')
    async updateCondition(
        @Param('id') id: string,
        @Body() dto: UpdateSgaConditionDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateCondition(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/root-cause
     * Step 3 §8: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/root-cause')
    async updateRootCause(
        @Param('id') id: string,
        @Body() dto: UpdateSgaRootCauseDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateRootCause(id, user.userId, dto, user.organizationId)
    }

    /**
     * POST /sga/:id/meeting-reports
     * Step 3 §9: raiser, owner or team member, once HOD-approved
     */
    @Post(':id/meeting-reports')
    async createMeetingReport(
        @Param('id') id: string,
        @Body() dto: CreateSgaMeetingReportDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.createMeetingReport(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/meeting-reports/:reportId
     * Step 3 §9: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/meeting-reports/:reportId')
    async updateMeetingReport(
        @Param('id') id: string,
        @Param('reportId') reportId: string,
        @Body() dto: UpdateSgaMeetingReportDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateMeetingReport(id, reportId, user.userId, dto, user.organizationId)
    }

    /**
     * DELETE /sga/:id/meeting-reports/:reportId
     * Step 3 §9: raiser, owner or team member, once HOD-approved
     */
    @Delete(':id/meeting-reports/:reportId')
    async deleteMeetingReport(
        @Param('id') id: string,
        @Param('reportId') reportId: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.deleteMeetingReport(id, reportId, user.userId, user.organizationId)
    }

    /**
     * PATCH /sga/:id/action-plan
     * Step 4 §10: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/action-plan')
    async updateActionPlan(
        @Param('id') id: string,
        @Body() dto: UpdateSgaActionPlanDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateActionPlan(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/implementation
     * Step 4 §11: SGA owner only, once HOD-approved
     */
    @Patch(':id/implementation')
    async updateImplementation(
        @Param('id') id: string,
        @Body() dto: UpdateSgaImplementationDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateImplementation(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/results
     * Step 5 §12: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/results')
    async updateResults(
        @Param('id') id: string,
        @Body() dto: UpdateSgaResultsDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateResults(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/benefits
     * Step 5 §13: raiser, owner or team member, once HOD-approved
     */
    @Patch(':id/benefits')
    async updateBenefits(
        @Param('id') id: string,
        @Body() dto: UpdateSgaBenefitsDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateBenefits(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/verifying-department
     * Step 6 §14: select the affected department + rep before submitting for verification
     */
    @Patch(':id/verifying-department')
    async updateVerifyingDepartment(
        @Param('id') id: string,
        @Body() dto: UpdateSgaVerifyingDepartmentDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.updateVerifyingDepartment(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /sga/:id/submit-for-verification
     * raiser or owner submits steps 3-5 for the four-stage step-6 verification
     */
    @Patch(':id/submit-for-verification')
    async submitForVerification(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.submitForVerification(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /sga/:id/verify
     * Step 6 §14: per-stage authz handled in service
     * (affected department HOD/rep / department HOD / steering committee member / Finance HOD / privileged)
     */
    @Patch(':id/verify')
    async submitVerificationStage(
        @Param('id') id: string,
        @Body() dto: SubmitSgaVerificationStageDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.sgaService.submitVerificationStage(id, user.userId, dto, user.organizationId)
    }
}
