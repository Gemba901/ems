import { SetMetadata } from "@nestjs/common";
import { Role } from "src/common/enum/role.enum";

export const ROLES_KEY = 'roles';

// custom decorator to specify required roles for route handlers
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);