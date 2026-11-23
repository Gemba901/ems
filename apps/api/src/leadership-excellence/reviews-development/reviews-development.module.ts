import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { ReviewsDevelopmentController } from './reviews-development.controller';
import { ReviewsDevelopmentService } from './reviews-development.service';
import { ReviewsDevelopmentSources } from './reviews-development.sources';
import { ReviewsService } from './reviews/reviews.service';
import { CoachingService } from './coaching/coaching.service';
import { ImprovementService } from './improvement/improvement.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [ReviewsDevelopmentController],
  providers: [
    ReviewsDevelopmentService,
    ReviewsDevelopmentSources,
    ReviewsService,
    CoachingService,
    ImprovementService,
    ModuleGuard,
  ],
  exports: [ReviewsDevelopmentService],
})
export class ReviewsDevelopmentModule {}
