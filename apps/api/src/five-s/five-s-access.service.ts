import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSResponsibility, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { localDateIn } from 'src/work/work-date';

// Who may do what in the 5S module.
//
// - Module administrators: SUPER_ADMIN / ADMIN, or anyone given the 5S ADMIN responsibility.
//   They manage every area, assign responsibilities and see everything.
// - Management viewers: MANAGEMENT, or the 5S VIEWER responsibility. Read-only, company-wide.
// - Auditors (5S AUDITOR) audit any active area. Verifiers (5S VERIFIER) verify actions and
//   review red tags in any area. Both see the whole company.
// - HODs manage, audit and verify areas in their own department.
// - Area owners maintain their area's standards and routines, plan actions and review red tags.
// - Everyone else sees areas in their own department and the records assigned to them.
// Nobody verifies an action they own.

export const MODULE_ADMIN_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.ADMIN];
export const COMPANY_VIEWER_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

export type FiveSActor = {
    employeeId: string;
    departmentId: string | null;
    organizationId: string;
    role: Role;
    timeZone: string;
    responsibilities: FiveSResponsibility[];
};

export type AreaScope = { id: string; departmentId: string | null; ownerId: string | null; isActive: boolean };

@Injectable()
export class FiveSAccessService {
    constructor(private prisma: PrismaService) {}

    // Identity always comes from the token, never from a request body.
    async resolveActor(user: AccessTokenPayload): Promise<FiveSActor> {
        const employee = await this.prisma.employee.findFirst({
            where: { userId: user.userId, organizationId: user.organizationId },
            select: {
                id: true,
                departmentId: true,
                organization: { select: { timeZone: true } },
                fiveSResponsibilities: { select: { responsibility: true } },
            },
        });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');
        return {
            employeeId: employee.id,
            departmentId: employee.departmentId,
            organizationId: user.organizationId,
            role: user.roleLevel,
            timeZone: employee.organization.timeZone,
            responsibilities: employee.fiveSResponsibilities.map((r) => r.responsibility),
        };
    }

    today(actor: FiveSActor): string {
        return localDateIn(new Date(), actor.timeZone);
    }

    has(actor: FiveSActor, responsibility: FiveSResponsibility): boolean {
        return actor.responsibilities.includes(responsibility);
    }

    isModuleAdmin(actor: FiveSActor): boolean {
        return MODULE_ADMIN_ROLES.includes(actor.role) || this.has(actor, FiveSResponsibility.ADMIN);
    }

    seesWholeCompany(actor: FiveSActor): boolean {
        return (
            this.isModuleAdmin(actor) ||
            COMPANY_VIEWER_ROLES.includes(actor.role) ||
            this.has(actor, FiveSResponsibility.VIEWER) ||
            this.has(actor, FiveSResponsibility.AUDITOR) ||
            this.has(actor, FiveSResponsibility.VERIFIER)
        );
    }

    isDepartmentHead(actor: FiveSActor, area: Pick<AreaScope, 'departmentId'>): boolean {
        return actor.role === Role.HOD && !!actor.departmentId && area.departmentId === actor.departmentId;
    }

    // Areas the actor can see. Records inside an area follow the area's visibility,
    // plus the records assigned to the actor personally.
    visibleAreaWhere(actor: FiveSActor): Prisma.FiveSAreaWhereInput {
        if (this.seesWholeCompany(actor)) return { organizationId: actor.organizationId };
        const me = actor.employeeId;
        return {
            organizationId: actor.organizationId,
            OR: [
                ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []),
                { ownerId: me },
                { actions: { some: { ownerId: me } } },
                { actions: { some: { correctiveActions: { some: { ownerId: me } } } } },
                { redTags: { some: { ownerId: me } } },
                { routines: { some: { responsibleId: me } } },
                { audits: { some: { auditorId: me } } },
            ],
        };
    }

    async areaOrThrow(actor: FiveSActor, areaId: string): Promise<AreaScope & { name: string }> {
        const area = await this.prisma.fiveSArea.findFirst({
            where: { AND: [{ id: areaId }, this.visibleAreaWhere(actor)] },
            select: { id: true, name: true, departmentId: true, ownerId: true, isActive: true },
        });
        // 404 rather than 403 so we never reveal that a hidden area exists.
        if (!area) throw new NotFoundException('Workplace area not found');
        return area;
    }

    canCreateAreas(actor: FiveSActor): boolean {
        return this.isModuleAdmin(actor) || (actor.role === Role.HOD && !!actor.departmentId);
    }

    canManageArea(actor: FiveSActor, area: Pick<AreaScope, 'departmentId'>): boolean {
        return this.isModuleAdmin(actor) || this.isDepartmentHead(actor, area);
    }

    canAudit(actor: FiveSActor, area: Pick<AreaScope, 'departmentId'>): boolean {
        return this.canManageArea(actor, area) || this.has(actor, FiveSResponsibility.AUDITOR);
    }

    // Plan actions (owner, due date, corrective action) and review red tags.
    canCoordinateArea(actor: FiveSActor, area: Pick<AreaScope, 'departmentId' | 'ownerId'>): boolean {
        return (
            this.canManageArea(actor, area) ||
            area.ownerId === actor.employeeId ||
            this.has(actor, FiveSResponsibility.VERIFIER)
        );
    }

    canVerifyAction(actor: FiveSActor, area: Pick<AreaScope, 'departmentId' | 'ownerId'>, actionOwnerId: string | null): boolean {
        if (actionOwnerId === actor.employeeId) return false;
        return this.canCoordinateArea(actor, area);
    }

    // Draft standards and maintain routines.
    canMaintainAreaStandards(actor: FiveSActor, area: Pick<AreaScope, 'departmentId' | 'ownerId'>): boolean {
        return this.canManageArea(actor, area) || area.ownerId === actor.employeeId;
    }

    canApproveStandards(actor: FiveSActor, area: Pick<AreaScope, 'departmentId'>): boolean {
        return this.canManageArea(actor, area);
    }

    // Management viewers read company-wide but only act in areas they belong to.
    isViewOnly(actor: FiveSActor, area: Pick<AreaScope, 'departmentId' | 'ownerId'>): boolean {
        const viewer = actor.role === Role.MANAGEMENT || this.has(actor, FiveSResponsibility.VIEWER);
        if (!viewer) return false;
        const belongs = !!actor.departmentId && area.departmentId === actor.departmentId;
        return !belongs && !this.canAudit(actor, area) && !this.canCoordinateArea(actor, area);
    }

    assertModuleAdmin(actor: FiveSActor): void {
        if (!this.isModuleAdmin(actor)) throw new ForbiddenException('Only 5S administrators can do this');
    }

    async assertCompanyEmployees(organizationId: string, ids: (string | null | undefined)[]): Promise<void> {
        const unique = [...new Set(ids.filter((id): id is string => !!id))];
        if (unique.length === 0) return;
        const count = await this.prisma.employee.count({ where: { id: { in: unique }, organizationId } });
        if (count !== unique.length) throw new ForbiddenException('One or more people are not in your company');
    }

    async assertCompanyDepartment(organizationId: string, departmentId: string | null | undefined): Promise<void> {
        if (!departmentId) return;
        const count = await this.prisma.department.count({ where: { id: departmentId, organizationId } });
        if (count !== 1) throw new ForbiddenException('That department is not in your company');
    }

    capabilities(actor: FiveSActor) {
        return {
            isModuleAdmin: this.isModuleAdmin(actor),
            seesWholeCompany: this.seesWholeCompany(actor),
            canCreateAreas: this.canCreateAreas(actor),
            isAuditor: this.has(actor, FiveSResponsibility.AUDITOR),
            isVerifier: this.has(actor, FiveSResponsibility.VERIFIER),
            responsibilities: actor.responsibilities,
            role: actor.role,
            employeeId: actor.employeeId,
            departmentId: actor.departmentId,
            today: this.today(actor),
        };
    }
}
