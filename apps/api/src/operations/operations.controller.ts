import { UploadsService } from '../uploads/uploads.service';
import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../tenancy/platform-admin.guard';
import { ReadinessService } from './readiness.service';
@Controller('operations')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class OperationsController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly uploads: UploadsService,
  ) {}
  @Get('files/:organizationId/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  download(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.uploads.download(id, organizationId);
  }
  @Get('readiness')
  @Header('Cache-Control', 'private, no-store')
  inspect() {
    return this.readiness.inspect();
  }
}
