import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtStrategy } from './jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CompanyAuthController } from './company-auth.controller';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    NotificationsModule,
    TenancyModule,
    RateLimitModule,
    // use registerAsync to inject ConfigService for dynamic JWT configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || process.env.JWT_SECRET,
        // Access tokens are short-lived; the web client refreshes on 401 using the
        // rotating refresh cookie. Other tokens set their own expiry.
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController, CompanyAuthController ],
  exports: [AuthService]
})

export class AuthModule { }
