import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { MonitoringExecutionSource } from '../monitoring-control/monitoring-control.execution-source';
import { loadActor } from '../monitoring-control/monitoring-scope';
import type {
  ActionFacts,
  OfficialValue,
  PeriodTarget,
  ReviewablePlan,
} from '../common/contracts';
import type { DevelopmentActor, People } from './development-scope';

const ACTIVE = ['ACTIVE', 'PROBATION'];

/**
 * Area 06's only door to other areas: plans (03), actions (04) and verified
 * results (04 via 05) through Area 05's execution source; people from core
 * Employee records. Read-only — Area 06 never changes another area's data.
 */
@Injectable()
export class ReviewsDevelopmentSources {
  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: MonitoringExecutionSource,
  ) {}

  actor(user: AccessTokenPayload): Promise<DevelopmentActor> {
    return loadActor(this.prisma, user);
  }

  async people(organizationId: string): Promise<People> {
    const rows = await this.prisma.employee.findMany({
      where: { organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        reportingManagerId: true,
        employmentStatus: true,
      },
    });
    return new Map(
      rows.map((e) => [
        e.id,
        {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          departmentId: e.departmentId ?? null,
          managerId: e.reportingManagerId ?? null,
          active: ACTIVE.includes(e.employmentStatus),
        },
      ]),
    );
  }

  plans(organizationId: string): Promise<ReviewablePlan[]> {
    return this.execution.listReviewablePlans(organizationId);
  }

  actions(organizationId: string): Promise<ActionFacts[]> {
    return this.execution.listActionFacts(organizationId);
  }

  official(
    organizationId: string,
    assignmentIds: string[],
  ): Promise<OfficialValue[]> {
    return assignmentIds.length
      ? this.execution.listOfficial(organizationId, assignmentIds)
      : Promise.resolve([]);
  }

  targets(
    organizationId: string,
    assignmentId: string,
    ref: { documentId: string; version: number },
  ): Promise<PeriodTarget[]> {
    return this.execution.getPeriodTargets(organizationId, assignmentId, ref);
  }
}
