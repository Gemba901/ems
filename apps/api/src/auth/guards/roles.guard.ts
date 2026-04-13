import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { Role } from "src/common/enum/role.enum";
import { Observable } from "rxjs";

@Injectable()
export class RolesGuard implements CanActivate {
    // reflector is used to read the metadata set by the @Roles decorator
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        // get the required roles from the route handler's metadata

        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // if no roles are required, allow access
        if (!requiredRoles) {
            return true;
        }

        // get the user object injected by the JwtStrategy
        const { user } = context.switchToHttp().getRequest();

        // if no user is found, deny access
        if (!user) {
            return false;
        }

        // check if the user's role is included in the required roles
        return requiredRoles.includes(user.roleId);
    }

}