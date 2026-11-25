import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from 'db';
import type { AccessTokenPayload } from '../../../auth/access-token-payload';
import { PrismaService } from '../../../prisma/prisma.service';
import { emptyPlanningState } from '../../performance-planning/planning.seed';
import {
  applyLibraryCommand,
  approvedPlanningLibrary,
  libraryApproverRoles,
  libraryView,
  readLibraryState,
} from './library.rules';
import type { LibraryCommand, LibraryContext } from './library.types';

export function libraryToday(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

@Injectable()
export class PerformanceIntelligenceLibraryService {
  constructor(private readonly db: PrismaService) {}

  private async context(
    user: AccessTokenPayload,
    db: Pick<PrismaService, 'organization' | 'userOrganization'> = this.db,
  ): Promise<LibraryContext> {
    if (!user.organizationId || !user.userId)
      throw new ForbiddenException(
        'A signed-in organisation account is required.',
      );
    const [organization, member, approvers] = await Promise.all([
      db.organization.findUnique({
        where: { id: user.organizationId },
        select: { timeZone: true },
      }),
      db.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: user.userId,
            organizationId: user.organizationId,
          },
        },
        select: {
          user: { select: { name: true } },
          role: { select: { name: true } },
        },
      }),
      db.userOrganization.findMany({
        where: {
          organizationId: user.organizationId,
          role: { name: { in: [...libraryApproverRoles] } },
        },
        select: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
    ]);
    if (!organization || !member)
      throw new ForbiddenException(
        'This account does not belong to the selected organisation.',
      );
    const at = new Date();
    return {
      actor: {
        userId: user.userId,
        name: member.user.name,
        role: member.role.name,
      },
      approvers: approvers.map((entry) => entry.user),
      at: at.toISOString(),
      today: libraryToday(organization.timeZone, at),
    };
  }

  async getLibrary(user: AccessTokenPayload) {
    const context = await this.context(user);
    const row = await this.db.lexPlanningWorkspace.findUnique({
      where: { organizationId: user.organizationId },
      select: { revision: true, state: true },
    });
    return libraryView(
      row ? readLibraryState(row.state) : emptyPlanningState(),
      row?.revision || 0,
      context,
    );
  }

  /** Area 03 receives only currently effective approved versions, never working drafts or examples. */
  async getApprovedPlanningLibrary(organizationId: string) {
    const [organization, row] = await Promise.all([
      this.db.organization.findUnique({
        where: { id: organizationId },
        select: { timeZone: true },
      }),
      this.db.lexPlanningWorkspace.findUnique({
        where: { organizationId },
        select: { state: true },
      }),
    ]);
    if (!organization || !row) return null;
    return approvedPlanningLibrary(
      readLibraryState(row.state),
      libraryToday(organization.timeZone),
    );
  }

  async command(user: AccessTokenPayload, command: LibraryCommand) {
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0 ||
      !command.payload ||
      typeof command.payload !== 'object' ||
      Array.isArray(command.payload)
    )
      throw new BadRequestException(
        'Supply a workspace revision and command payload.',
      );
    // Reject non-members before creating an empty workspace. Recheck roles under the transaction too.
    await this.context(user);
    return this.db.$transaction(
      async (tx) => {
        await tx.lexPlanningWorkspace.upsert({
          where: { organizationId: user.organizationId },
          create: {
            organizationId: user.organizationId,
            state: emptyPlanningState() as unknown as Prisma.InputJsonValue,
          },
          update: {},
        });
        // Same lock order and revision namespace as Area 03 and execution.
        await tx.$queryRaw`SELECT "organizationId" FROM "LexPlanningWorkspace" WHERE "organizationId" = ${user.organizationId} FOR UPDATE`;
        const row = await tx.lexPlanningWorkspace.findUnique({
          where: { organizationId: user.organizationId },
        });
        if (!row || row.revision !== command.expectedRevision)
          throw new ConflictException(
            'The planning library changed. Refresh before saving; your form entries have not been discarded.',
          );
        const context = await this.context(user, tx);
        const state = readLibraryState(row.state);
        const focusId = applyLibraryCommand(state, command, context);
        if (JSON.stringify(state).length > 12000000)
          throw new BadRequestException(
            'This workspace exceeds the supported planning size.',
          );
        const saved = await tx.lexPlanningWorkspace.updateMany({
          where: {
            organizationId: user.organizationId,
            revision: row.revision,
          },
          data: {
            state: state as unknown as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
        if (saved.count !== 1)
          throw new ConflictException(
            'The library changed while saving. Refresh before retrying.',
          );
        return { ...libraryView(state, row.revision + 1, context), focusId };
      },
      { timeout: 30000 },
    );
  }
}
