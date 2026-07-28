import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CommitteeService } from './committee.service';
import { CreateCommitteeDto, AddMemberDto } from './dto/committee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('committees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommitteeController {
  constructor(private committeeService: CommitteeService) {}

  /**
   * GET /committees/me
   * Returns the committees the current user belongs to in their org.
   */
  @Get('me')
  async getMyCommittees(
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.committeeService.getMyCommittees(user.userId, user.organizationId);
  }

  /**
   * GET /committees
   * Admin and Management can list all committees for their org.
   */
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async list(@CurrentUser() user: { organizationId: string }) {
    return this.committeeService.listCommittees(user.organizationId);
  }

  /**
   * GET /committees/designated
   * Returns the single committee SELECTED_FOR_SGA suggestions are forwarded to, or null.
   */
  @Get('designated')
  async getDesignated(@CurrentUser() user: { organizationId: string }) {
    return this.committeeService.getDesignatedSgaCommittee(user.organizationId);
  }

  /**
   * PATCH /committees/designated/:committeeId
   * Only Super Admin/Admin can change the org's designated SGA committee.
   */
  @Patch('designated/:committeeId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async setDesignated(
    @Param('committeeId') committeeId: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.setDesignatedSgaCommittee(committeeId, user.organizationId);
  }

  /**
   * POST /committees
   * Only Admin can create a new committee.
   */
  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(
    @Body() dto: CreateCommitteeDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.createCommittee(dto, user.organizationId);
  }

  /**
   * GET /committees/:id
   * Admin and Management can view a committee's detail and members.
   */
  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.getCommittee(id, user.organizationId);
  }

  /**
   * POST /committees/:id/members
   * Only Admin can add a member to a committee.
   */
  @Post(':id/members')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.addMember(id, dto, user.organizationId);
  }

  /**
   * DELETE /committees/:id/members/:employeeId
   * Only Admin can remove a member from a committee.
   */
  @Delete(':id/members/:employeeId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async removeMember(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.removeMember(id, employeeId, user.organizationId);
  }

  /**
   * DELETE /committees/:id
   * Only Admin can delete a committee.
   */
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async deleteCommittee(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.committeeService.deleteCommittee(id, user.organizationId);
  }
}
