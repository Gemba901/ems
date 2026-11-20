import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from '../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../../tenancy/tenant.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { RequiresModule } from '../../auth/decorators/module.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { LEX_ALL } from '../common/lex-roles';
import { ExecutionCommandDto } from './dto/execution.dto';
import { ExecutionService } from './execution.service';

@TenantRequired()
@Controller('leadership-excellence/execution')
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
@Roles(...LEX_ALL)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}
  @Get('workspace')
  @Header('Cache-Control', 'no-store')
  workspace(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getWorkspace(user);
  }
  @Post('commands')
  @Header('Cache-Control', 'no-store')
  command(
    @CurrentUser() user: AccessTokenPayload,
    @Body() command: ExecutionCommandDto,
  ) {
    return this.service.command(user, command);
  }
  @Get('submissions')
  @Header('Cache-Control', 'no-store')
  submissions(@CurrentUser() user: AccessTokenPayload) {
    return this.service.submissions(user);
  }
}
