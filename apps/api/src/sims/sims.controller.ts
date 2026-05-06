import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SimsService } from './sims.service';
import { CreateSuggestionDto, QuerySuggestionsDto, ReviewSuggestionDto, AssignCommitteeDto, ClarifyDto } from './dto/sims.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('sims')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SimsController {
  constructor(private simsService: SimsService) {}

  /**
   * POST /sims
   * Any authenticated employee can submit a suggestion.
   */
  @Post()
  async submit(
    @Body() dto: CreateSuggestionDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.submitSuggestion(dto, user.userId, user.organizationId);
  }

  /**
   * GET /sims/me
   * Employee views their own submissions with full review history.
   */
  @Get('me')
  async getMine(@CurrentUser() user: { userId: string }) {
    return this.simsService.getMySuggestions(user.userId);
  }

  /**
   * GET /sims/summary
   * Aggregated, anonymised counts for the current user's department and org.
   * Available to all roles.
   */
  @Get('summary')
  async getSummary(@CurrentUser() user: { userId: string; organizationId: string }) {
    return this.simsService.getSummary(user.userId, user.organizationId);
  }

  /**
   * GET /sims/department
   * HOD views all suggestions from their department.
   */
  @Get('department')
  @Roles(Role.HOD)
  async getDepartment(
    @Query() query: QuerySuggestionsDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.simsService.getDepartmentSuggestions(user.userId, query);
  }

  /**
   * GET /sims
   * Admin and Management view all suggestions org-wide with optional filters.
   */
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async getAll(
    @Query() query: QuerySuggestionsDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.simsService.getAllSuggestions(user.organizationId, query);
  }

  /**
   * GET /sims/queue
   * Returns suggestions assigned to the caller's committee(s).
   * Available to any authenticated user who is a committee member.
   */
  @Get('queue')
  async getQueue(
    @Query() query: QuerySuggestionsDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.getCommitteeSuggestions(user.userId, user.organizationId, query);
  }

  /**
   * GET /sims/:id
   * Full detail for one suggestion — access enforced per role in the service.
   */
  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; roleLevel: string; organizationId: string },
  ) {
    return this.simsService.getSuggestionById(id, user.userId, user.roleLevel, user.organizationId);
  }

  /**
   * PATCH /sims/:id/assign
   * Assigns a suggestion to a steering committee.
   * Admin and Management only.
   */
  @Patch(':id/assign')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignCommitteeDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.simsService.assignCommittee(id, dto, user.organizationId);
  }

  /**
   * PATCH /sims/:id/review
   * Any authenticated user who is a member of the assigned committee can review.
   * Membership is enforced in the service — no role restriction here.
   */
  @Patch(':id/review')
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewSuggestionDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.reviewSuggestion(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /sims/:id/clarify
   * The suggestion's author responds to a NEEDS_CLARIFICATION request.
   * Moves status back to UNDER_REVIEW for the next committee meeting.
   */
  @Patch(':id/clarify')
  async clarify(
    @Param('id') id: string,
    @Body() dto: ClarifyDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.respondToClarification(id, dto, user.userId, user.organizationId);
  }
}
