import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  isAccessTokenPayload,
  type AccessTokenPayload,
} from './access-token-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // Passport verifies the signature and expiry before validate().
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,

      // Match the symmetric signing algorithm used by this application.
      algorithms: ['HS256'],
    });
  }

  validate(payload: unknown): AccessTokenPayload {
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid API access token.');
    }

    // Return only the claims needed by request authorization.
    // Passport assigns this object to request.user.
    return {
      tokenType: payload.tokenType,
      userId: payload.userId,
      organizationId: payload.organizationId,
      roleId: payload.roleId,
      roleLevel: payload.roleLevel,
      email: payload.email,
      isAdminOrg: payload.isAdminOrg,
    };
  }
}