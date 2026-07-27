import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET!,
        });
    }

    async validate(payload: any) {
        // block first time setup tokens from accessing normal routes
        if (payload.purpose === 'FIRST_TIME_SETUP') {
            throw new UnauthorizedException('This token cannot be used for api access.');
        }
        return { userId: payload.userId, email: payload.email, organizationId: payload.organizationId, roleId: payload.roleId, roleLevel: payload.roleLevel, isAdminOrg: payload.isAdminOrg };
    }
}