import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import { MONITORING_ORG_WIDE } from './monitoring-control.roles';

const ACTIVE_STATUSES = ['ACTIVE', 'PROBATION'] as const;

/** Who is calling, resolved once per request from core Employee records. */
export interface MonitoringActor {
  organizationId: string;
  role: Role;
  /** null for e.g. a SUPER_ADMIN with no Employee row in this company. */
  employeeId: string | null;
  departmentId: string | null;
  active: boolean;
  /** Employee ids whose reportingManagerId is the caller. */
  reportIds: Set<string>;
}

export async function loadActor(
  prisma: PrismaService,
  user: AccessTokenPayload,
): Promise<MonitoringActor> {
  const me = await prisma.employee.findFirst({
    where: { userId: user.userId, organizationId: user.organizationId },
    select: { id: true, departmentId: true, employmentStatus: true },
  });
  const reports = me
    ? await prisma.employee.findMany({
        where: {
          organizationId: user.organizationId,
          reportingManagerId: me.id,
        },
        select: { id: true },
      })
    : [];
  return {
    organizationId: user.organizationId,
    role: user.roleLevel,
    employeeId: me?.id ?? null,
    departmentId: me?.departmentId ?? null,
    active:
      !!me &&
      (ACTIVE_STATUSES as readonly string[]).includes(me.employmentStatus),
    reportIds: new Set(reports.map((r) => r.id)),
  };
}

export const isOrgWide = (actor: MonitoringActor) =>
  MONITORING_ORG_WIDE.includes(actor.role);

/**
 * Whether the caller may see a KPI assignment's results:
 * org-wide roles; the HOD of its department; its owner, provider or verifier;
 * the owner's reporting manager.
 */
export function canSeeAssignment(
  actor: MonitoringActor,
  a: {
    departmentId: string | null;
    ownerId: string;
    providerId: string;
    verifierId: string;
  },
): boolean {
  if (isOrgWide(actor)) return true;
  if (
    actor.role === Role.HOD &&
    actor.departmentId &&
    a.departmentId === actor.departmentId
  ) {
    return true;
  }
  const me = actor.employeeId;
  if (!me) return false;
  return (
    a.ownerId === me ||
    a.providerId === me ||
    a.verifierId === me ||
    actor.reportIds.has(a.ownerId)
  );
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
