import { Controller, ForbiddenException, Get, Patch, Param, Query, UseGuards, Body, Post } from '@nestjs/common';
import { IsString, IsEnum, IsOptional } from 'class-validator';
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


@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(
        private notificationsService: NotificationsService,
        private prisma: PrismaService,
    ) { }

    private async resolveEmployee(userId: string) {
        const employee = await this.prisma.employee.findFirst({ where: { userId } });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');
        return employee;
    }

    @Get()
    async getMyNotifications(
        @CurrentUser() user: any,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        const employee = await this.resolveEmployee(user.userId);
        return this.notificationsService.getNotificationsForEmployee(employee.id, Number(page), Number(limit));
    }

    @Patch(':id/read')
    async markRead(@Param('id') id: string, @CurrentUser() user: any) {
        const employee = await this.resolveEmployee(user.userId);
        return this.notificationsService.markRead(id, employee.id);
    }

    @Patch('read-all')
    async markAllRead(@CurrentUser() user: any) {
        const employee = await this.resolveEmployee(user.userId);
        return this.notificationsService.markAllRead(employee.id);
    }

    @Post()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
    @UseGuards(JwtAuthGuard, RolesGuard)
    async send(@Body() dto: SendNotificationDto) {
        return this.notificationsService.create({
            ...dto,
            module: dto.module.toUpperCase(),
        });
    }

    @Post('broadcast')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
@UseGuards(JwtAuthGuard, RolesGuard)
async broadcast(@Body() dto: Omit<SendNotificationDto, 'employeeId'>, @CurrentUser() user: any) {
  return this.notificationsService.broadcast(user.organizationId, {
    ...dto,
    module: dto.module.toUpperCase(),
  });
}
}
