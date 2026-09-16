import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { Controller, ForbiddenException, Get, Patch, Param, Query, UseGuards, Body, Post } from '@nestjs/common';
import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { NotificationType } from 'db';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

class SendNotificationDto {
    @IsString()
    employeeId!: string;

    @IsEnum(NotificationType)
    type!: NotificationType;

    @IsString()
    module!: string;

    @IsString()
    title!: string;

    @IsString()
    message!: string;

    @IsString()
    @IsOptional()
    actionUrl?: string;
}

class UpdatePreferencesDto {
    @IsBoolean()
    @IsOptional()
    email?: boolean;

    @IsBoolean()
    @IsOptional()
    sms?: boolean;

    @IsBoolean()
    @IsOptional()
    whatsapp?: boolean;
}

@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard)
@TenantRequired()
@Controller('notifications')
export class NotificationsController {
    constructor(
        private notificationsService: NotificationsService,
        private prisma: PrismaService,
    ) {}

    private async resolveEmployee(userId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({ where: { userId, organizationId } });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');
        return employee;
    }

    @Get()
    async getMyNotifications(
        @CurrentUser() user: any,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        const employee = await this.resolveEmployee(user.userId, user.organizationId);
        return this.notificationsService.getNotificationsForEmployee(employee.id, Number(page), Number(limit));
    }

    @Get('preferences')
    async getPreferences(@CurrentUser() user: any) {
        const employee = await this.resolveEmployee(user.userId, user.organizationId);
        return this.notificationsService.getPreferences(employee.id);
    }

    @Patch('preferences')
    async updatePreferences(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
        const employee = await this.resolveEmployee(user.userId, user.organizationId);
        return this.notificationsService.updatePreferences(employee.id, dto);
    }

    @Patch(':id/read')
    async markRead(@Param('id') id: string, @CurrentUser() user: any) {
        const employee = await this.resolveEmployee(user.userId, user.organizationId);
        return this.notificationsService.markRead(id, employee.id);
    }

    @Patch('read-all')
    async markAllRead(@CurrentUser() user: any) {
        const employee = await this.resolveEmployee(user.userId, user.organizationId);
        return this.notificationsService.markAllRead(employee.id);
    }

    @Post()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
    @UseGuards(RolesGuard)
    async send(@Body() dto: SendNotificationDto, @CurrentUser() user: { organizationId: string }) {
        const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId }, select: { id: true } });
        if (!employee) throw new ForbiddenException('Recipient is not in this organization');
        return this.notificationsService.create({
            ...dto,
            module: dto.module.toUpperCase(),
        });
    }

    @Post('broadcast')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
    @UseGuards(RolesGuard)
    async broadcast(@Body() dto: Omit<SendNotificationDto, 'employeeId'>, @CurrentUser() user: any) {
        return this.notificationsService.broadcast(user.organizationId, {
            ...dto,
            module: dto.module.toUpperCase(),
        });
    }
}
