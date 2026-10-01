import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { RateLimit } from '../common/rate-limit/rate-limit.guard';
import { ONBOARDING_LIMITS } from '../auth/auth-rate-limits';
import { OnboardingGuard } from './onboarding.guard';
import {
  OnboardingAccessDto,
  SignupDto,
  VerifySignupDto,
} from './onboarding.dto';

@Controller('onboarding')
@UseGuards(OnboardingGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Post('signup') @RateLimit(...ONBOARDING_LIMITS.signup) signup(@Body() dto: SignupDto) {
    return this.service.signup(dto);
  }
  @Post('verify') @RateLimit(...ONBOARDING_LIMITS.verify) verify(@Body() dto: VerifySignupDto) {
    return this.service.verify(dto);
  }
  // Capabilities are POST bodies, never query strings that enter access logs.
  @Post('status') status(@Body() dto: OnboardingAccessDto) {
    return this.service.status(dto);
  }
  @Post('resend') @RateLimit(...ONBOARDING_LIMITS.resend) resend(@Body() dto: OnboardingAccessDto) {
    return this.service.resend(dto);
  }
  @Post('retry') @RateLimit(...ONBOARDING_LIMITS.retry) retry(@Body() dto: OnboardingAccessDto) {
    return this.service.retry(dto);
  }
}
