import { Controller, Post, Get, Body, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, VerifyFirstTimeDto, CreatePasswordDto, SelectOrgDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto.phoneOrEmail, loginDto.password);
    }

    @Post('select-org')
    selectOrg(@Body() dto: SelectOrgDto) {
        return this.authService.selectOrg(dto.selectionToken, dto.organizationId);
    }

    @Post('verify-first-time')
    verifyFirstTime(@Body() verifyDto: VerifyFirstTimeDto){
        return this.authService.verifyFirstTimeUser(verifyDto.phoneOrEmail);
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
