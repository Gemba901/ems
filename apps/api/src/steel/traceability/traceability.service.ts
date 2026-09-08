import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * P06 -> P01 traceability. Resolves the full upstream chain for a given
 * heat number, read-only, org-scoped at the root (SteelHeatApproval); every
 * relation below it is reached strictly by FK from that org-scoped record,
 * so no independent org filter is needed on the nested lookups.
 *
 * Upstream links are optional in the response, not required — a heat with
 * no charge material lots selected yet (or, in principle, any other
 * not-yet-populated link) degrades to an empty/null section rather than
 * throwing.
 */
@Injectable()
export class TraceabilityService {
  constructor(private prisma: PrismaService) {}

  async getHeatTraceability(heatNumber: string, organizationId: string) {
    const heatApproval = await this.prisma.steelHeatApproval.findFirst({
      where: { heatNumber, organizationId },
      select: {
        id: true,
        approvalNumber: true,
        heatNumber: true,
        stage: true,
        status: true,
        releasedToCastingAt: true,
        createdAt: true,
        melting: {
          select: {
            id: true,
            heatInProcessNumber: true,
            stage: true,
            status: true,
            handoverToRefiningAt: true,
            createdAt: true,
            chargePreparation: {
              select: {
                id: true,
                prepNumber: true,
                chargeNumber: true,
                stage: true,
                status: true,
                chargeReleasedAt: true,
                createdAt: true,
                plan: {
                  select: {
                    id: true,
                    planNumber: true,
                    stage: true,
                    status: true,
                    createdAt: true,
                  },
                },
                materialLots: {
                  select: {
                    id: true,
                    createdAt: true,
                    intake: {
                      select: {
                        id: true,
                        intakeNumber: true,
                        stage: true,
                        status: true,
                        heatNumber: true,
                        stockReleasedAt: true,
                        createdAt: true,
                        sourcingOrder: {
                          select: {
                            id: true,
                            sourcingNumber: true,
                            stage: true,
                            status: true,
                            handoverClosedAt: true,
                            createdAt: true,
                            plan: {
                              select: {
                                id: true,
                                planNumber: true,
                                stage: true,
                                status: true,
                                createdAt: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!heatApproval) {
      throw new NotFoundException(
        `No heat approval record found for heat number "${heatNumber}"`,
      );
    }

    const chargePreparation = heatApproval.melting?.chargePreparation ?? null;

    return {
      heatApproval: {
        id: heatApproval.id,
        approvalNumber: heatApproval.approvalNumber,
        heatNumber: heatApproval.heatNumber,
        stage: heatApproval.stage,
        status: heatApproval.status,
        releasedToCastingAt: heatApproval.releasedToCastingAt,
        createdAt: heatApproval.createdAt,
      },
      melting: heatApproval.melting
        ? {
            id: heatApproval.melting.id,
            heatInProcessNumber: heatApproval.melting.heatInProcessNumber,
            stage: heatApproval.melting.stage,
            status: heatApproval.melting.status,
            handoverToRefiningAt: heatApproval.melting.handoverToRefiningAt,
            createdAt: heatApproval.melting.createdAt,
          }
        : null,
      chargePreparation: chargePreparation
        ? {
            id: chargePreparation.id,
            prepNumber: chargePreparation.prepNumber,
            chargeNumber: chargePreparation.chargeNumber,
            stage: chargePreparation.stage,
            status: chargePreparation.status,
            chargeReleasedAt: chargePreparation.chargeReleasedAt,
            createdAt: chargePreparation.createdAt,
          }
        : null,
      materialIntakes: (chargePreparation?.materialLots ?? []).map((lot) => ({
        id: lot.intake.id,
        intakeNumber: lot.intake.intakeNumber,
        stage: lot.intake.stage,
        status: lot.intake.status,
        heatNumber: lot.intake.heatNumber,
        stockReleasedAt: lot.intake.stockReleasedAt,
        createdAt: lot.intake.createdAt,
        sourcingOrder: {
          id: lot.intake.sourcingOrder.id,
          sourcingNumber: lot.intake.sourcingOrder.sourcingNumber,
          stage: lot.intake.sourcingOrder.stage,
          status: lot.intake.sourcingOrder.status,
          handoverClosedAt: lot.intake.sourcingOrder.handoverClosedAt,
          createdAt: lot.intake.sourcingOrder.createdAt,
          productionPlan: lot.intake.sourcingOrder.plan
            ? {
                id: lot.intake.sourcingOrder.plan.id,
                planNumber: lot.intake.sourcingOrder.plan.planNumber,
                stage: lot.intake.sourcingOrder.plan.stage,
                status: lot.intake.sourcingOrder.plan.status,
                createdAt: lot.intake.sourcingOrder.plan.createdAt,
              }
            : null,
        },
      })),
      // The charge preparation's own production plan (P04 -> P01 directly).
      // Usually the same plan referenced by each sourcing order above, but
      // recorded independently since SteelChargePreparation carries its own
      // planId in the schema.
      productionPlan: chargePreparation?.plan
        ? {
            id: chargePreparation.plan.id,
            planNumber: chargePreparation.plan.planNumber,
            stage: chargePreparation.plan.stage,
            status: chargePreparation.plan.status,
            createdAt: chargePreparation.plan.createdAt,
          }
        : null,
    };
  }
}
