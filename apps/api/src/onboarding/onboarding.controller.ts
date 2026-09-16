import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
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
  @Post('signup') signup(@Body() dto: SignupDto) {
    return this.service.signup(dto);
  }
  @Post('verify') verify(@Body() dto: VerifySignupDto) {
    return this.service.verify(dto);
  }
  // Capabilities are POST bodies, never query strings that enter access logs.
  @Post('status') status(@Body() dto: OnboardingAccessDto) {
    return this.service.status(dto);
  }
  @Post('resend') resend(@Body() dto: OnboardingAccessDto) {
    return this.service.resend(dto);
  }
  @Post('retry') retry(@Body() dto: OnboardingAccessDto) {
    return this.service.retry(dto);
  }
}
