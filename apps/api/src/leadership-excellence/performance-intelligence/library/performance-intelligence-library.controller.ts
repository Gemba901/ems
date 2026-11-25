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
import type { AccessTokenPayload } from '../../../auth/access-token-payload';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequiresModule } from '../../../auth/decorators/module.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ModuleGuard } from '../../../auth/guards/module.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { TenantGuard } from '../../../tenancy/tenant.guard';
import { TenantRequired } from '../../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../../tenancy/trusted-tenant-context.guard';
import { LEX_ALL, LEX_EDITORS } from '../../common/lex-roles';
import { LibraryCommandDto } from './library-command.dto';
import { PerformanceIntelligenceLibraryService } from './performance-intelligence-library.service';

@TenantRequired()
@Controller('leadership-excellence/performance-intelligence/library')
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
export class PerformanceIntelligenceLibraryController {
  constructor(
    private readonly service: PerformanceIntelligenceLibraryService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  library(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getLibrary(user);
  }
  @Post('commands')
  @Roles(...LEX_EDITORS)
  @Header('Cache-Control', 'no-store')
  command(
    @CurrentUser() user: AccessTokenPayload,
    @Body() command: LibraryCommandDto,
  ) {
    return this.service.command(user, command);
  }
}
