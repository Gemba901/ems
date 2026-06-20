import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, UseGuards,
} from '@nestjs/common';
import { NoticesService } from './notices.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('notices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoticesController {
    constructor(private notices: NoticesService) {}

    @Get()
    getNotices(@CurrentUser() user: { organizationId: string }) {
        return this.notices.getNotices(user.organizationId);
    }

    @Post()
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    createNotice(
        @CurrentUser() user: { organizationId: string },
        @Body() dto: CreateNoticeDto,
    ) {
        return this.notices.createNotice(user.organizationId, dto);
    }

    @Patch(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    updateNotice(
        @Param('id') id: string,
        @CurrentUser() user: { organizationId: string },
        @Body() dto: UpdateNoticeDto,
    ) {
        return this.notices.updateNotice(id, user.organizationId, dto);
    }

    @Delete(':id')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
    deleteNotice(
        @Param('id') id: string,
        @CurrentUser() user: { organizationId: string },
    ) {
        return this.notices.deleteNotice(id, user.organizationId);
    }
}
