import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto, VerifyFirstTimeDto, CreatePasswordDto } from './dto/auth.dto';
import { TenantRequired } from '../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import type {
    TenantContext,
    TenantRequest,
} from '../tenancy/tenant-context';

const REFRESH_COOKIE = 'refresh_token';

const refreshCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,

    // Intentionally omit "domain" so the browser uses a host-only cookie.
};

// These routes require a hostname verified by the trusted proxy guard.
@Controller('auth/company')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard)
export class CompanyAuthController {
    constructor(private readonly authService: AuthService) {}

    private requireTenant(request: TenantRequest): TenantContext {
        // Fail closed if the guard has not populated company context.
        if (!request.tenant?.organizationId) {
            throw new UnauthorizedException('Company context is required.');
        }

        return request.tenant;
    }

    @Post('verify-first-time')
    @HttpCode(HttpStatus.OK)
    verify(@Body() dto: VerifyFirstTimeDto, @Req() request: TenantRequest) {
        return this.authService.verifyFirstTimeForTenant(this.requireTenant(request), dto.phoneOrEmail, dto.employeeCode);
    }

    @Post('create-password')
    @HttpCode(HttpStatus.OK)
    setup(@Body() dto: CreatePasswordDto, @Req() request: TenantRequest) {
        return this.authService.createPasswordForTenant(this.requireTenant(request), dto.setupToken, dto.newPassword);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Req() request: TenantRequest,
        @Res({ passthrough: true }) response: Response,
    ) {
        // The organization comes from trusted context, never the body.
        const tenant = this.requireTenant(request);

        const result = await this.authService.loginForTenant(
            tenant,
            dto.phoneOrEmail,
            dto.password,
            dto.employeeCode,
        );

        response.cookie(
            REFRESH_COOKIE,
            result.refreshToken,
            refreshCookieOptions,
        );

        // JavaScript receives the access token and user information.
        // The refresh token is delivered only through the HttpOnly cookie.
        const { refreshToken: _, ...safeResult } = result;
        return safeResult;
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(
        @Req() request: TenantRequest,
        @Res({ passthrough: true }) response: Response,
    ) {
        const tenant = this.requireTenant(request);
        const rawToken: unknown = request.cookies?.[REFRESH_COOKIE];

        if (typeof rawToken !== 'string' || !rawToken.trim()) {
            throw new UnauthorizedException('No refresh token');
        }

        const result = await this.authService.refreshForTenant(
            tenant,
            rawToken,
        );

        // The service resolves after the rotation transaction commits.
        // Only then do we replace the browser cookie.
        response.cookie(
            REFRESH_COOKIE,
            result.refreshToken,
            refreshCookieOptions,
        );

        const { refreshToken: _, ...safeResult } = result;
        return safeResult;
    }
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Req() request: TenantRequest, @Res({ passthrough: true }) response: Response) {
        const tenant = this.requireTenant(request);
        const raw = request.cookies?.[REFRESH_COOKIE];
        if (typeof raw === 'string') await this.authService.revokeRefreshTokenForTenant(tenant, raw);
        response.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: refreshCookieOptions.secure, sameSite: 'lax', path: '/' });
        return { message: 'Logged out' };
    }

}