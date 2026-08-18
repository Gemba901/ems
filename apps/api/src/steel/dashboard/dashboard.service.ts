import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Steel Operations home — recent activity feed. Unions the six P01-P06
 * activity-log tables (there is no single combined audit table) so the
 * frontend doesn't have to fetch and merge every process's own log.
 */
@Injectable()
export class SteelDashboardService {
  constructor(private prisma: PrismaService) {}

  async getRecentActivity(organizationId: string, limit = 10) {
    const [
      planLogs,
      sourcingLogs,
      intakeLogs,
      chargeLogs,
      meltingLogs,
      heatApprovalLogs,
    ] = await this.prisma.$transaction([
        this.prisma.steelPlanActivityLog.findMany({
          where: { plan: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            plan: { select: { id: true, planNumber: true } },
          },
        }),
        this.prisma.steelSourcingActivityLog.findMany({
          where: { order: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            order: { select: { id: true, sourcingNumber: true } },
          },
        }),
        this.prisma.steelMaterialIntakeActivityLog.findMany({
          where: { intake: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            intake: { select: { id: true, intakeNumber: true } },
          },
        }),
        this.prisma.steelChargePreparationActivityLog.findMany({
          where: { chargePreparation: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            chargePreparation: { select: { id: true, prepNumber: true } },
          },
        }),
        this.prisma.steelMeltingActivityLog.findMany({
          where: { melting: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            melting: { select: { id: true, heatInProcessNumber: true } },
          },
        }),
        this.prisma.steelHeatApprovalActivityLog.findMany({
          where: { heatApproval: { organizationId } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            activity: true,
            notes: true,
            createdAt: true,
            performedBy: { select: { firstName: true, lastName: true } },
            heatApproval: { select: { id: true, approvalNumber: true } },
          },
        }),
      ]);

    const combined = [
      ...planLogs.map((l) => ({
        id: `plan-${l.id}`,
        process: 'P01',
        activity: l.activity,
        reference: l.plan.planNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p01/${l.plan.id}`,
      })),
      ...sourcingLogs.map((l) => ({
        id: `sourcing-${l.id}`,
        process: 'P02',
        activity: l.activity,
        reference: l.order.sourcingNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p02/${l.order.id}`,
      })),
      ...intakeLogs.map((l) => ({
        id: `intake-${l.id}`,
        process: 'P03',
        activity: l.activity,
        reference: l.intake.intakeNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p03/${l.intake.id}`,
      })),
      ...chargeLogs.map((l) => ({
        id: `charge-${l.id}`,
        process: 'P04',
        activity: l.activity,
        reference: l.chargePreparation.prepNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p04/${l.chargePreparation.id}`,
      })),
      ...meltingLogs.map((l) => ({
        id: `melting-${l.id}`,
        process: 'P05',
        activity: l.activity,
        reference: l.melting.heatInProcessNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p05/${l.melting.id}`,
      })),
      ...heatApprovalLogs.map((l) => ({
        id: `heat-approval-${l.id}`,
        process: 'P06',
        activity: l.activity,
        reference: l.heatApproval.approvalNumber,
        performedBy: `${l.performedBy.firstName} ${l.performedBy.lastName}`,
        notes: l.notes,
        createdAt: l.createdAt,
        href: `/steel/p06/${l.heatApproval.id}`,
      })),
    ];

    return combined
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
