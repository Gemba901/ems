import { PlatformAdminGuard } from './platform-admin.guard';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { TenantResolverService } from './tenant-resolver.service';
import { TrustedTenantContextGuard } from './trusted-tenant-context.guard';
import { TenantGuard } from './tenant.guard';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [PlatformAdminGuard, TenantResolverService, TrustedTenantContextGuard, TenantGuard],
  exports: [PlatformAdminGuard, TenantResolverService, TrustedTenantContextGuard, TenantGuard],
})
export class TenancyModule { }
