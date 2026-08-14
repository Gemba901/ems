import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { KaizenService } from './kaizen.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import {
    CreateKaizenReasonDto,
    UpdateKaizenReferenceDto,
    UpdateKaizenConditionDto,
    UpdateKaizenBasicInfoDto,
    UpdateKaizenQcdsmtImpactDto,
    UpdateKaizenWasteDto,
    UpdateKaizenImplementationPlanDto,
    SubmitHodPreReviewDto,
    UpdateKaizenImplementationDto,
    SubmitVerificationStageDto,
} from './dto/kaizen.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ModuleType } from 'db';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('kaizen')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.KAIZEN)
export class KaizenController {
    constructor(
        private kaizenService: KaizenService
    ) {}

    /**
     * POST /kaizen
     * Part 1: any authenticated employee can raise a kaizen (creates DRAFT).
     */
    @Post()
    async create(
        @Body() dto: CreateKaizenReasonDto,
        @CurrentUser() user: { userId: string; organizationId: string }
    ) {
        return this.kaizenService.createKaizen(user.userId, dto, user.organizationId)
    }

    /**
     * GET /kaizen
     * get all organizations kaizens, super admin, admin and management only
     */
    @Get()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
    async getAllKaizens(
        @CurrentUser() user: { organizationId: string}
    ){
        return this.kaizenService.getAllKaizens(user.organizationId)
    }

    /**
     * GET /kaizen/me
     * everyone can see their own kaizens
     */
    @Get('me')
    async getMyKaizens(
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.getMyKaizens(user.userId, user.organizationId)
    }

    /**
     * GET /kaizen/pending-verification
     * kaizens awaiting the current user's part-9 verification action
     * (department HOD / steering committee member / Finance HOD / privileged)
     */
    @Get('pending-verification')
    async getPendingVerification(
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.getPendingVerification(user.userId, user.organizationId)
    }

    /**
     * GET /kaizen/department/{departmentId}
     * hods can see their own departmental kaizens; superadmins, admins and management can view any department
     */
    @Get('department/:departmentId')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    async getDepartmentalKaizens(
        @Param('departmentId') departmentId: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.getDepartmentalKaizen(departmentId, user.userId, user.organizationId)
    }

    /**
     * GET /kaizen/:id
     * owner, kaizen owner, department HOD, steering committee member, Finance HOD,
     * or admin/management/superadmin can view a single kaizen
     */
    @Get(':id')
    async getSpecificKaizen(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.getSpecificKaizen(id, user.userId, user.organizationId)
    }

    /**
     * GET /kaizen/:id/history
     * review/status history for a kaizen; same access rule as viewing the kaizen itself
     */
    @Get(':id/history')
    async getKaizenHistory(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.getKaizenHistory(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/reference
     * Part 2: raiser only, while editable
     */
    @Patch(':id/reference')
    async updateReference(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenReferenceDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateReference(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/condition
     * Part 3: raiser only, while editable
     */
    @Patch(':id/condition')
    async updateCondition(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenConditionDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateCondition(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/basic-info
     * Part 4: raiser only, while editable
     */
    @Patch(':id/basic-info')
    async updateBasicInfo(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenBasicInfoDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateBasicInfo(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/qcdsmt-impact
     * Part 5: raiser only, while editable
     */
    @Patch(':id/qcdsmt-impact')
    async updateQcdsmtImpact(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenQcdsmtImpactDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateQcdsmtImpact(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/waste
     * Part 6: raiser only, while editable
     */
    @Patch(':id/waste')
    async updateWaste(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenWasteDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateWaste(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/implementation-plan
     * Part 7: raiser only, while editable
     */
    @Patch(':id/implementation-plan')
    async updateImplementationPlan(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenImplementationPlanDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateImplementationPlan(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/submit-for-hod-review
     * raiser submits parts 1-7 for HOD pre-implementation review
     */
    @Patch(':id/submit-for-hod-review')
    async submitForHodPreReview(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.submitForHodPreReview(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/hod-pre-review
     * Part 8: department HOD or admin/management/superadmin
     */
    @Patch(':id/hod-pre-review')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    async submitHodPreReview(
        @Param('id') id: string,
        @Body() dto: SubmitHodPreReviewDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.submitHodPreReview(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/implementation
     * Part 9: kaizen owner only, while in implementation
     */
    @Patch(':id/implementation')
    async updateImplementation(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenImplementationDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateImplementation(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/submit-for-verification
     * kaizen owner submits part 9 for the three-stage part 10 verification
     */
    @Patch(':id/submit-for-verification')
    async submitForVerification(
        @Param('id') id: string,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.submitForVerification(id, user.userId, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/verification-stage
     * Part 10: per-stage authz handled in service (dept HOD / steering committee member / Finance HOD / privileged)
     */
    @Patch(':id/verification-stage')
    async submitVerificationStage(
        @Param('id') id: string,
        @Body() dto: SubmitVerificationStageDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.submitVerificationStage(id, user.userId, dto, user.organizationId)
    }
}
