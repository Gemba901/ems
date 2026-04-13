import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, VerifyFirstTimeDto, CreatePasswordDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto.phoneOrEmail, loginDto.password);
    }

    @Post('verify-first-time')
    verifyFirstTime(@Body() verifyDto: VerifyFirstTimeDto){
        return this.authService.verifyFirstTimeUser(verifyDto.phoneOrEmail)
    }

    @Post('create-password')
    createPassword(@Body() createPasswordDto: CreatePasswordDto){
        return this.authService.createPassword(
            createPasswordDto.setupToken,
            createPasswordDto.newPassword
        )
    }
}

