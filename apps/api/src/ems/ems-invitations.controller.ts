import { EmsAccountLinksService, accountLinkHash } from './ems-account-links';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, IsBoolean } from 'class-validator';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import { RateLimit } from 'src/common/rate-limit/rate-limit.guard';
import { EmsInvitationsService } from './ems-invitations';

const MINUTE = 60 * 1000;
export class AcceptAccountLinkDto {
  @IsString() @MaxLength(200) token!: string;
  @IsBoolean() consent!: boolean;
  @IsString() @MaxLength(200) password!: string;
}
const accountTokenKey = (req: any) => typeof req.body?.token === 'string' ? accountLinkHash(req.body.token) : undefined;

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
  constructor(private readonly invitations: EmsInvitationsService, private readonly accountLinks: EmsAccountLinksService) {}

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

  @Post('account/lookup')
  @RateLimit({ name: 'account-link-lookup', by: 'ip', max: 60, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  accountLookup(@Body() dto: LookupInvitationDto, @Req() request: TenantRequest) {
    return this.accountLinks.lookup(this.tenant(request).organizationId, dto.token);
  }

  @Post('account/verify')
  @RateLimit({ name: 'account-link-verify', by: 'ip', max: 20, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  accountVerify(@Body() dto: LookupInvitationDto, @Req() request: TenantRequest) {
    return this.accountLinks.verify(this.tenant(request).organizationId, dto.token);
  }

  @Post('account/accept')
  @RateLimit({ name: 'account-link-accept', by: 'ip', max: 20, windowMs: 15 * MINUTE },
    { name: 'account-link-password', by: accountTokenKey, max: 10, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  accountAccept(@Body() dto: AcceptAccountLinkDto, @Req() request: TenantRequest) {
    return this.accountLinks.accept(this.tenant(request).organizationId, dto.token, dto.consent, dto.password);
  }

  @Post('account/decline')
  @RateLimit({ name: 'account-link-decline', by: 'ip', max: 20, windowMs: 15 * MINUTE })
  @HttpCode(HttpStatus.OK)
  accountDecline(@Body() dto: LookupInvitationDto, @Req() request: TenantRequest) {
    return this.accountLinks.decline(this.tenant(request).organizationId, dto.token);
  }
}
