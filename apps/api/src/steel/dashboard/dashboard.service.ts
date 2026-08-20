import { Injectable } from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';

// Average cycle time (creation -> completion, in hours) for one Steel
// process table, computed in SQL rather than pulled into memory.
async function avgCycleHours(
  prisma: PrismaService,
  table: string,
  organizationId: string,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ avg_hours: number | null }[]>(
    Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 3600.0) AS avg_hours
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE "organizationId" = ${organizationId} AND status = 'CLOSED'
    `,
  );
  const value = rows[0]?.avg_hours;
  return value === null || value === undefined ? null : Number(value);
}

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

  /**
   * Cross-process Steel KPIs, computed with SQL aggregation (`$queryRaw` /
   * `groupBy`) rather than loading whole tables into memory.
   */
  async getKpis(organizationId: string) {
    const [
      kwhPerTonneRows,
      correctionRows,
      p01CycleHours,
      p02CycleHours,
      p03CycleHours,
      p04CycleHours,
      p05CycleHours,
      p06CycleHours,
      liningLife,
    ] = await Promise.all([
      // (a) average kWh/tonne for melting — only over heats with both a
      // recorded power reading and a recorded output weight.
      this.prisma.$queryRaw<{ avg_kwh_per_tonne: number | null }[]>(
        Prisma.sql`
          SELECT AVG("powerKwh" / NULLIF("outputWeightTonnes", 0)) AS avg_kwh_per_tonne
          FROM "SteelMelting"
          WHERE "organizationId" = ${organizationId}
            AND "powerKwh" IS NOT NULL
            AND "outputWeightTonnes" IS NOT NULL
        `,
      ),
      // (b) average chemistry-correction count per heat — proxy via how
      // many times P06-A05 (add correction material) was logged per heat
      // approval record. See heat-approval.service.ts's `correctionAttempts`
      // field for the authoritative per-heat counter surfaced below.
      this.prisma.$queryRaw<{ avg_corrections: number | null }[]>(
        Prisma.sql`
          SELECT AVG(cnt) AS avg_corrections
          FROM (
            SELECT l."heatApprovalId", COUNT(*) AS cnt
            FROM "SteelHeatApprovalActivityLog" l
            JOIN "SteelHeatApproval" ha ON ha.id = l."heatApprovalId"
            WHERE ha."organizationId" = ${organizationId} AND l.activity = 'A05'
            GROUP BY l."heatApprovalId"
          ) sub
        `,
      ),
      avgCycleHours(this.prisma, 'SteelProductionPlan', organizationId),
      avgCycleHours(this.prisma, 'SteelSourcingOrder', organizationId),
      avgCycleHours(this.prisma, 'SteelMaterialIntake', organizationId),
      avgCycleHours(this.prisma, 'SteelChargePreparation', organizationId),
      avgCycleHours(this.prisma, 'SteelMelting', organizationId),
      avgCycleHours(this.prisma, 'SteelHeatApproval', organizationId),
      // (d) lining-life proxy: heats per furnace since the current lining
      // campaign started. There is no dedicated "lining reset" event/field
      // in the schema — `liningCampaignId` (SteelMelting) is a free-text
      // operator-entered campaign identifier, not a reset timestamp or
      // counter, so this groups by the two fields that do exist
      // (furnaceId, liningCampaignId) as the closest available proxy. If a
      // real lining-reset field is added later, replace this grouping with
      // a direct count against it.
      this.prisma.steelMelting.groupBy({
        by: ['furnaceId', 'liningCampaignId'],
        where: {
          organizationId,
          furnaceId: { not: null },
          liningCampaignId: { not: null },
        },
        _count: true,
      }),
    ]);

    const correctionAttemptsAvg = await this.prisma.steelHeatApproval
      .aggregate({
        where: { organizationId },
        _avg: { correctionAttempts: true },
      })
      .then((r) => r._avg.correctionAttempts);

    return {
      avgKwhPerTonne: kwhPerTonneRows[0]?.avg_kwh_per_tonne ?? null,
      avgChemistryCorrectionsPerHeat: {
        // Proxy computed from the activity log — how many times P06-A05
        // (add correction material) was logged per heat approval record.
        // Kept alongside the authoritative field below since the log-based
        // proxy also counts a heat's very first (non-looped) correction
        // pass, while `correctionAttempts` only counts loop-backs.
        fromActivityLog: correctionRows[0]?.avg_corrections ?? null,
        // Authoritative per-heat loop counter — see
        // heat-approval.service.ts's `correctionAttempts` field, capped by
        // MAX_CORRECTION_ATTEMPTS. Null until any heat has looped.
        correctionAttempts: correctionAttemptsAvg,
      },
      avgCycleTimeHoursByStage: {
        p01: p01CycleHours,
        p02: p02CycleHours,
        p03: p03CycleHours,
        p04: p04CycleHours,
        p05: p05CycleHours,
        p06: p06CycleHours,
      },
      liningLifeByFurnace: liningLife.map((row) => ({
        furnaceId: row.furnaceId,
        liningCampaignId: row.liningCampaignId,
        heatsSinceCampaignStart: row._count,
      })),
    };
  }
}
