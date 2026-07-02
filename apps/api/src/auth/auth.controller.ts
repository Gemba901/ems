import { Controller, Post, Get, Body, Request, Response, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, VerifyFirstTimeDto, CreatePasswordDto, SelectOrgDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_COOKIE = 'refresh_token';

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    path: '/',
};

function setRefreshCookie(res: any, token: string) {
    res.cookie(REFRESH_COOKIE, token, cookieOptions);
}

function clearRefreshCookie(res: any) {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('login')
    async login(@Body() loginDto: LoginDto, @Response({ passthrough: true }) res: any) {
        const result = await this.authService.login(loginDto.phoneOrEmail, loginDto.password, loginDto.employeeCode);

        if ('refreshToken' in result) {
            setRefreshCookie(res, result.refreshToken);
            const { refreshToken: _, ...safeResult } = result;
            return safeResult;
        }

        return result;
    }

    @Post('select-org')
    async selectOrg(@Body() dto: SelectOrgDto, @Response({ passthrough: true }) res: any) {
        const result = await this.authService.selectOrg(dto.selectionToken, dto.organizationId);
        setRefreshCookie(res, result.refreshToken);
        const { refreshToken: _, ...safeResult } = result;
        return safeResult;
    }

    @Post('refresh')
    async refresh(@Request() req: any, @Response({ passthrough: true }) res: any) {
        const rawToken = req.cookies?.[REFRESH_COOKIE];
        if (!rawToken) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: 'No refresh token' });
        }

        const result = await this.authService.refresh(rawToken);
        setRefreshCookie(res, result.refreshToken);
        const { refreshToken: _, ...safeResult } = result;
        return safeResult;
    }

    @Post('logout')
    async logout(@Request() req: any, @Response({ passthrough: true }) res: any) {
        const rawToken = req.cookies?.[REFRESH_COOKIE];
        if (rawToken) {
            await this.authService.revokeRefreshToken(rawToken);
        }
        clearRefreshCookie(res);
        return { message: 'Logged out' };
    }

    @Post('verify-first-time')
    verifyFirstTime(@Body() verifyDto: VerifyFirstTimeDto){
        return this.authService.verifyFirstTimeUser(verifyDto.phoneOrEmail, verifyDto.employeeCode);
    }

    @Post('create-password')
    createPassword(@Body() createPasswordDto: CreatePasswordDto){
        return this.authService.createPassword(
            createPasswordDto.setupToken,
            createPasswordDto.newPassword,
        );
    }

    @Get('my-org')
    @UseGuards(JwtAuthGuard)
    getMyOrg(@Request() req: any) {
        return this.authService.getMyOrg(req.user.organizationId);
    }
}
