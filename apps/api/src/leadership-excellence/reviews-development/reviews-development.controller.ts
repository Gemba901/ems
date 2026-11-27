import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { ReviewsDevelopmentService } from './reviews-development.service';
import { ReviewsService } from './reviews/reviews.service';
import { CoachingService } from './coaching/coaching.service';
import { ImprovementService } from './improvement/improvement.service';
import {
  DEVELOPMENT_READERS,
  DEVELOPMENT_USERS,
} from './reviews-development.roles';
import {
  AcknowledgeReviewDto,
  CreateCoachingDto,
  CreateReviewDto,
  DevelopmentReadQueryDto,
  LinkActionDto,
  RecordEffectivenessDto,
  ReviewReasonDto,
  UpdateCoachingDto,
  UpdateReflectionDto,
  UpdateReviewDiscussionDto,
} from './dto/reviews-development.dto';

@TenantRequired()
@Controller('leadership-excellence/reviews-development')
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class ReviewsDevelopmentController {
  constructor(
    private readonly provider: ReviewsDevelopmentService,
    private readonly reviews: ReviewsService,
    private readonly coaching: CoachingService,
    private readonly improvement: ImprovementService,
  ) {}

  /** Plans the caller can review or coach on, with suggested periods. */
  @Get('context')
  @Roles(...DEVELOPMENT_USERS)
  context(@CurrentUser() user: AccessTokenPayload) {
    return this.reviews.getContext(user);
  }

  // ── 06.01 Performance reviews ─────────────────────────
  @Get('reviews')
  @Roles(...DEVELOPMENT_USERS)
  listReviews(@CurrentUser() user: AccessTokenPayload) {
    return this.reviews.list(user);
  }

  @Post('reviews')
  @Roles(...DEVELOPMENT_USERS)
  createReview(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user, dto);
  }

  @Get('reviews/:id')
  @Roles(...DEVELOPMENT_USERS)
  getReview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.get(user, id);
  }

  @Put('reviews/:id/reflection')
  @Roles(...DEVELOPMENT_USERS)
  saveReflection(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReflectionDto,
  ) {
    return this.reviews.saveReflection(user, id, dto, false);
  }

  @Post('reviews/:id/submit')
  @Roles(...DEVELOPMENT_USERS)
  submitReflection(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReflectionDto,
  ) {
    return this.reviews.saveReflection(user, id, dto, true);
  }

  @Put('reviews/:id/discussion')
  @Roles(...DEVELOPMENT_USERS)
  saveDiscussion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDiscussionDto,
  ) {
    return this.reviews.saveDiscussion(user, id, dto);
  }

  @Post('reviews/:id/refresh')
  @Roles(...DEVELOPMENT_USERS)
  refresh(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.refresh(user, id);
  }

  @Post('reviews/:id/return')
  @Roles(...DEVELOPMENT_USERS)
  returnReview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReasonDto,
  ) {
    return this.reviews.returnForClarification(user, id, dto.reason);
  }

  @Post('reviews/:id/approve')
  @Roles(...DEVELOPMENT_USERS)
  approve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.approve(user, id);
  }

  @Post('reviews/:id/revise')
  @Roles(...DEVELOPMENT_USERS)
  revise(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReasonDto,
  ) {
    return this.reviews.revise(user, id, dto.reason);
  }

  @Post('reviews/:id/acknowledge')
  @Roles(...DEVELOPMENT_USERS)
  acknowledge(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcknowledgeReviewDto,
  ) {
    return this.reviews.acknowledge(user, id, dto);
  }

  @Post('reviews/:id/actions')
  @Roles(...DEVELOPMENT_USERS)
  linkReviewAction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkActionDto,
  ) {
    return this.reviews.linkAction(user, id, dto.actionId);
  }

  @Delete('reviews/:id/actions/:actionId')
  @Roles(...DEVELOPMENT_USERS)
  unlinkReviewAction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.reviews.unlinkAction(user, id, actionId);
  }

  // ── 06.02 Feedback & coaching ─────────────────────────
  @Get('coaching')
  @Roles(...DEVELOPMENT_USERS)
  listCoaching(@CurrentUser() user: AccessTokenPayload) {
    return this.coaching.list(user);
  }

  @Post('coaching')
  @Roles(...DEVELOPMENT_USERS)
  createCoaching(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateCoachingDto,
  ) {
    return this.coaching.create(user, dto);
  }

  @Put('coaching/:id')
  @Roles(...DEVELOPMENT_USERS)
  updateCoaching(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoachingDto,
  ) {
    return this.coaching.update(user, id, dto);
  }

  @Post('coaching/:id/actions')
  @Roles(...DEVELOPMENT_USERS)
  linkCoachingAction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkActionDto,
  ) {
    return this.coaching.linkAction(user, id, dto.actionId);
  }

  @Delete('coaching/:id/actions/:actionId')
  @Roles(...DEVELOPMENT_USERS)
  unlinkCoachingAction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('actionId') actionId: string,
  ) {
    return this.coaching.unlinkAction(user, id, actionId);
  }

  // ── 06.03 Improvement actions & effectiveness ─────────
  @Get('improvement/actions')
  @Roles(...DEVELOPMENT_USERS)
  listActions(@CurrentUser() user: AccessTokenPayload) {
    return this.improvement.list(user);
  }

  @Put('improvement/actions/:actionId/effectiveness')
  @Roles(...DEVELOPMENT_USERS)
  recordEffectiveness(
    @CurrentUser() user: AccessTokenPayload,
    @Param('actionId') actionId: string,
    @Body() dto: RecordEffectivenessDto,
  ) {
    return this.improvement.record(user, actionId, dto);
  }

  // ── Read API for Area 07 (approved / permission-safe) ─
  @Get('integration/reviews')
  @Roles(...DEVELOPMENT_READERS)
  approvedReviews(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: DevelopmentReadQueryDto,
  ) {
    return this.provider.listApprovedReviews(user, q);
  }

  @Get('integration/coaching')
  @Roles(...DEVELOPMENT_READERS)
  coachingMetadata(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: DevelopmentReadQueryDto,
  ) {
    return this.provider.listCoachingMetadata(user, q);
  }

  @Get('integration/effectiveness')
  @Roles(...DEVELOPMENT_READERS)
  effectiveness(
    @CurrentUser() user: AccessTokenPayload,
    @Query() q: DevelopmentReadQueryDto,
  ) {
    return this.provider.listEffectiveness(user, q);
  }
}
