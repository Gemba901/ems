import { PlatformAdminGuard } from '../tenancy/platform-admin.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus, TicketType } from 'db';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';


class CreateTicketDto {
    @IsEnum(TicketType)
    type!: TicketType

    @IsString()
    module!: string

    @IsString()
    subject!: string

    @IsString()
    message!: string

    @IsString()
    department!: string
}


class UpdateTicketDto{
    @IsEnum(TicketType)
    @IsOptional()
    typeChanged?: TicketType

    @IsEnum(TicketStatus)
    @IsOptional()
    statusChanged?: TicketStatus

    @IsString()
    @IsOptional()
    note?: string
}

type CurrentUserPayload = { userId: string; organizationId: string; isAdminOrg: boolean; roleLevel: string };

@TenantRequired()
@Controller('tickets')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard)
export class TicketsController {
    constructor(private ticketsService: TicketsService) {}

    /**
     * POST /tickets
     * Any authenticated employee can raise a ticket.
     */
    @Post()
    async create(@Body() dto: CreateTicketDto, @CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.create(dto, user.userId, user.organizationId);
    }

    /**
     * GET /tickets/mine
     * Any authenticated employee views the tickets they raised.
     */
    @Get('mine')
    async getMine(@CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.getMine(user.userId, user.organizationId);
    }

    /**
     * GET /tickets/company
     * Company admins view tickets raised within their own org.
     */
    @Get('company')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async getCompanyTickets(@CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.getCompanyTickets(user.organizationId);
    }

    /**
     * GET /tickets/system
     * Only the platform's Super Admins view system tickets.
     */
    @Get('system')
    @UseGuards(PlatformAdminGuard)
    @Roles(Role.SUPER_ADMIN)
    async getSystemTickets() {
        return this.ticketsService.getSystemTicket();
    }

    @Get('system/:id')
    @UseGuards(PlatformAdminGuard)
    async getSystemById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.getById(id, user.userId, user.organizationId, true, user.roleLevel);
    }

    @Patch('system/:id')
    @UseGuards(PlatformAdminGuard)
    async updateSystem(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.updateTicket(id, dto, user.userId, user.organizationId, true);
    }

    /**
     * GET /tickets/:id
     * The raiser can view their own ticket; org admins can view any ticket in
     * their org; Super Admins (admin org) can view any ticket.
     */
    @Get(':id')
    async getById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
        return this.ticketsService.getById(id, user.userId, user.organizationId, false, user.roleLevel);
    }

    /**
     * PATCH /tickets/:id
     * Company admins resolve tickets in their own org; Super Admins (admin org)
     * resolve system tickets across orgs.
     */
    @Patch(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async updateTicket(
        @Param('id') id: string,
        @Body() dto: UpdateTicketDto,
        @CurrentUser() user: CurrentUserPayload,
    ) {
        return this.ticketsService.updateTicket(id, dto, user.userId, user.organizationId, false);
    }
}
