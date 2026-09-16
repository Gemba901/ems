import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgStatus } from 'db';
import { PrismaService } from '../prisma/prisma.service';
import { parseTenantHostname } from './tenant-hostname';
import type { TenantContext } from './tenant-context';

@Injectable()
export class TenantResolverService {
  private readonly baseDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const configuredDomain = config.get<string>('TENANT_BASE_DOMAIN');

    if (
      !configuredDomain ||
      parseTenantHostname(configuredDomain, configuredDomain).kind !==
        'platform'
    ) {
      throw new Error(
        'TENANT_BASE_DOMAIN must be a valid hostname without a protocol, path, or port.',
      );
    }

    this.baseDomain = configuredDomain.toLowerCase();
  }

  async resolveCompanyHostname(
    hostname: string,
  ): Promise<TenantContext> {
    const result = parseTenantHostname(hostname, this.baseDomain);

    if (result.kind !== 'tenant') {
      throw new NotFoundException('Company workspace not found.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: {
        slug: result.slug,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
      },
    });

    if (!organization || !organization.slug) {
      throw new NotFoundException('Company workspace not found.');
    }

    if (organization.status !== OrgStatus.ACTIVE) {
      throw new ForbiddenException(
        'This company workspace is not active.',
      );
    }

    return {
      organizationId: organization.id,
      slug: organization.slug,
      name: organization.name,
    };
  }
}