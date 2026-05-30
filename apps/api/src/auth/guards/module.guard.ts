import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ModuleType } from "db";
import { MODULE_KEY } from "../decorators/module.decorator";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ModuleGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredModule = this.reflector.getAllAndOverride<ModuleType>(MODULE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredModule) return true;

        const { user } = context.switchToHttp().getRequest();
        if (!user?.organizationId) return false;

        const org = await this.prisma.organization.findUnique({
            where: { id: user.organizationId },
            select: { modules: true, isAdminOrg: true },
        });

        if (!org) return false;
        if (org.isAdminOrg) return true;

        if (!org.modules.includes(requiredModule)) {
            throw new ForbiddenException(`Module ${requiredModule} is not enabled for your organization`);
        }

        return true;
    }
}
