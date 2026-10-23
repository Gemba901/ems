import { Body, Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import { RateLimit } from 'src/common/rate-limit/rate-limit.guard';
import { EmsInvitationsService } from './ems-invitations';

const MINUTE = 60 * 1000;

export class LookupInvitationDto {
  @IsString() @MaxLength(200) token!: string;
}
export class AcceptInvitationDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MaxLength(200) newPassword!: string;
}

/**
 * Public invitation routes for people who aren't signed in yet. Like company login, they
 * only run on a verified company address, and the company comes from that address, never the body.
 */
@Controller('ems/invitations')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard)
export class EmsInvitationsController {
  constructor(private readonly invitations: EmsInvitationsService) {}

  private tenant(request: TenantRequest) {
    if (!request.tenant?.organizationId) throw new UnauthorizedException('Company context is required.');
    return request.tenant;
  }

  @Post('lookup')
  @RateLimit({ name: 'invite-lookup', by: 'ip', max: 60, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: LookupInvitationDto, @Req() request: TenantRequest) {
    const tenant = this.tenant(request);
    return this.invitations.lookup(tenant.organizationId, tenant.name, dto.token);
  }

  @Post('accept')
  @RateLimit({ name: 'invite-accept', by: 'ip', max: 20, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  accept(@Body() dto: AcceptInvitationDto, @Req() request: TenantRequest) {
    return this.invitations.accept(this.tenant(request).organizationId, dto.token, dto.newPassword);
  }
}
