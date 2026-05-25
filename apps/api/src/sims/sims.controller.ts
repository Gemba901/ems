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
import { CreateSuggestionDto, QuerySuggestionsDto, ReviewSuggestionDto, UpdateImplementationDto } from './dto/sims.dto';
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
    @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
  ) {
    return this.simsService.submitSuggestion(dto, user.userId, user.organizationId, user.roleLevel);
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
   * Returns suggestions assigned to the caller for review (as HOD).
   * Available to HODs.
   */
  @Get('queue')
  @Roles(Role.HOD, Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT)
  async getQueue(
    @Query() query: QuerySuggestionsDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.getHODQueue(user.userId, user.organizationId, query);
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
   * PATCH /sims/:id/review
   * HODs and Admin/Management can review.
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
   * PATCH /sims/:id/implementation
   * Update implementation progress.
   * HOD and Admin/Management only (enforced in service).
   */
  @Patch(':id/implementation')
  async updateImplementation(
    @Param('id') id: string,
    @Body() dto: UpdateImplementationDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.simsService.updateImplementationStatus(id, dto, user.userId, user.organizationId);
  }

}
