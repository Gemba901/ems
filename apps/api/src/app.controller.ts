import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicHealth } from './common/decorators/public-health.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @PublicHealth()
  getHello(): string {
    return this.appService.getHello();
  }
}
