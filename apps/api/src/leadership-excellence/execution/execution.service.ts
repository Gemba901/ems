import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import {
  applyExecutionCommand,
  verifyExecutionResult,
} from './execution.rules';
import {
  emptyExecutionState,
  projectExecution,
} from './execution.projection';
import type {
  ExecutionCommand,
  ExecutionState,
  ExecutionView,
} from './execution.types';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly db: PrismaService,
    private readonly planning: PerformancePlanningService,
  ) {}

  private readState(value: unknown): ExecutionState {
    if (!value) return emptyExecutionState();
    const data = value as ExecutionState;
    if (
      data.schema !== 1 ||
      !Array.isArray(data.results) ||
      !Array.isArray(data.actionUpdates) ||
      !Array.isArray(data.supportRequests)
    )
      throw new ConflictException(
        'The execution data needs an updated application version.',
      );
    return structuredClone(data);
  }
  private rethrow(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    )
      throw new ServiceUnavailableException(
        'Performance execution storage is not installed. Apply the Area 04 database migration.',
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2002'].includes(error.code)
    )
      throw new ConflictException(
        'Another update was saved. Refresh the workspace before trying again; your entries have not been submitted.',
      );
    throw error;
  }
  async getWorkspace(user: AccessTokenPayload): Promise<ExecutionView> {
    try {
      const [source, stored] = await Promise.all([
        this.planning.getExecutionSource(user),
        this.db.lexExecutionWorkspace.findUnique({
          where: { organizationId: user.organizationId },
        }),
      ]);
      return projectExecution(
        source,
        this.readState(stored?.state),
        stored?.revision || 0,
      );
    } catch (error) {
      return this.rethrow(error);
    }
  }

  private async mutate(
    user: AccessTokenPayload,
    expectedRevision: number,
    apply: (state: ExecutionState, view: ExecutionView) => void,
  ): Promise<ExecutionView> {
    const source = await this.planning.getExecutionSource(user);
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Area 03 takes the same lock before changing action/plan definitions.
          // This guards the permission and approved-snapshot decision against a race.
          const locks = await tx.$queryRaw<{ revision: number }[]>`
          SELECT "revision" FROM "LexPlanningWorkspace"
          WHERE "organizationId" = ${user.organizationId} FOR UPDATE`;
          if (!locks.length || locks[0].revision !== source.revision)
            throw new ConflictException(
              'The approved plan changed. Refresh the workspace before saving.',
            );
          const row = await tx.lexExecutionWorkspace.upsert({
            where: { organizationId: user.organizationId },
            update: {},
            create: {
              organizationId: user.organizationId,
              state: emptyExecutionState() as unknown as Prisma.InputJsonValue,
            },
          });
          if (row.revision !== expectedRevision)
            throw new ConflictException(
              'Execution records changed while this form was open. Your entries are still here; refresh and review them before saving.',
            );
          const state = this.readState(row.state);
          const view = projectExecution(source, state, row.revision);
          apply(state, view);
          const updated = await tx.lexExecutionWorkspace.updateMany({
            where: {
              organizationId: user.organizationId,
              revision: expectedRevision,
            },
            data: {
              revision: { increment: 1 },
              state: state as unknown as Prisma.InputJsonValue,
            },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              'Another user saved an update. Refresh before saving your entries.',
            );
          return projectExecution(source, state, expectedRevision + 1);
        },
        { maxWait: 5000, timeout: 15000 },
      );
    } catch (error) {
      return this.rethrow(error);
    }
  }

  command(user: AccessTokenPayload, command: ExecutionCommand) {
    return this.mutate(user, command.expectedRevision, (state, view) =>
      applyExecutionCommand(state, command, view),
    );
  }

  /** Area 05 consumes the same submitted records, never copies result rows. */
  async submissions(user: AccessTokenPayload) {
    const view = await this.getWorkspace(user);
    const assignments = view.assignments.filter((a) => a.canVerify);
    const keys = new Set(assignments.map((a) => a.key));
    return {
      revision: view.revision,
      planningRevision: view.planningRevision,
      assignments,
      results: view.results.filter(
        (r) => r.status === 'SUBMITTED' && keys.has(r.assignmentKey),
      ),
    };
  }

  /** Shared verification mutation for Area 05 consumers. */
  verify(
    user: AccessTokenPayload,
    expectedRevision: number,
    resultId: string,
    decision: 'VERIFY' | 'RETURN',
    note: string,
  ) {
    return this.mutate(user, expectedRevision, (state, view) =>
      verifyExecutionResult(state, view, resultId, decision, note),
    );
  }
}
