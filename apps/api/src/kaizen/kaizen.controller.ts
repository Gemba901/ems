import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { KaizenService } from './kaizen.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CreateKaizenDto, UpdateKaizenDto, VerifyKaizenDto } from './dto/kaizen.dto';
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
     * Any authenticated employee can raise a kaizen.
     */
    @Post()
    async create(
        @Body() dto: CreateKaizenDto,
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
     * owner, department HOD, or admin/management/superadmin can view a single kaizen
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
     * PATCH /kaizen/:id
     * owner updates their own kaizen (progress, results, or submit for verification)
     */
    @Patch(':id')
    async updateKaizen(
        @Param('id') id: string,
        @Body() dto: UpdateKaizenDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.updateKaizen(id, user.userId, dto, user.organizationId)
    }

    /**
     * PATCH /kaizen/:id/verify
     * department HOD or admin/management/superadmin verifies and closes, requests further improvement, or moves to SGA
     */
    @Patch(':id/verify')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD)
    async verifyKaizen(
        @Param('id') id: string,
        @Body() dto: VerifyKaizenDto,
        @CurrentUser() user: { userId: string, organizationId: string }
    ){
        return this.kaizenService.verifyKaizen(id, user.userId, dto, user.organizationId)
    }
}
